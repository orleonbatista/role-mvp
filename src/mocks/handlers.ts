import { delay, http, HttpResponse } from 'msw'
import { db } from '../db/db'
import type {
  Answer, AnswerDTO, Criteria, DiaryEntry, FeedItem, Person, PlaceDetail, Profile, RequestDetail, Review, RoleRequest, Verdict, Vote,
} from '../lib/types'
import { introFor, parseRequest, rank } from './ranker'
import { people } from './seeds/people'
import { placeById, places } from './seeds/places'

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const latency = () => delay(180 + Math.random() * 220)

const getProfile = () => db.profile.get('me')

async function personById(id: string): Promise<Person> {
  if (id === 'me') {
    const p = await getProfile()
    if (p) return p
  }
  return people.find((u) => u.id === id) ?? { id, name: 'Alguém', handle: '@alguem', hue: 0, curatorOf: [], reputation: 0 }
}

function pick<T>(arr: T[], seed: number) {
  return arr[Math.abs(seed) % arr.length]
}

/** Gera respostas "da comunidade" que chegam ao longo dos próximos segundos. */
function simulateAnswers(req: RoleRequest, profile: Profile | undefined): Answer[] {
  const ranked = rank(places, req.criteria, profile)
  const candidates = ranked.slice(1, 7).filter((r) => r.score > 0)
  const experts = people
    .map((u) => ({ u, fit: u.curatorOf.filter((n) => req.criteria.niches.includes(n)).length }))
    .sort((a, b) => b.fit - a.fit || b.u.reputation - a.u.reputation)
    .slice(0, 3)
  const templates = [
    (n: string, h: string) => `Vai no ${n}: ${h}. Reserva antes que lota.`,
    (n: string, h: string) => `Já fiz rolê parecido no ${n}, ${h}. Aposta certa.`,
    (n: string, h: string) => `Se o grupo topar algo diferente, ${n}. O destaque é ${h}.`,
  ]
  const now = Date.now()
  return experts.slice(0, Math.min(3, candidates.length)).map(({ u }, i) => {
    const pl = candidates[i * 2 % candidates.length].place
    return {
      id: uid('a'), requestId: req.id, userId: u.id, placeId: pl.id,
      comment: pick(templates, i + req.text.length)(pl.name, pl.highlights[i % pl.highlights.length]),
      helpful: 0, createdAt: now + 2600 + i * 2900, visibleAt: now + 2600 + i * 2900,
    }
  })
}

async function buildDetail(id: string): Promise<RequestDetail | null> {
  const request = await db.requests.get(id)
  if (!request) return null
  const profile = await getProfile()
  const author = await personById(request.authorId)
  const ranked = rank(places, request.criteria, request.authorId === 'me' ? profile : null).slice(0, 3)
  const now = Date.now()
  const all = await db.answers.where('requestId').equals(id).toArray()
  const visible = all.filter((a) => a.visibleAt <= now).sort((a, b) => b.helpful - a.helpful || a.createdAt - b.createdAt)
  const helpfulIds = new Set((await db.helpful.toArray()).map((h) => h.id))
  const answers: AnswerDTO[] = await Promise.all(
    visible.map(async (a) => ({ ...a, user: await personById(a.userId), place: placeById.get(a.placeId)!, markedHelpful: helpfulIds.has(a.id) })),
  )
  const optionIds = [...ranked.map((r) => r.place.id), ...visible.map((a) => a.placeId)].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 4)
  const votes = await db.votes.where('requestId').equals(id).toArray()
  const tally = optionIds.map((placeId) => {
    const vs = votes.filter((v) => v.placeId === placeId)
    return { placeId, count: vs.length, voters: vs.map((v) => v.voter) }
  })
  return {
    request, author, intro: introFor(request.criteria, ranked), recommendations: ranked, answers,
    pendingAnswers: all.length - visible.length, options: optionIds.map((p) => placeById.get(p)!), tally,
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
      niches: [], vibes: [], onboarded: false, ...cur, ...body,
    }
    next.curatorOf = next.niches.slice(0, 2)
    await db.profile.put(next)
    await latency()
    return HttpResponse.json(next)
  }),

  http.get('/api/for-you', async () => {
    const profile = await getProfile()
    const c: Criteria = { groupSize: 2, niches: profile?.niches ?? [], vibes: profile?.vibes ?? [], hood: undefined }
    await latency()
    return HttpResponse.json(rank(places.filter((p) => p.kind !== 'evento'), c, profile).slice(0, 8))
  }),

  http.get('/api/events', async () => {
    await latency()
    return HttpResponse.json(places.filter((p) => p.kind === 'evento'))
  }),

  http.get('/api/places/:id', async ({ params }) => {
    const place = placeById.get(params.id as string)
    if (!place) return HttpResponse.json(null, { status: 404 })
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
      reqs.map(async (request) => {
        const answers = await db.answers.where('requestId').equals(request.id).filter((a) => a.visibleAt <= Date.now()).toArray()
        const top = answers.sort((a, b) => b.helpful - a.helpful)[0]
        return {
          request, author: await personById(request.authorId), answers: answers.length,
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
    return HttpResponse.json(parseRequest(text))
  }),

  http.post('/api/requests', async ({ request }) => {
    const body = (await request.json()) as { text: string; overrides?: Partial<Criteria> }
    const parsed = parseRequest(body.text)
    const criteria: Criteria = { ...parsed, ...Object.fromEntries(Object.entries(body.overrides ?? {}).filter(([, v]) => v !== undefined)) }
    const req: RoleRequest = { id: uid('r'), authorId: 'me', text: body.text.trim(), criteria, createdAt: Date.now(), status: 'aberto' }
    await db.requests.add(req)
    await db.answers.bulkAdd(simulateAnswers(req, await getProfile()))
    await delay(700)
    return HttpResponse.json({ id: req.id })
  }),

  http.get('/api/requests/:id', async ({ params }) => {
    const detail = await buildDetail(params.id as string)
    await latency()
    return detail ? HttpResponse.json(detail) : HttpResponse.json(null, { status: 404 })
  }),

  http.post('/api/requests/:id/votes', async ({ params, request }) => {
    const { placeId, voter } = (await request.json()) as { placeId: string; voter: string }
    const requestId = params.id as string
    const prev = await db.votes.where('requestId').equals(requestId).filter((v) => v.voter === voter).toArray()
    await db.votes.bulkDelete(prev.map((v) => v.id))
    const vote: Vote = { id: uid('v'), requestId, placeId, voter, createdAt: Date.now() }
    await db.votes.add(vote)
    return HttpResponse.json(vote)
  }),

  http.post('/api/requests/:id/decide', async ({ params, request }) => {
    const { placeId } = (await request.json()) as { placeId: string }
    await db.requests.update(params.id as string, { status: 'decidido', decidedPlaceId: placeId })
    await delay(500)
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/answers/:id/helpful', async ({ params }) => {
    const id = params.id as string
    const a = await db.answers.get(id)
    if (!a) return HttpResponse.json(null, { status: 404 })
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
    // reputação de quem indicou o lugar
    let credited: Person | null = null
    if (body.requestId && body.went && body.verdict === 'amei') {
      const ans = await db.answers.where('requestId').equals(body.requestId).filter((a) => a.placeId === body.placeId).first()
      if (ans) credited = await personById(ans.userId)
    }
    await delay(600)
    return HttpResponse.json({ review, credited })
  }),

  http.get('/api/diary', async () => {
    const reviews = await db.reviews.orderBy('createdAt').reverse().toArray()
    const mine = await db.requests.where('authorId').equals('me').reverse().sortBy('createdAt')
    const diary: DiaryEntry[] = reviews.map((r) => ({ ...r, place: placeById.get(r.placeId)! }))
    await latency()
    return HttpResponse.json({ diary, requests: mine })
  }),
]
