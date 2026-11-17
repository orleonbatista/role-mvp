import { delay, http, HttpResponse } from 'msw'
import { db } from '../db/db'
import type {
  Answer, AnswerDTO, Criteria, DiaryEntry, Feedback, FeedItem, Lead, Person, PlaceDetail, Profile, RequestDetail, Review,
  RoleRequest, Verdict, Vote, VoteTally,
} from '../lib/types'
import { confidenceOf, introFor, parseRequest, rank, timeOptions, unmetFor } from './ranker'
import { refineWithLLM } from './llm'
import { people } from './seeds/people'
import { placeById, places } from './seeds/places'
import { nicheLabel, occasionLabel } from '../lib/labels'

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
  c = await refineWithLLM(text, c)
  for (const [k, v] of Object.entries(overrides ?? {})) if (v !== undefined && !(Array.isArray(v) && !v.length)) (c as any)[k] = v
  c.unmet = unmetFor(c, places)
  return c
}

/** Curadores simulados: só quem entende do assunto responde, com texto que cita a ocasião. */
function simulateAnswers(req: RoleRequest, profile: Profile | undefined): Answer[] {
  const ranked = rank(places, req.criteria, profile).filter((r) => r.score > 0)
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

async function buildDetail(id: string): Promise<RequestDetail | null> {
  const request = await db.requests.get(id)
  if (!request) return null
  const profile = await getProfile()
  const author = await personById(request.authorId, request)
  const ranked = rank(places, request.criteria, request.authorId === 'me' ? profile : null).slice(0, 3)
  const now = Date.now()
  const all = await db.answers.where('requestId').equals(id).toArray()
  const visible = all.filter((a) => a.visibleAt <= now).sort((a, b) => b.helpful - a.helpful || a.createdAt - b.createdAt)
  const helpfulIds = new Set((await db.helpful.toArray()).map((h) => h.id))
  const answers: AnswerDTO[] = await Promise.all(
    visible.map(async (a) => ({ ...a, user: await personById(a.userId), place: placeById.get(a.placeId)!, markedHelpful: helpfulIds.has(a.id) })),
  )
  const optionIds = (request.optionIds ?? [...ranked.map((r) => r.place.id), ...visible.map((a) => a.placeId)])
    .filter((x, i, arr) => arr.indexOf(x) === i && placeById.has(x)).slice(0, 4)
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
      niches: [], vibes: [], onboarded: false, demoMode: true, ...cur, ...body,
    }
    next.curatorOf = next.niches.slice(0, 2)
    await db.profile.put(next)
    await latency()
    return HttpResponse.json(next)
  }),

  http.get('/api/for-you', async () => {
    const profile = await getProfile()
    const c: Criteria = { groupSize: 2, niches: [], vibes: [], tags: [], unmet: [] }
    await latency()
    return HttpResponse.json(rank(places.filter((p) => p.kind !== 'evento'), c, profile).slice(0, 8))
  }),

  http.get('/api/events', async () => {
    await latency()
    return HttpResponse.json(places.filter((p) => p.kind === 'evento'))
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

  http.post('/api/parse', async ({ request }) => {
    const { text } = (await request.json()) as { text: string }
    const c = parseRequest(text)
    c.unmet = unmetFor(c, places)
    return HttpResponse.json(c)
  }),

  http.post('/api/requests', async ({ request }) => {
    const body = (await request.json()) as { text: string; overrides?: Partial<Criteria> }
    const criteria = await analyze(body.text, body.overrides)
    const profile = await getProfile()
    const req: RoleRequest = {
      id: uid('r'), authorId: 'me', text: body.text.trim(), criteria, createdAt: Date.now(), status: 'aberto',
      times: timeOptions(criteria),
    }
    const answers = (profile?.demoMode ?? true) ? simulateAnswers(req, profile) : []
    // snapshot das opções de voto: top 3 da IA + indicações dos curadores
    req.optionIds = [...rank(places, criteria, profile).slice(0, 3).map((r) => r.place.id), ...answers.map((a) => a.placeId)]
      .filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 4)
    await db.requests.add(req)
    await db.answers.bulkAdd(answers)
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

  http.get('/api/requests/:id', async ({ params }) => {
    const detail = await buildDetail(params.id as string)
    await latency()
    return detail ? HttpResponse.json(detail) : notFound()
  }),

  http.post('/api/requests/:id/votes', async ({ params, request }) => {
    const { placeId, voter, kind = 'place' } = (await request.json()) as { placeId: string; voter: string; kind?: 'place' | 'time' }
    const requestId = params.id as string
    const prev = await db.votes.where('requestId').equals(requestId).filter((v) => v.voter === voter && (v.kind ?? 'place') === kind).toArray()
    await db.votes.bulkDelete(prev.map((v) => v.id))
    const vote: Vote = { id: uid('v'), requestId, kind, placeId, voter, createdAt: Date.now() }
    await db.votes.add(vote)
    return HttpResponse.json(vote)
  }),

  http.post('/api/requests/:id/decide', async ({ params, request }) => {
    const { placeId, time } = (await request.json()) as { placeId: string; time?: string }
    await db.requests.update(params.id as string, { status: 'decidido', decidedPlaceId: placeId, decidedTime: time })
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
    await delay(700)
    return HttpResponse.json(lead)
  }),

  http.post('/api/feedback', async ({ request }) => {
    const body = (await request.json()) as Omit<Feedback, 'id' | 'at'>
    const fb: Feedback = { ...body, id: uid('f'), at: Date.now() }
    await db.feedback.add(fb)
    return HttpResponse.json(fb)
  }),

  http.get('/api/testes', async () => {
    const [events, feedback, leads, mine] = await Promise.all([
      db.events.orderBy('at').toArray(), db.feedback.orderBy('at').reverse().toArray(), db.leads.orderBy('at').reverse().toArray(),
      db.requests.where('authorId').equals('me').toArray(),
    ])
    const counts: Record<string, number> = {}
    for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1
    const niches: Record<string, number> = {}
    for (const n of mine.flatMap((r) => r.criteria.niches)) niches[nicheLabel(n)] = (niches[nicheLabel(n)] ?? 0) + 1
    const unmet: Record<string, number> = {}
    for (const u of mine.flatMap((r) => r.criteria.unmet ?? [])) unmet[u] = (unmet[u] ?? 0) + 1
    return HttpResponse.json({
      counts, total: events.length, firstAt: events[0]?.at, lastAt: events[events.length - 1]?.at,
      recent: events.slice(-25).reverse(), feedback, niches, unmet,
      leads: leads.map((l) => ({ ...l, placeName: placeById.get(l.placeId)?.name ?? l.placeId })),
    })
  }),

  http.get('/api/testes/export', async () => {
    return HttpResponse.json({
      exportedAt: new Date().toISOString(),
      profile: await getProfile(),
      events: await db.events.toArray(), feedback: await db.feedback.toArray(), leads: await db.leads.toArray(),
      requests: await db.requests.where('authorId').equals('me').toArray(), reviews: await db.reviews.toArray(),
    })
  }),
]
