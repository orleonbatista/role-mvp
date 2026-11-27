import { delay, http, HttpResponse } from 'msw'
import { db, demoOn } from '../db/db'
import type {
  Answer, AnswerDTO, Criteria, Ranked, DiaryEntry, EventSubmission, Feedback, FeedItem, Lead, Person, Place, PlaceDetail, Profile, RequestDetail, Review,
  RoleRequest, Verdict, Vote, VoteTally,
} from '../lib/types'
import { confidenceOf, introFor, parseRequest, rank, timeOptions, toExample, unmetFor } from './ranker'
import { pickWithLLM, refineWithLLM } from './llm'
import type { PickFact } from './llmPrompt'
import { people } from './seeds/people'
import { isCurated, placeById, places } from './seeds/places'
import { KIND_LABEL, nicheLabel, occasionLabel } from '../lib/labels'
import { DAY_SHORT, isOpenAt, kmBetween, kmTo } from '../lib/hours'
import { approveLocally, fitOf, isPast, sanitizeDraft } from './extraEvents'
import * as remote from './remote'
import { track } from '../lib/track'
import { moderationRules } from './llmPrompt'
import { adoptSnaps, rememberPlace, snapsFor } from './gplaces'
import { centerOf, discoverForRequest, discoverForTaste, limits } from '../lib/gdiscover'
import { snapOf } from '../lib/places'

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
// a API roda dentro do app: sem atraso artificial (era resto da fase de protótipo e somava ~0,3 s em cada tela)
const latency = () => Promise.resolve()
const syncedOnce = new Set<string>()
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

let lastAi: Criteria | null = null
async function analyze(text: string, overrides?: Partial<Criteria>) {
  let c = parseRequest(text)
  c.source = { engine: 'regras' }
  c = await refineWithLLM(text, c)
  lastAi = { ...c }
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
  return [...good, ...[...cur.filter((r) => r.match < CURATED_OK), ...base].sort((a, b) => b.score - a.score)].slice(0, n)
}

/* ---------- curadoria da IA sobre os candidatos ---------- */
const aiNotes = new Map<string, Map<string, string>>() // pedido → lugar → motivo (só em memória: usa dados do Google)
function factsOf(r: Ranked, i: number, c: Criteria, profile: Profile | null | undefined): PickFact {
  const p = r.place, L = p.live
  const known = !p.source || L?.hours
  let open: boolean | null = null
  if (c.when && known) {
    const d = c.when.day, h = c.when.hour
    open = d === undefined ? [0, 1, 2, 3, 4, 5, 6].some((x) => isOpenAt(p.periods, x, h ?? 21))
      : h === undefined ? [13, 19, 21, 23].some((x) => isOpenAt(p.periods, d, x)) : isOpenAt(p.periods, d, h)
  }
  return {
    i, nome: p.name, tipo: p.tagline || p.kind, distancia_km: (profile?.home ? kmBetween(profile.home, p) : undefined) ?? null,
    nota_google: L?.rating ?? null, avaliacoes_google: L?.count ?? null,
    nota_comunidade: !p.source && p.ratingCount > 0 ? p.rating : isCurated(p) && p.ratingCount > 0 ? p.rating : null,
    area_externa: L?.outdoor ?? (p.niches.includes('ao-ar-livre') && !p.source ? true : null),
    cerveja: L?.beer ?? null, drinks: L?.cocktails ?? null, musica_ao_vivo: L?.music ?? null, bom_pra_grupo: L?.groups ?? null,
    aberto_no_horario_pedido: open, ...(c.budget ? { preco_estimado: p.price } : {}), curado_pela_comunidade: isCurated(p),
  }
}
/** destaques escolhidos pela IA → frase, só com o que os fatos confirmam (superlativos conferidos entre os escolhidos) */
const fmt1 = (n: number) => n.toFixed(1).replace('.', ',')
const fmtN = (n: number) => (n >= 1000 ? `${fmt1(n / 1000)} mil` : String(n))
function noteFrom(ds: string[], f: PickFact, chosen: PickFact[]): string | null {
  const km = (x: PickFact) => x.distancia_km ?? 99
  const minKm = Math.min(...chosen.map(km))
  const maxNota = Math.max(...chosen.map((x) => x.nota_google ?? 0))
  const maxCount = Math.max(...chosen.map((x) => x.avaliacoes_google ?? 0))
  const k = f.distancia_km, n = f.nota_google, c = f.avaliacoes_google ?? 0
  // 1) o que diferencia ESTE lugar dos outros escolhidos (sempre conferido nos fatos)
  let diff: string | null = null
  // só UM pode ser "o mais perto": em empate, o primeiro da lista
  const nearest = chosen.find((x) => km(x) === minKm)
  if (k != null && k <= minKm && chosen.length > 1 && nearest?.i === f.i) diff = `o mais perto (${fmt1(k)} km de quem pediu)`
  else if (n != null && n >= maxNota && c >= 50) diff = `a melhor nota no Google entre as opções (${fmt1(n)}, ${fmtN(c)} avaliações)`
  else if (c >= maxCount && c >= 500) diff = `o mais avaliado (${fmtN(c)} avaliações, nota ${fmt1(n ?? 0)})`
  else if (n != null && n >= 4.6 && c >= 200) diff = `nota ${fmt1(n)} com ${fmtN(c)} avaliações`
  else if (k != null && k <= 1.5) diff = `fica pertinho (${fmt1(k)} km)`
  else if (k != null && n != null) diff = `a ${fmt1(k)} km, nota ${fmt1(n)} no Google`
  // 2) o que a IA destacou e os fatos confirmam
  const ok: Record<string, string | false> = {
    area_externa: !!f.area_externa && 'área externa', cerveja: !!f.cerveja && 'cerveja', drinks: !!f.drinks && 'drinks',
    musica_ao_vivo: !!f.musica_ao_vivo && 'música ao vivo', bom_pra_grupo: !!f.bom_pra_grupo && 'bom pra grupo',
    aberto_no_horario: !!f.aberto_no_horario_pedido && 'aberto no horário pedido', curado_pela_comunidade: f.curado_pela_comunidade && 'indicado pela comunidade',
  }
  const confirmed = [...new Set(ds.map((d) => ok[d]).filter((x): x is string => !!x))]
  if (!diff && !confirmed.length) return null
  const tail = confirmed.length ? `${diff ? '; ' : ''}${confirmed.join(', ')} (confirmado no Google)` : ''
  const s = `${diff ?? ''}${tail}`
  return s[0].toUpperCase() + s.slice(1) + '.'
}

async function curateWithLLM(req: RoleRequest, cands: Ranked[], profile: Profile | null | undefined): Promise<Ranked[] | null> {
  if (cands.length < 3) return null
  const facts = cands.map((r, i) => factsOf(r, i, req.criteria, profile))
  const out = await pickWithLLM(req.text, facts)
  if (!out?.escolhas.length) return null
  // a IA ajusta a ordem, não substitui o ranking: bônus pela posição na escolha dela (1º +1,5 … 5º +0,3),
  // somado ao encaixe do ranking (0–10). Um lugar muito bom que ela esqueceu continua competindo.
  const bonus = new Map<number, number>()
  out.escolhas.forEach((e, pos) => { if (cands[e.i] && !bonus.has(e.i)) bonus.set(e.i, 1.5 - pos * 0.3) })
  const dests = new Map(out.escolhas.map((e) => [e.i, e.destaques]))
  const order = cands.map((r, i) => ({ r, i, s: r.match / 10 + (bonus.get(i) ?? 0) })).sort((a, b) => b.s - a.s)
  const notes = new Map<string, string>()
  const result = order.map(({ r, i }) => {
    // superlativos comparados com TODOS os candidatos (não só os escolhidos)
    const note = noteFrom(dests.get(i) ?? [], facts[i], facts)
    if (note) notes.set(r.place.id, note)
    return { ...r, aiNote: note ?? undefined }
  })
  aiNotes.set(req.id, notes)
  return result
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
  const all = await db.answers.where('requestId').equals(id).toArray()
  // as opções que a IA escolheu na criação (snapshot do pedido); só recalcula se os lugares não estão mais na memória
  if (request.optSnaps?.length) adoptSnaps(request.optSnaps, 8)
  const fromAnswers = new Set(all.map((x) => x.placeId))
  const who = request.authorId === 'me' ? profile : null
  const opts = (request.optionIds ?? []).filter((x) => !fromAnswers.has(x) && x !== pinned?.id).map((x) => placeById.get(x)).filter((p): p is Place => !!p)
  const ranked = pinned
    ? [rank([pinned], request.criteria)[0], ...(opts.length ? rank(opts, request.criteria, who) : rankLayered(request.criteria, who, new Set([pinned.id]), 2))]
    : opts.length
      ? (request.aiPicked
        ? opts.map((p) => ({ ...rank([p], request.criteria, who)[0], aiNote: aiNotes.get(request.id)?.get(p.id) }))
        : rank(opts, request.criteria, who).sort((a, b) => b.score - a.score))
      : rankLayered(request.criteria, who, new Set(), 5)
  const now = Date.now()
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
  const timeVotes = votes.filter((v) => v.kind === 'time')
  // horários sugeridos pela turma (data/hora alternativa) entram como opção junto com os da IA
  const times = [...(request.times ?? timeOptions(request.criteria)), ...(request.extraTimes ?? []), ...timeVotes.map((v) => v.placeId)]
    .filter((x, i, a) => a.indexOf(x) === i).slice(0, 9)
  return {
    request, author, intro: introFor(request.criteria, ranked), confidence: confidenceOf(request.criteria, ranked[0]),
    recommendations: ranked, answers, pendingAnswers: all.length - visible.length,
    options: optionIds.map((p) => placeById.get(p)!),
    tally: tallyOf(votes.filter((v) => (v.kind ?? 'place') === 'place'), optionIds),
    times, timeTally: tallyOf(timeVotes, times),
    extra: remote.extraOf(id) ?? null,
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
    // abre a Home já com lugares abertos perto, do gosto: espera a descoberta no Google (mesma busca da abertura, sem repetir)
    if (profile?.onboarded) await Promise.race([discoverForTaste(centerOf(profile), profile.niches).catch(() => 0), delay(8000)])
    // curados primeiro (gosto + perto); se ainda não há curadoria suficiente, completa com lugares reais
    // num raio de 5 km que batem com o gosto (estilo), marcados "sem curadoria" no card
    const near = (p: Place) => kmTo(profile, p)
    // uma lista só, dentro dos 5 km prometidos na tela: curadoria da comunidade dá vantagem, mas não passa por cima da distância
    const taste = new Set(profile?.niches ?? [])
    const curated = rank(places.filter((p) => isCurated(p) && p.kind !== 'evento' && (near(p) ?? 0) <= 5), c, profile).filter((r) => r.match >= 35)
    const base = rank(places.filter((p) => p.curation === 'base' && (near(p) ?? 99) <= 5 && p.niches.some((n) => taste.has(n))), c, profile)
    const all = [...curated.map((r) => ({ r, s: r.score + 1 - (near(r.place) ?? 4) * 0.7 })), ...base.map((r) => ({ r, s: r.score - (near(r.place) ?? 5) * 0.7 }))]
    const out = all.sort((a, b) => b.s - a.s).map((x) => x.r).slice(0, 10)
    if (out.length) return HttpResponse.json(out)
    // nada no raio (ex.: limite diário do Google batido): mostra o que já conhecemos, do mais perto, até 15 km
    const wide = rank(places.filter((p) => p.kind !== 'evento' && (near(p) ?? 99) <= 15), c, profile)
      .sort((a, b) => (near(a.place) ?? 99) - (near(b.place) ?? 99)).slice(0, 10)
    return HttpResponse.json(wide)
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
      optionIds: [ev.id, ...alts], eventId: ev.id, optSnaps: snapsFor([ev.id, ...alts]),
      times: day !== undefined ? [`${DAY_SHORT[day]} ${ev.periods[0].open % 24}h`] : timeOptions(criteria),
    }
    await db.requests.add(req)
    void authorInfo().then((a) => remote.pushRequest(req, a))
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
    // avaliações de curadores fictícios: só no modo demonstração (fora dele, só aparecem avaliações reais)
    const reviews = !(await demoOn()) ? [] : people
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

  /** votações que chegaram por link (rolê de outra pessoa): convidado e/ou já votou */
  http.get('/api/invites', async () => {
    const me = (() => { try { return localStorage.getItem('role.voter') ?? '' } catch { return '' } })().trim()
    // as que este aparelho/conta participou em outro celular: puxa do servidor as que ainda não estão aqui
    const remoteIds = (await remote.myInvites()) ?? []
    for (const x of remoteIds) if (!(await db.requests.get(x.id))) await remote.syncRequest(x.id).catch(() => false)
    const reqs = await db.requests.filter((r) => !!r.externalAuthor).toArray()
    const items = await Promise.all(reqs.map(async (r) => {
      const votes = await db.votes.where('requestId').equals(r.id).toArray()
      const decided = r.decidedPlaceId ? placeById.get(r.decidedPlaceId) : undefined
      return {
        id: r.id, text: r.text, author: r.externalAuthor!.name, hue: r.externalAuthor!.hue, createdAt: r.createdAt,
        status: r.status, voted: !!me && votes.some((v) => v.voter === me), votes: votes.filter((v) => (v.kind ?? 'place') === 'place').length,
        decided: decided ? `${decided.name}${r.decidedTime ? ` · ${r.decidedTime}` : ''}` : undefined,
      }
    }))
    return HttpResponse.json(items.sort((a, b) => Number(a.status === 'decidido') - Number(b.status === 'decidido') || b.createdAt - a.createdAt))
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

  /** busca rápida: descreve o que quer e recebe uma lista, sem pedido nem votação (nada fica salvo) */
  http.post('/api/quick', async ({ request }) => {
    const body = (await request.json()) as { text: string }
    const criteria = await analyze(body.text)
    const profile = await getProfile()
    await Promise.race([discoverForRequest(criteria, profile?.home, body.text).catch(() => 0), delay(7000)])
    const tmp: RoleRequest = { id: uid('q'), authorId: 'me', text: body.text.trim(), criteria, createdAt: Date.now(), status: 'aberto' }
    let top = rankLayered(criteria, profile, new Set(), 10)
    const picked = await curateWithLLM(tmp, top, profile)
    if (picked) top = [...picked, ...top.filter((r) => !picked.some((p) => p.place.id === r.place.id))]
    track('quick_search', { n: top.length, niches: criteria.niches })
    return HttpResponse.json({ criteria, results: top.slice(0, 8).map((r) => ({ ...r, aiNote: r.aiNote ?? aiNotes.get(tmp.id)?.get(r.place.id) })) })
  }),

  http.post('/api/requests', async ({ request }) => {
    const body = (await request.json()) as { text: string; overrides?: Partial<Criteria>; groupId?: string }
    const criteria = await analyze(body.text, body.overrides)
    const ai = lastAi ?? criteria
    const profile = await getProfile()
    // aprendizado: o que a IA entendeu × o que ficou (chips corrigidos), mais termos que o app ainda não cobre
    {
      const a = toExample(body.text, ai), f = toExample(body.text, criteria)
      void remote.pushExample({ text: body.text.trim(), ai: a, final: f, corrected: JSON.stringify(a) !== JSON.stringify(f), unmet: criteria.unmet, engine: ai.source?.engine ?? 'regras' })
    }
    // descoberta ao vivo no Google pro que o pedido descreve (até 6 s; sem Google segue com o que já tem)
    await Promise.race([discoverForRequest(criteria, profile?.home, body.text).catch(() => 0), delay(7000)])
    const req: RoleRequest = {
      id: uid('r'), authorId: 'me', text: body.text.trim(), criteria, createdAt: Date.now(), status: 'aberto',
      times: timeOptions(criteria), groupId: /^t-[a-z0-9]{10}$/.test(body.groupId ?? '') ? body.groupId : undefined,
    }
    const answers = profile?.demoMode ? simulateAnswers(req, profile) : []
    // candidatos pelo ranking (8) → a IA lê os fatos junto com o pedido, escolhe e justifica os 5 melhores
    let top = rankLayered(criteria, profile, new Set(), 8)
    const picked = await curateWithLLM(req, top, profile)
    if (picked) { top = picked; req.aiPicked = true }
    top = top.slice(0, 5)
    // destaque pago: no máximo 1, só se encaixa de verdade (sem alerta e com encaixe razoável), sempre por último
    // e marcado "patrocinado" na tela; nunca muda a ordem das opções orgânicas
    const spon = [...remote.venuesActive].filter(([id, v]) => v.sponsored && !top.some((r) => r.place.id === id)).map(([id]) => placeById.get(id)).filter((p): p is Place => !!p)
    const sponsoredPick = spon.length ? rank(spon, criteria, profile).find((r) => r.match >= 45 && !r.warnings.length) : undefined
    if (sponsoredPick) { top = [...top, sponsoredPick]; track('sponsored_shown', { id: sponsoredPick.place.id }) }
    // métrica-chave da curadoria: pedido atendido com lugar curado (encaixe bom) ou caiu na base
    const servedByCurated = top.some((r) => isCurated(r.place) && r.match >= CURATED_OK)
    track(servedByCurated ? 'request_curated' : 'request_uncurated', { best: top[0]?.match, niches: criteria.niches, hood: criteria.hood })
    req.optionIds = [...top.map((r) => r.place.id), ...answers.map((a) => a.placeId)]
      .filter((x, i, arr) => arr.indexOf(x) === i).slice(0, sponsoredPick ? 6 : 5)
    req.optSnaps = snapsFor(req.optionIds, aiNotes.get(req.id))
    if (limits.basic) req.degraded = 'sem_google'
    else if (limits.rich) req.degraded = 'sem_confirmacao'
    await db.requests.add(req)
    await db.answers.bulkAdd(answers)
    void authorInfo().then((a) => remote.pushRequest(req, a))
    await delay(600)
    return HttpResponse.json({ id: req.id })
  }),

  /** link compartilhado: cria localmente o pedido que veio de outro aparelho */
  http.post('/api/requests/import', async ({ request }) => {
    const p = (await request.json()) as { id: string; text: string; criteria: Criteria; optionIds: string[]; times: string[]; author: { name: string; hue: number }; createdAt: number; snaps?: unknown[] }
    if (p.snaps?.length) adoptSnaps(p.snaps, 8)
    if (!(await db.requests.get(p.id))) {
      await db.requests.add({
        id: p.id, authorId: `ext-${p.id}`, text: p.text, criteria: p.criteria, createdAt: p.createdAt, status: 'aberto',
        optionIds: p.optionIds.filter((x) => placeById.has(x)), times: p.times, externalAuthor: p.author, optSnaps: p.snaps,
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
    // já tem cópia local: mostra na hora e sincroniza por trás na primeira abertura (antes a tela esperava o servidor,
    // até 2,5 s a mais); dali em diante cada atualização (a cada 4 s) espera a sincronização como antes
    if (local && !syncedOnce.has(id)) {
      syncedOnce.add(id)
      void remote.syncRequest(id).then(() => window.dispatchEvent(new CustomEvent('role:request-synced', { detail: id }))).catch(() => {})
    } else {
      syncedOnce.add(id)
      await remote.syncRequest(id)
    }
    const detail = await buildDetail(id)
    await latency()
    return detail ? HttpResponse.json(detail) : notFound()
  }),

  http.post('/api/requests/:id/delete', async ({ params }) => {
    const id = params.id as string
    const r = await db.requests.get(id)
    if (r?.authorId === 'me') void remote.deleteRequestRemote(id)
    await db.transaction('rw', db.requests, db.answers, db.votes, async () => {
      await db.requests.delete(id)
      await db.answers.where('requestId').equals(id).delete()
      await db.votes.where('requestId').equals(id).delete()
    })
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/requests/:id/votes', async ({ params, request }) => {
    const { placeId, voter, kind = 'place', demo } = (await request.json()) as { placeId: string; voter: string; kind?: 'place' | 'time'; demo?: boolean }
    const requestId = params.id as string
    // horário = disponibilidade: cada toque marca ou desmarca aquele horário (vários por pessoa)
    if (kind === 'time') {
      const same = await db.votes.where('requestId').equals(requestId).filter((v) => v.voter === voter && v.kind === 'time' && v.placeId === placeId && !v.id.startsWith('rs-')).toArray()
      if (same.length) await db.votes.bulkDelete(same.map((v) => v.id))
      else await db.votes.add({ id: uid('v'), requestId, kind, placeId, voter, createdAt: Date.now() })
      const synced = demo ? false : await remote.pushSlot(requestId, placeId, !same.length, voter)
      return HttpResponse.json({ ok: true, on: !same.length, synced })
    }
    const prev = await db.votes.where('requestId').equals(requestId).filter((v) => v.voter === voter && (v.kind ?? 'place') === kind).toArray()
    await db.votes.bulkDelete(prev.map((v) => v.id))
    const vote: Vote = { id: uid('v'), requestId, kind, placeId, voter, createdAt: Date.now() }
    await db.votes.add(vote)
    // amigos fictícios do modo demo nunca vão pro placar compartilhado
    const synced = demo ? false : await remote.pushVote(requestId, kind, placeId, voter)
    return HttpResponse.json({ ...vote, synced })
  }),

  http.post('/api/requests/:id/reopen', async ({ params }) => {
    // precisa do servidor (todo mundo tem que ver a votação aberta de novo)
    if (!(await remote.pushReopen(params.id as string))) return HttpResponse.json({ error: 'offline' }, { status: 409 })
    await db.requests.update(params.id as string, { status: 'aberto', decidedPlaceId: undefined, decidedTime: undefined })
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/requests/:id/decide', async ({ params, request }) => {
    const { placeId, time } = (await request.json()) as { placeId: string; time?: string }
    await db.requests.update(params.id as string, { status: 'decidido', decidedPlaceId: placeId, decidedTime: time })
    void remote.pushDecision(params.id as string, placeId, time)
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
  http.get('/api/sync', async () => {
    const online = await remote.isOnline()
    const role = online ? await remote.myRole() : remote.getAdminKey() ? 'admin' : 'usuario'
    return HttpResponse.json({ online, role, admin: role === 'admin', curator: role !== 'usuario' })
  }),

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
