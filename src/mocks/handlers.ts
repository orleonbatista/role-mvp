import { delay, http, HttpResponse } from 'msw'
import { db } from '../db/db'
import type {
  Answer, AnswerDTO, Criteria, DiaryEntry, EventSubmission, Feedback, FeedItem, Lead, Person, Place, PlaceDetail, Profile, RequestDetail, Review,
  RoleRequest, Verdict, Vote, VoteTally,
} from '../lib/types'
import { confidenceOf, introFor, parseRequest, rank, timeOptions, unmetFor } from './ranker'
import { refineWithLLM } from './llm'
import { people } from './seeds/people'
import { isCurated, placeById, places } from './seeds/places'
import { KIND_LABEL, nicheLabel, occasionLabel } from '../lib/labels'
import { DAY_SHORT, kmTo } from '../lib/hours'
import { approveLocally, fitOf, isPast, sanitizeDraft } from './extraEvents'
import * as remote from './remote'
import { track } from '../lib/track'
import { moderationRules } from './llmPrompt'
import { rememberPlace } from './gplaces'
import { discoverForRequest } from '../lib/gdiscover'
import { snapOf } from '../lib/places'

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const latency = () => delay(160 + Math.random() * 200)
const notFound = () => HttpResponse.json({ error: 'not_found' }, { status: 404 })

const getProfile = () => db.profile.get('me')

async function personById(id: string, req?: RoleRequest): Promise<Person> {
  if (id === 'me') {
    const p = await getProfile()
    if (p) return p
  }
  if (req?.externalAuthor) {
    const { name, hue } = req.externalAuthor
    return { id, name, handle: '@' + name.toLowerCase().split(' ')[0], hue, curatorOf: [], reputation: 0 }
  }
  return people.find((u) => u.id === id) ?? { id, name: 'Alguém', handle: '@alguem', hue: 0, curatorOf: [], reputation: 0 }
}

async function analyze(text: string, overrides?: Partial<Criteria>) {
  let c = parseRequest(text)
  c.source = { engine: 'regras' }
  c = await refineWithLLM(text, c)
  for (const [k, v] of Object.entries(overrides ?? {})) if (v !== undefined && !(Array.isArray(v) && !v.length)) (c as any)[k] = v
  c.unmet = unmetFor(c, places)
  return c
}

/** Curadores simulados: só quem entende do assunto responde, com texto que cita a ocasião. */
function simulateAnswers(req: RoleRequest, profile: Profile | undefined): Answer[] {
  const ranked = rank(places.filter(isCurated), req.criteria, profile).filter((r) => r.score > 0)
  const top = ranked.slice(0, 3).map((r) => r.place.id)
  const pool = ranked.slice(1, 10)
  const topic = req.criteria.niches.length ? req.criteria.niches : ranked[0]?.place.niches ?? []
  const experts = people
    .map((u) => ({ u, fit: u.curatorOf.filter((n) => topic.includes(n)).length }))
    .filter((x) => x.fit > 0)
    .sort((a, b) => b.fit - a.fit || b.u.reputation - a.u.reputation)
    .slice(0, 3)
  const occ = req.criteria.occasion ? occasionLabel(req.criteria.occasion).toLowerCase() : 'esse tipo de rolê'
  const templates = [
    (n: string, h: string) => `Pra ${occ}, ${n}. O ponto alto é ${h}. Reserva antes que lota.`,
    (n: string, h: string) => `Já fiz ${occ} no ${n}: ${h}. Aposta certa.`,
    (n: string, h: string) => `Se quiser fugir do óbvio, ${n}. Vai pelo ${h}.`,
  ]
  const now = Date.now()
  const used = new Set<string>()
  return experts.flatMap(({ u }, i) => {
    const pick = pool.find((r) => !used.has(r.place.id) && r.place.niches.some((n) => u.curatorOf.includes(n)) && !top.includes(r.place.id))
      ?? pool.find((r) => !used.has(r.place.id) && r.place.niches.some((n) => u.curatorOf.includes(n)))
    if (!pick) return []
    used.add(pick.place.id)
    const pl = pick.place
    return [{
      id: uid('a'), requestId: req.id, userId: u.id, placeId: pl.id,
      comment: templates[(i + req.text.length) % templates.length](pl.name, pl.highlights[i % pl.highlights.length]),
      helpful: 0, createdAt: now + 2600 + i * 2900, visibleAt: now + 2600 + i * 2900,
    }]
  })
}

function tallyOf(votes: Vote[], ids: string[]): VoteTally[] {
  return ids.map((placeId) => {
    const vs = votes.filter((v) => v.placeId === placeId)
    return { placeId, count: vs.length, voters: vs.map((v) => v.voter) }
  })
}

/* ---------- curadoria em camadas ----------
   1º o que a comunidade curou (com encaixe bom); se não fecha 3, completa com o melhor que houver — inclusive
   lugares reais da base (OSM) "sem curadoria", que a tela marca e usa pra convidar a comunidade a curar. */
const CURATED_OK = 55
const live = (p: Place) => !(p.eventDate && isPast({ date: p.eventDate }))
function rankLayered(c: Criteria, profile: Profile | null | undefined, exclude = new Set<string>(), n = 3) {
  const cur = rank(places.filter((p) => isCurated(p) && live(p) && !exclude.has(p.id)), c, profile)
  const good = cur.filter((r) => r.match >= CURATED_OK)
  if (good.length >= n) return good.slice(0, n)
  const base = rank(places.filter((p) => !isCurated(p) && !exclude.has(p.id)), c, profile)
  return [...good, ...[...cur.filter((r) => r.match < CURATED_OK), ...base].sort((a, b) => b.match - a.match)].slice(0, n)
}

async function authorInfo() {
  const p = await getProfile()
  return { name: p?.name ?? 'Alguém', hue: p?.hue ?? 200 }
}

async function buildDetail(id: string): Promise<RequestDetail | null> {
  const request = await db.requests.get(id)
  if (!request) return null
  const profile = await getProfile()
  const author = await personById(request.authorId, request)
  const pinned = request.eventId ? placeById.get(request.eventId) : undefined
  const ranked = pinned
    ? [rank([pinned], request.criteria)[0], ...rankLayered(request.criteria, request.authorId === 'me' ? profile : null, new Set([pinned.id]), 2)]
    : rankLayered(request.criteria, request.authorId === 'me' ? profile : null)
  const now = Date.now()
  const all = await db.answers.where('requestId').equals(id).toArray()
  const visible = all.filter((a) => a.visibleAt <= now).sort((a, b) => b.helpful - a.helpful || a.createdAt - b.createdAt)
  const helpfulIds = new Set((await db.helpful.toArray()).map((h) => h.id))
  const answers: AnswerDTO[] = await Promise.all(
    visible.map(async (a) => {
      const place = placeById.get(a.placeId)!
      const r = rank([place], request.criteria)[0]
      const user: Person = a.byName
        ? { id: a.userId, name: a.byName, handle: a.byName, hue: a.byHue ?? 200, curatorOf: [], reputation: 0 }
        : await personById(a.userId)
      return { ...a, user, place, markedHelpful: helpfulIds.has(a.id), fit: { match: r.match, warnings: r.warnings } }
    }),
  )
  const optionIds = (request.optionIds ?? [...ranked.map((r) => r.place.id), ...visible.map((a) => a.placeId)])
    .filter((x, i, arr) => arr.indexOf(x) === i && placeById.has(x)).slice(0, 6)
  const votes = await db.votes.where('requestId').equals(id).toArray()
  const times = request.times ?? timeOptions(request.criteria)
  return {
    request, author, intro: introFor(request.criteria, ranked), confidence: confidenceOf(request.criteria, ranked[0]),
    recommendations: ranked, answers, pendingAnswers: all.length - visible.length,
    options: optionIds.map((p) => placeById.get(p)!),
    tally: tallyOf(votes.filter((v) => (v.kind ?? 'place') === 'place'), optionIds),
    times, timeTally: tallyOf(votes.filter((v) => v.kind === 'time'), times),
  }
}

export const handlers = [
  http.get('/api/me', async () => {
    await latency()
    return HttpResponse.json((await getProfile()) ?? null)
  }),

  http.put('/api/me', async ({ request }) => {
    const body = (await request.json()) as Partial<Profile>
    const cur = await getProfile()
    const next: Profile = {
      id: 'me', name: 'Você', handle: '@voce', hue: 82, curatorOf: [], reputation: 0, hood: 'Pinheiros',
      niches: [], vibes: [], onboarded: false, demoMode: false, ...cur, ...body,
    }
    next.curatorOf = next.niches.slice(0, 2)
    await db.profile.put(next)
    void remote.pushMe(next) // só vai pro banco com consentimento (consentAt)
    await latency()
    return HttpResponse.json(next)
  }),

  http.get('/api/for-you', async () => {
    const profile = await getProfile()
    const c: Criteria = { groupSize: 2, niches: [], vibes: [], tags: [], unmet: [] }
    await latency()
    // curados primeiro (gosto + perto); se ainda não há curadoria suficiente, completa com lugares reais
    // num raio de 5 km que batem com o gosto (estilo), marcados "sem curadoria" no card
    const near = (p: Place) => kmTo(profile, p)
    const curated = rank(places.filter((p) => isCurated(p) && p.kind !== 'evento'), c, profile)
      .map((r) => ({ r, s: r.score - (near(r.place) ?? 4) * 0.6 }))
      .sort((a, b) => b.s - a.s).map((x) => x.r).slice(0, 8)
    const taste = new Set(profile?.niches ?? [])
    const base = curated.length >= 6 ? [] : rank(places.filter((p) => p.curation === 'base' && (near(p) ?? 99) <= 5 && p.niches.some((n) => taste.has(n))), c, profile)
      .map((r) => ({ r, s: r.score - (near(r.place) ?? 5) * 0.8 }))
      .sort((a, b) => b.s - a.s).map((x) => x.r).slice(0, 10 - curated.length)
    return HttpResponse.json([...curated, ...base])
  }),

  http.get('/api/events', async () => {
    await latency()
    return HttpResponse.json(places.filter((p) => p.kind === 'evento' && !(p.eventDate && isPast({ date: p.eventDate }))))
  }),

  /** convite de evento → vira uma votação de grupo: "bora nesse?" + 2 alternativas parecidas */
  http.post('/api/events/:id/group', async ({ params }) => {
    const ev = placeById.get(params.id as string)
    if (!ev) return notFound()
    const text = `Bora no ${ev.name}? ${ev.when ?? ''}`.trim()
    const criteria: Criteria = { ...parseRequest(text), niches: ev.niches, vibes: ev.vibes.slice(0, 1), unmet: [], source: { engine: 'regras' } }
    const alts = rankLayered(criteria, null, new Set([ev.id]), 2).map((r) => r.place.id)
    const day = ev.periods[0]?.days[0]
    const req: RoleRequest = {
      id: uid('r'), authorId: 'me', text, criteria, createdAt: Date.now(), status: 'aberto',
      optionIds: [ev.id, ...alts], eventId: ev.id,
      times: day !== undefined ? [`${DAY_SHORT[day]} ${ev.periods[0].open % 24}h`] : timeOptions(criteria),
    }
    await db.requests.add(req)
    void authorInfo().then((a) => remote.pushRequest(req, a))
    await delay(400)
    return HttpResponse.json({ id: req.id })
  }),

  /* ---------- eventos enviados (fase 2: curadoria) ---------- */
  http.post('/api/events/fit', async ({ request }) => {
    const draft = sanitizeDraft(await request.json())
    if (!draft) return HttpResponse.json({ total: 0, matches: 0, top: [] })
    return HttpResponse.json(fitOf(draft, await db.requests.toArray()))
  }),

  http.get('/api/submissions', async () => {
    await Promise.all([remote.pullMySubmissions(), remote.pullQueue()])
    const all = await db.submissions.orderBy('at').reverse().toArray()
    const reqs = await db.requests.toArray()
    return HttpResponse.json(all.map((s) => ({ ...s, fit: fitOf(s, reqs) })))
  }),

  http.post('/api/submissions', async ({ request }) => {
    const draft = sanitizeDraft(await request.json())
    if (!draft) return HttpResponse.json({ error: 'invalid' }, { status: 400 })
    const slug = draft.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
    const sub: EventSubmission = { ...draft, id: `ev-u-${slug}-${Math.random().toString(36).slice(2, 6)}`, hue: Math.floor(Math.random() * 360), at: Date.now(), status: 'pendente', origin: 'meu' }
    await db.submissions.add(sub)
    const synced = await remote.pushSubmission(sub)
    await delay(300)
    return HttpResponse.json({ ...sub, synced })
  }),

  /** chegou pelo link da curadoria: entra na fila deste aparelho */
  http.post('/api/submissions/import', async ({ request }) => {
    const body = (await request.json()) as { id: string; draft: unknown; hue?: number }
    const draft = sanitizeDraft(body.draft)
    if (!draft || !/^ev-u-[a-z0-9-]{1,40}$/.test(body.id ?? '')) return HttpResponse.json({ error: 'invalid' }, { status: 400 })
    const existing = await db.submissions.get(body.id)
    if (!existing) await db.submissions.add({ ...draft, id: body.id, hue: Number(body.hue ?? (body.draft as any)?.hue) || 200, at: Date.now(), status: 'pendente', origin: 'recebido' })
    return HttpResponse.json(await db.submissions.get(body.id))
  }),

  http.post('/api/submissions/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: EventSubmission['status'] }
    const sub = await db.submissions.get(params.id as string)
    if (!sub || !['aprovado', 'recusado', 'pendente'].includes(status)) return notFound()
    await db.submissions.update(sub.id, { status, reviewedAt: Date.now() })
    if (status === 'aprovado') approveLocally({ ...sub, status })
    // com a chave da curadoria, aprovar = publicar pra todo mundo (sem editar eventos.json)
    let published = false
    if (remote.getAdminKey()) {
      // envio que chegou só pelo link de curadoria: sobe antes de mudar o status
      await remote.pushSubmission(sub)
      published = await remote.pushReview(sub.id, status)
    }
    return HttpResponse.json({ ...sub, status, published })
  }),

  http.get('/api/places/:id', async ({ params }) => {
    const place = placeById.get(params.id as string)
    if (!place) return notFound()
    const verdicts: Verdict[] = ['amei', 'amei', 'ok']
    const reviews = people
      .filter((u) => u.curatorOf.some((n) => place.niches.includes(n)))
      .slice(0, 3)
      .map((user, i) => ({
        user, verdict: verdicts[i],
        note: [`${place.highlights[0][0].toUpperCase()}${place.highlights[0].slice(1)} vale a ida.`, `Fui num ${['sábado', 'sexta', 'domingo'][i]}: ${place.highlights[1]}.`, `Bom, mas chegue cedo.`][i],
        createdAt: Date.now() - (i + 1) * 86_400_000 * 3,
      }))
    const myReviews = await db.reviews.where('placeId').equals(place.id).toArray()
    await latency()
    return HttpResponse.json<PlaceDetail>({ place, reviews, myReviews })
  }),

  http.get('/api/feed', async () => {
    const reqs = await db.requests.orderBy('createdAt').reverse().toArray()
    const items: FeedItem[] = await Promise.all(
      reqs.filter((r) => !r.externalAuthor).map(async (request) => {
        const answers = await db.answers.where('requestId').equals(request.id).filter((a) => a.visibleAt <= Date.now()).toArray()
        const top = answers.sort((a, b) => b.helpful - a.helpful)[0]
        return {
          request, author: await personById(request.authorId, request), answers: answers.length,
          votes: await db.votes.where('requestId').equals(request.id).count(),
          topPlace: top ? placeById.get(top.placeId) : undefined,
        }
      }),
    )
    await latency()
    return HttpResponse.json(items)
  }),

  /** lugar novo pro catálogo comunitário: LLM (ou regras) lê o comentário e pré-preenche estilo/vibe/ocasião */
  http.post('/api/places/analyze', async ({ request }) => {
    const { comment = '', name = '', niches = [], occasions = [] } = (await request.json()) as { comment?: string; name?: string; niches?: string[]; occasions?: string[] }
    const c = comment.trim() ? await analyze(comment.slice(0, 200)) : null
    const uniq = <T,>(a: T[]) => [...new Set(a)]
    return HttpResponse.json({
      niches: uniq([...(c?.niches ?? []), ...niches]).slice(0, 3),
      vibes: (c?.vibes ?? []).slice(0, 2),
      occasions: uniq([...(c?.occasion ? [c.occasion] : []), ...occasions]).slice(0, 3),
      engine: c?.source?.engine === 'llm' ? 'llm' : 'regras',
      flag: moderationRules(name, comment),
    })
  }),

  /** confirma o lugar no catálogo comunitário (local + backend, que modera) */
  http.post('/api/places/community', async ({ request }) => {
    const { place, comment = '' } = (await request.json()) as { place: import('../lib/types').Place; comment?: string }
    if (!/^(g|o)-/.test(place?.id ?? '')) return HttpResponse.json({ error: 'place' }, { status: 400 })
    const known = placeById.get(place.id)
    if (known) Object.assign(known, { name: place.name, niches: place.niches, vibes: place.vibes, occasions: place.occasions, price: place.price })
    await rememberPlace(known ?? place)
    const r = await remote.pushCommunityPlace(known ?? place, comment)
    return HttpResponse.json(r ?? { ok: true, status: 'local' })
  }),

  http.get('/api/catalog/review', async () => HttpResponse.json(remote.getAdminKey() ? (await remote.placesForReview()) ?? [] : [])),
  http.post('/api/catalog/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: 'ok' | 'recusado' }
    return HttpResponse.json({ ok: await remote.pushPlaceStatus(params.id as string, status) })
  }),

  http.post('/api/parse', async ({ request }) => {
    const { text } = (await request.json()) as { text: string }
    const c = parseRequest(text)
    c.unmet = unmetFor(c, places)
    return HttpResponse.json(c)
  }),

  http.post('/api/requests', async ({ request }) => {
    const body = (await request.json()) as { text: string; overrides?: Partial<Criteria>; groupId?: string }
    const criteria = await analyze(body.text, body.overrides)
    const profile = await getProfile()
    // descoberta ao vivo no Google pro que o pedido descreve (até 6 s; sem Google segue com o que já tem)
    await Promise.race([discoverForRequest(criteria, profile?.home).catch(() => 0), delay(6000)])
    const req: RoleRequest = {
      id: uid('r'), authorId: 'me', text: body.text.trim(), criteria, createdAt: Date.now(), status: 'aberto',
      times: timeOptions(criteria), groupId: /^t-[a-z0-9]{10}$/.test(body.groupId ?? '') ? body.groupId : undefined,
    }
    const answers = profile?.demoMode ? simulateAnswers(req, profile) : []
    // snapshot das opções de voto: top 3 da IA + indicações dos curadores
    const top = rankLayered(criteria, profile)
    // métrica-chave da curadoria: pedido atendido com lugar curado (encaixe bom) ou caiu na base
    const servedByCurated = top.some((r) => isCurated(r.place) && r.match >= CURATED_OK)
    track(servedByCurated ? 'request_curated' : 'request_uncurated', { best: top[0]?.match, niches: criteria.niches, hood: criteria.hood })
    req.optionIds = [...top.map((r) => r.place.id), ...answers.map((a) => a.placeId)]
      .filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 4)
    await db.requests.add(req)
    await db.answers.bulkAdd(answers)
    void authorInfo().then((a) => remote.pushRequest(req, a))
    await delay(600)
    return HttpResponse.json({ id: req.id })
  }),

  /** link compartilhado: cria localmente o pedido que veio de outro aparelho */
  http.post('/api/requests/import', async ({ request }) => {
    const p = (await request.json()) as { id: string; text: string; criteria: Criteria; optionIds: string[]; times: string[]; author: { name: string; hue: number }; createdAt: number }
    if (!(await db.requests.get(p.id))) {
      await db.requests.add({
        id: p.id, authorId: `ext-${p.id}`, text: p.text, criteria: p.criteria, createdAt: p.createdAt, status: 'aberto',
        optionIds: p.optionIds.filter((x) => placeById.has(x)), times: p.times, externalAuthor: p.author,
      })
    }
    return HttpResponse.json({ ok: true })
  }),

  /** busca no catálogo, já com o encaixe nos critérios de um pedido (página de sugestões) */
  http.get('/api/search', async ({ request }) => {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const req = await db.requests.get(url.searchParams.get('rid') ?? '')
    const c: Criteria = req?.criteria ?? { groupSize: 2, niches: [], vibes: [], tags: [], unmet: [] }
    const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const pool = q
      ? places.filter((p) => [p.name, p.hood, p.tagline, ...p.niches.map(nicheLabel), KIND_LABEL[p.kind]].some((f) => n(f).includes(q)))
      : places
    await delay(120)
    // sem busca: o que mais encaixa, curado primeiro; com busca: tudo que bate com o texto (base marcada)
    return HttpResponse.json(q ? rank(pool, c).sort((a, b) => Number(isCurated(b.place)) - Number(isCurated(a.place)) || b.match - a.match).slice(0, 12) : rankLayered(c, null, new Set(), 12))
  }),

  /** sugestão que voltou pelo link de retorno: entra como opção da votação */
  http.post('/api/requests/:id/suggestions', async ({ params, request }) => {
    const id = params.id as string
    const { placeId, by, comment, hue } = (await request.json()) as { placeId: string; by: string; comment: string; hue?: number }
    const req = await db.requests.get(id)
    if (!req || !placeById.has(placeId)) return notFound()
    const dup = await db.answers.where('requestId').equals(id).filter((a) => a.kind === 'sugestao' && a.placeId === placeId && a.byName === by).first()
    if (!dup) {
      const now = Date.now()
      await db.answers.add({ id: uid('a'), requestId: id, userId: `ext-${by}`, placeId, comment: comment || 'Sugeri esse aqui!', helpful: 0, createdAt: now, visibleAt: now, kind: 'sugestao', byName: by, byHue: hue })
      const opts = req.optionIds ?? []
      if (!opts.includes(placeId)) await db.requests.update(id, { optionIds: [...opts, placeId].slice(-6) })
    }
    // com backend no ar a sugestão já entra na votação de todo mundo (sem link de retorno)
    const synced = await remote.pushSuggestion(id, { placeId, by, comment, hue })
    return HttpResponse.json({ ok: true, duplicate: !!dup, synced })
  }),

  http.get('/api/requests/:id', async ({ params }) => {
    const id = params.id as string
    const local = await db.requests.get(id)
    // pedido meu criado antes do backend existir (ou com ele fora do ar): publica agora
    if (local?.authorId === 'me' && !remote.wasPushed(id)) await remote.pushRequest(local, await authorInfo())
    await remote.syncRequest(id)
    const detail = await buildDetail(id)
    await latency()
    return detail ? HttpResponse.json(detail) : notFound()
  }),

  http.post('/api/requests/:id/votes', async ({ params, request }) => {
    const { placeId, voter, kind = 'place', demo } = (await request.json()) as { placeId: string; voter: string; kind?: 'place' | 'time'; demo?: boolean }
    const requestId = params.id as string
    const prev = await db.votes.where('requestId').equals(requestId).filter((v) => v.voter === voter && (v.kind ?? 'place') === kind).toArray()
    await db.votes.bulkDelete(prev.map((v) => v.id))
    const vote: Vote = { id: uid('v'), requestId, kind, placeId, voter, createdAt: Date.now() }
    await db.votes.add(vote)
    // amigos fictícios do modo demo nunca vão pro placar compartilhado
    const synced = demo ? false : await remote.pushVote(requestId, kind, placeId, voter)
    return HttpResponse.json({ ...vote, synced })
  }),

  http.post('/api/requests/:id/decide', async ({ params, request }) => {
    const { placeId, time } = (await request.json()) as { placeId: string; time?: string }
    await db.requests.update(params.id as string, { status: 'decidido', decidedPlaceId: placeId, decidedTime: time })
    void remote.pushDecision(params.id as string, placeId, time)
    await delay(500)
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/answers/:id/helpful', async ({ params }) => {
    const id = params.id as string
    const a = await db.answers.get(id)
    if (!a) return notFound()
    const marked = await db.helpful.get(id)
    if (marked) await db.helpful.delete(id)
    else await db.helpful.put({ id })
    await db.answers.update(id, { helpful: a.helpful + (marked ? -1 : 1) })
    return HttpResponse.json({ helpful: a.helpful + (marked ? -1 : 1), markedHelpful: !marked })
  }),

  http.post('/api/reviews', async ({ request }) => {
    const body = (await request.json()) as Omit<Review, 'id' | 'createdAt'>
    const review: Review = { ...body, id: uid('rv'), createdAt: Date.now() }
    await db.reviews.add(review)
    // avaliação de quem foi: vai pro banco (vira a nota da comunidade) — comentário moderado no servidor
    const pl = placeById.get(body.placeId)
    const me = await getProfile()
    if (body.went && body.verdict && pl && !me?.demoMode) void remote.pushPlaceReview({ ...review, name: me?.name ?? 'Alguém', hue: me?.hue ?? 82, placeName: pl.name, place: pl.source ? snapOf(pl) : undefined })
    if (body.requestId && body.went) await db.requests.update(body.requestId, { status: 'decidido', decidedPlaceId: body.placeId })
    let credited: Person | null = null
    if (body.requestId && body.went && body.verdict === 'amei') {
      const ans = await db.answers.where('requestId').equals(body.requestId).filter((a) => a.placeId === body.placeId).first()
      if (ans) credited = await personById(ans.userId)
    }
    await delay(500)
    return HttpResponse.json({ review, credited })
  }),

  http.get('/api/diary', async () => {
    const reviews = await db.reviews.orderBy('createdAt').reverse().toArray()
    const mine = await db.requests.where('authorId').equals('me').reverse().sortBy('createdAt')
    const diary: DiaryEntry[] = reviews.map((r) => ({ ...r, place: placeById.get(r.placeId)! })).filter((d) => d.place)
    await latency()
    return HttpResponse.json({ diary, requests: mine })
  }),

  /* ---------- medição / fake door ---------- */
  http.post('/api/leads', async ({ request }) => {
    const body = (await request.json()) as Omit<Lead, 'id' | 'at'>
    const lead: Lead = { ...body, id: uid('l'), at: Date.now() }
    await db.leads.add(lead)
    void remote.pushLead({ ...lead, placeName: placeById.get(lead.placeId)?.name })
    await delay(700)
    return HttpResponse.json(lead)
  }),

  http.post('/api/feedback', async ({ request }) => {
    const body = (await request.json()) as Omit<Feedback, 'id' | 'at'>
    const fb: Feedback = { ...body, id: uid('f'), at: Date.now() }
    await db.feedback.add(fb)
    void remote.pushFeedback(fb)
    return HttpResponse.json(fb)
  }),

  http.get('/api/testes/global', async () => {
    const g = remote.getAdminKey() ? await remote.globalStats() : null
    return HttpResponse.json(g ? { ...g, leads: g.leads.map((l) => ({ ...l, placeName: l.placeName ?? placeById.get(l.placeId)?.name ?? l.placeId })) } : null)
  }),
  http.get('/api/sync', async () => HttpResponse.json({ online: await remote.isOnline(), admin: !!remote.getAdminKey() })),

  http.get('/api/testes', async () => {
    const [events, feedback, leads, mine] = await Promise.all([
      db.events.orderBy('at').toArray(), db.feedback.orderBy('at').reverse().toArray(), db.leads.orderBy('at').reverse().toArray(),
      db.requests.where('authorId').equals('me').toArray(),
    ])
    const counts: Record<string, number> = {}
    for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1
    // por origem (first touch): chegadas, votos e cadastros
    const bySrc: Record<string, { app_open: number; vote_cast: number; onboarding_done: number; request_created: number; story_shared: number; event_group_created: number }> = {}
    for (const e of events) {
      const src = String((e.props as any)?.src ?? 'direto')
      const row = (bySrc[src] ??= { app_open: 0, vote_cast: 0, onboarding_done: 0, request_created: 0, story_shared: 0, event_group_created: 0 })
      if (e.name in row) (row as any)[e.name]++
    }
    const niches: Record<string, number> = {}
    for (const n of mine.flatMap((r) => r.criteria.niches)) niches[nicheLabel(n)] = (niches[nicheLabel(n)] ?? 0) + 1
    const unmet: Record<string, number> = {}
    for (const u of mine.flatMap((r) => r.criteria.unmet ?? [])) unmet[u] = (unmet[u] ?? 0) + 1
    return HttpResponse.json({
      counts, total: events.length, firstAt: events[0]?.at, lastAt: events[events.length - 1]?.at,
      recent: events.slice(-25).reverse(), feedback, niches, unmet, bySrc,
      leads: leads.map((l) => ({ ...l, placeName: placeById.get(l.placeId)?.name ?? l.placeId })),
    })
  }),

  http.get('/api/testes/export', async () => {
    return HttpResponse.json({
      exportedAt: new Date().toISOString(),
      profile: await getProfile(),
      events: await db.events.toArray(), feedback: await db.feedback.toArray(), leads: await db.leads.toArray(),
      requests: await db.requests.where('authorId').equals('me').toArray(), reviews: await db.reviews.toArray(),
      submissions: await db.submissions.toArray(),
    })
  }),
]
