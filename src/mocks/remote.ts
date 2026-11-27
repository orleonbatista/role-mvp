import type { Place as PlaceT } from '../lib/types'
import type { EventDraft, EventSubmission, Feedback, Lead, Profile, Review, RoleRequest, TrackEvent } from '../lib/types'
import { db } from '../db/db'
import { gatewayConfig } from './llm'
import { placeById, registerPlace } from './seeds/places'
import { adoptSnaps, snapsFor } from './gplaces'
import { fromSnap, snapOf } from '../lib/places'

/* Sincronização com o backend do PC (llm-gateway/api.mjs, exposto no mesmo túnel do LLM).
   Regra: o app NUNCA depende dele. Toda escrita vai primeiro pro IndexedDB local; depois, se o backend
   responder, é espelhada lá. Toda leitura de pedido puxa o estado compartilhado (votos, sugestões, decisão)
   e mescla no local. Backend fora do ar → modo link (payload no #d=, como antes). */

const DEVICE_KEY = 'role.device'
const ADMIN_KEY = 'role.adminKey'
const API_URL = import.meta.env.VITE_API_URL as string | undefined

/** recuperação em outro celular: o aparelho novo assume o id do antigo */
export function setDeviceId(id: string) { try { localStorage.setItem(DEVICE_KEY, id) } catch { /* */ } }

export function deviceId() {
  try {
    let d = localStorage.getItem(DEVICE_KEY)
    if (!d) { d = `d-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`; localStorage.setItem(DEVICE_KEY, d) }
    return d
  } catch { return 'd-anonimo00' }
}
export const getAdminKey = () => { try { return localStorage.getItem(ADMIN_KEY) ?? '' } catch { return '' } }
export const setAdminKey = (k: string | null) => { try { k ? localStorage.setItem(ADMIN_KEY, k) : localStorage.removeItem(ADMIN_KEY) } catch { /* */ } }

let health: { at: number; base: string | null } | null = null
/** época dos perfis no servidor (reset geral → cada aparelho refaz o cadastro) */
export let serverEpoch = 0
let downUntil = 0
/* fora do ar → de volta: antes ficava 30 s "fora" a cada falha e as telas guardavam o "sem conexão" até reabrir o app
   (no iPhone, ao voltar do segundo plano, a primeira chamada costuma falhar porque a rede ainda está acordando).
   Agora a pausa é curta, o app reconfere sozinho a cada poucos segundos e, quando volta, avisa as telas (role:online). */
let wasDown = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
function markDown() {
  downUntil = Date.now() + 5_000
  wasDown = true
  if (!retryTimer && typeof window !== 'undefined') retryTimer = setTimeout(() => { retryTimer = null; if (!document.hidden) void apiBase(true) }, 5_500)
}
function markUp() {
  if (wasDown) { wasDown = false; try { window.dispatchEvent(new Event('role:online')) } catch { /* */ } }
}
if (typeof window !== 'undefined') {
  const wake = () => { if (document.hidden) return; downUntil = 0; if (health && !health.base) health = null; void apiBase(true) }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)
  window.addEventListener('pageshow', wake)
}

/** URL do backend se ele estiver no ar (cache de 60s; 30s de pausa depois de uma falha) */
let probing: Promise<string | null> | null = null
const LAST_KEY = 'role.apiBase'
function lastGood(): string | null {
  try { const x = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null'); return x && Date.now() - x.at < 6 * 3600_000 ? x.base : null } catch { return null }
}
export async function apiBase(force = false): Promise<string | null> {
  if (Date.now() < downUntil && !force) return null
  if (!force && health && Date.now() - health.at < 60_000) return health.base
  // abertura a frio: usa o último endereço bom (até 6 h) na hora e confere em segundo plano. Antes eram 3 idas e
  // voltas em série (llm.json → /health → sessão) antes da primeira chamada; a votação levava ~7 s pra abrir
  if (!force && !health) {
    // primeira visita (quem chega pelo link do zap): só lê o endereço no llm.json e já chama; o teste de saúde
    // corre em paralelo em vez de ficar na frente
    const last = lastGood() ?? (await configBase())
    if (last) { if (!probing) probing = probe().finally(() => { probing = null }); return last }
  }
  // várias telas perguntando ao mesmo tempo: um teste só
  if (probing) return probing
  probing = probe().finally(() => { probing = null })
  return probing
}
async function configBase(): Promise<string | null> {
  const cfg = API_URL ? { enabled: true, url: API_URL } : await gatewayConfig()
  return cfg?.enabled && cfg.url ? cfg.url.replace(/\/$/, '') : null
}
async function probe(): Promise<string | null> {
  const base = await configBase()
  if (!base) { health = { at: Date.now(), base: null }; return null }
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(6000) })
    const j = r.ok ? await r.json() : null
    const ok = j?.db === true
    if (ok) serverEpoch = Number(j.profileEpoch ?? 0)
    health = { at: Date.now(), base: ok ? base : null }
    if (!ok) markDown()
    else markUp()
    try { ok ? localStorage.setItem(LAST_KEY, JSON.stringify({ base, at: Date.now() })) : localStorage.removeItem(LAST_KEY) } catch { /* */ }
  } catch {
    health = { at: Date.now(), base: null }
    markDown()
  }
  return health.base
}
export const isOnline = async () => !!(await apiBase())

/* sessão: token guardado no aparelho e mandado em toda chamada; o servidor passa a ignorar o id do aparelho
   (que já vazou para outros participantes antes da correção) para quem tem sessão */
const SESSION_KEY = 'role.session'
export const getSession = () => { try { return localStorage.getItem(SESSION_KEY) ?? '' } catch { return '' } }
export const setSession = (t: string | null) => { try { t ? localStorage.setItem(SESSION_KEY, t) : localStorage.removeItem(SESSION_KEY) } catch { /* */ } }
let starting: Promise<boolean> | null = null
/** garante a sessão: pede a primeira se não houver; devolve false se o aparelho precisa entrar com Google */
export function ensureSession(): Promise<boolean> {
  if (getSession()) return Promise.resolve(true)
  if (starting) return starting
  starting = (async () => {
    const base = await apiBase()
    if (!base) return false
    try {
      const r = await fetch(`${base}/api/session/start`, { method: 'POST', headers: { 'X-Device': deviceId(), 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) })
      if (r.ok) { setSession(((await r.json()) as { token: string }).token); return true }
      if (r.status === 409 || r.status === 401) sessionLost = true
    } catch { /* fora do ar */ }
    return false
  })().finally(() => { starting = null })
  return starting
}
/** este aparelho já teve sessão e perdeu o token (limpou dados?): só volta entrando com Google */
export let sessionLost = false

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, opts: { admin?: boolean; timeout?: number } = {}, retried = false): Promise<T | null> {
  const base = await apiBase()
  if (!base) return null
  // toda chamada espera a sessão: deixar leitura ir sem ela criava corrida (a leitura sem token voltava 401 depois que
  // a sessão nascia e o app jogava fora o token válido; o aparelho ficava sem sessão de vez)
  if (!getSession() && path !== '/api/auth/google') await ensureSession()
  const sentWith = getSession()
  try {
    const r = await fetch(base + path, {
      method,
      headers: {
        'X-Device': deviceId(),
        ...(getSession() ? { 'X-Session': getSession() } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.admin ? { 'X-Admin-Key': getAdminKey() } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(opts.timeout ?? 4000),
      // keepalive só pra corpo pequeno: o navegador recusa keepalive acima de 64 KB (era isso que barrava as fotos)
      keepalive: method === 'POST' && (body ? JSON.stringify(body).length < 60_000 : true),
    })
    if (r.status === 401 && !retried && !opts.admin) {
      const j = await r.clone().json().catch(() => null)
      // só descarta o token se foi ele que o servidor recusou; sem token, só tenta de novo com o atual
      if (j?.error === 'session') {
        if (sentWith && getSession() === sentWith) setSession(null)
        if (getSession() || (await ensureSession())) return call<T>(method, path, body, opts, true)
      }
    }
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    // o endereço guardado pode ter mudado (túnel novo): confere de novo uma vez antes de desistir
    if (!retried) { const b = await apiBase(true); if (b && b !== base) return call<T>(method, path, body, opts, true) }
    markDown()
    health = { at: Date.now(), base: null }
    return null
  }
}

/* ---------- pedidos, votos, sugestões, decisão ---------- */
interface RemoteState {
  request: { id: string; text: string; criteria: RoleRequest['criteria']; optionIds: string[]; removed?: string[]; times: string[]; author: { name: string; hue: number }; createdAt: number; eventId?: string; places?: unknown[] }
  authorDevice: string
  groupId?: string
  voters?: 'link' | 'amigos'
  canVote?: boolean
  /** apelido deste aparelho no servidor (os ids reais não saem de lá) */
  me?: string
  decision: { placeId: string; time?: string; at: number } | null
  reopenedAt?: number | null
  votes: { device: string; kind: 'place' | 'time'; value: string; voter: string; at: number }[]
  suggestions: { id: string; placeId: string; byName: string; comment: string; hue: number; device: string; at: number; place?: unknown }[]
  slots?: { device: string; slot: string; voter: string; at: number }[]
  rsvps?: { device: string; status: Rsvp; voter: string; at: number }[]
  messages?: { id: string; device: string; voter: string; text: string; at: number }[]
  closesAt?: number | null
  participants?: { pid: string; handle?: string | null; photo?: number | null; name: string; hue: number; level: string; points: number; me: boolean; author: boolean }[]
  photos?: { id: string; device: string; voter: string; at: number }[]
}
export type Rsvp = 'vou' | 'talvez' | 'nao'
/** o que só existe no servidor (presença, recados, prazo): guardado em memória por pedido, vem junto do detalhe */
export interface GroupExtra { participants: NonNullable<RemoteState['participants']>; photos: { id: string; voter: string; at: number; mine: boolean }[]; rsvps: { status: Rsvp; voter: string; mine: boolean }[]; messages: { id: string; voter: string; text: string; at: number; mine: boolean }[]; closesAt: number | null; online: boolean; groupId?: string; voters: 'link' | 'amigos'; canVote: boolean }
const extras = new Map<string, GroupExtra>()
export const extraOf = (id: string): GroupExtra | undefined => extras.get(id)

const pushed = new Set<string>()
/** junta resumos por id (o primeiro vence) */
function mergeSnaps(a: unknown[], b?: unknown[]) {
  const seen = new Set<string>()
  return [...a, ...(b ?? [])].filter((s) => Array.isArray(s) && typeof s[0] === 'string' && !seen.has(s[0]) && seen.add(s[0]))
}

export async function pushRequest(r: RoleRequest, author: { name: string; hue: number }) {
  const ok = await call<{ ok: boolean; groupId?: string }>('POST', '/api/requests', {
    id: r.id, text: r.text, criteria: r.criteria, optionIds: r.optionIds ?? [], times: r.times ?? [], author, createdAt: r.createdAt, eventId: r.eventId,
    places: mergeSnaps(r.optSnaps ?? [], snapsFor(r.optionIds ?? [])), groupId: r.groupId,
  })
  if (ok) pushed.add(r.id)
  if (ok?.groupId && ok.groupId !== r.groupId) await db.requests.update(r.id, { groupId: ok.groupId })
  return !!ok
}
export const wasPushed = (id: string) => pushed.has(id)

/** puxa o estado compartilhado e mescla no IndexedDB. Devolve true se o backend respondeu. */
export async function syncRequest(id: string): Promise<boolean> {
  const s = await call<RemoteState>('GET', `/api/requests/${encodeURIComponent(id)}`, undefined, { timeout: 2500 })
  if (!s) return false
  const me = s.me ?? deviceId()
  const mine = s.authorDevice === me
  // lugares do Google que este aparelho ainda não conhece
  adoptSnaps([...(s.request.places ?? []), ...s.suggestions.map((x) => x.place).filter(Boolean)])
  const optionIds = s.request.optionIds.filter((x) => placeById.has(x))
  const local = await db.requests.get(id)
  const snaps = mergeSnaps(s.request.places ?? [], local?.optSnaps)
  if (!local) {
    await db.requests.add({
      id, authorId: mine ? 'me' : `ext-${id}`, text: s.request.text, criteria: s.request.criteria, createdAt: s.request.createdAt,
      status: 'aberto', optionIds, times: s.request.times, eventId: s.request.eventId, ...(mine ? {} : { externalAuthor: s.request.author }),
      optSnaps: snaps,
    })
  } else {
    // nunca encolhe a lista local por falta de resumo: só acrescenta opções novas (ex.: sugestão de alguém)
    // o que o autor tirou da votação sai de todo aparelho
    const removed = new Set(s.request.removed ?? [])
    const merged = [...(local.optionIds ?? []).filter((x) => !removed.has(x)), ...optionIds.filter((x) => !(local.optionIds ?? []).includes(x))].slice(0, 6)
    if (merged.join() !== (local.optionIds ?? []).join() || snaps.length !== (local.optSnaps?.length ?? 0)) await db.requests.update(id, { optionIds: merged, optSnaps: snaps })
  }
  // a autora reabriu a votação: volta pra aberto em todo aparelho
  if (!s.decision && s.reopenedAt) {
    const cur = await db.requests.get(id)
    if (cur?.status === 'decidido') await db.requests.update(id, { status: 'aberto', decidedPlaceId: undefined, decidedTime: undefined })
  }
  if (s.decision) {
    const cur = await db.requests.get(id)
    if (cur && (cur.status !== 'decidido' || cur.decidedPlaceId !== s.decision.placeId || cur.decidedTime !== s.decision.time)) {
      await db.requests.update(id, { status: 'decidido', decidedPlaceId: s.decision.placeId, decidedTime: s.decision.time })
    }
  }
  // votos de lugar de OUTROS aparelhos (os meus já estão no local); id estável = um voto por aparelho
  const remoteVotes = s.votes.filter((v) => v.device !== me && v.kind === 'place')
  // o retrato do servidor substitui o anterior (e limpa ids antigos, de antes dos apelidos)
  await db.votes.bulkDelete(await db.votes.where('requestId').equals(id).filter((v) => v.id.startsWith('rv-') && (v.kind ?? 'place') === 'place').primaryKeys())
  if (remoteVotes.length) {
    await db.votes.bulkPut(remoteVotes.map((v) => ({ id: `rv-${v.device}-${v.kind}-${id}`, requestId: id, kind: v.kind, placeId: v.value, voter: v.voter, createdAt: v.at })))
  }
  // horários: cada pessoa marca quantos quiser (disponibilidade); o retrato do servidor substitui o anterior
  const slotVotes = [...(s.slots ?? []).map((x) => ({ device: x.device, slot: x.slot, voter: x.voter, at: x.at })),
    ...s.votes.filter((v) => v.kind === 'time').map((v) => ({ device: v.device, slot: v.value, voter: v.voter, at: v.at }))].filter((x) => x.device !== me)
  const stale = await db.votes.where('requestId').equals(id).filter((v) => v.id.startsWith('rs-') || v.id.startsWith(`rv-`) && v.kind === 'time').primaryKeys()
  await db.votes.bulkDelete(stale)
  if (slotVotes.length) await db.votes.bulkPut(slotVotes.map((x) => ({ id: `rs-${x.device}-${x.slot}-${id}`, requestId: id, kind: 'time' as const, placeId: x.slot, voter: x.voter, createdAt: x.at })))
  extras.set(id, {
    rsvps: (s.rsvps ?? []).map((x) => ({ status: x.status, voter: x.voter, mine: x.device === me })),
    messages: (s.messages ?? []).map((x) => ({ id: x.id, voter: x.voter, text: x.text, at: x.at, mine: x.device === me })),
    closesAt: s.closesAt ?? null, online: true, participants: s.participants ?? [], groupId: s.groupId, voters: s.voters ?? 'link', canVote: s.canVote !== false,
    photos: (s.photos ?? []).map((x) => ({ id: x.id, voter: x.voter, at: x.at, mine: x.device === me })),
  })
  // sugestões que chegaram por qualquer aparelho viram respostas "sugestão pelo link"
  if (s.suggestions.length) {
    const existing = await db.answers.where('requestId').equals(id).toArray()
    const have = new Set(existing.filter((a) => a.kind === 'sugestao').map((a) => `${a.placeId}|${a.byName}`))
    const fresh = s.suggestions.filter((x) => placeById.has(x.placeId) && !have.has(`${x.placeId}|${x.byName}`) && !existing.some((a) => a.id === x.id))
    if (fresh.length) {
      await db.answers.bulkAdd(fresh.map((x) => ({
        id: x.id, requestId: id, userId: `ext-${x.byName}`, placeId: x.placeId, comment: x.comment, helpful: 0,
        createdAt: x.at, visibleAt: x.at, kind: 'sugestao' as const, byName: x.byName, byHue: x.hue,
      })))
    }
  }
  return true
}

export const pushVote = (rid: string, kind: 'place' | 'time', value: string, voter: string) =>
  call('POST', `/api/requests/${encodeURIComponent(rid)}/votes`, { kind, value, voter }).then(Boolean)
export const myRequests = () => call<{ id: string; createdAt: number }[]>('GET', '/api/requests/mine', undefined, { timeout: 5000 })
/** baixa pro aparelho os pedidos da conta que ainda não estão nele (celular novo, login em outro aparelho) */
export async function pullMyRequests() {
  const mine = (await myRequests()) ?? []
  let n = 0
  for (const x of mine) if (!(await db.requests.get(x.id)) && (await syncRequest(x.id).catch(() => false))) n++
  return n
}
export const myInvites = () => call<{ id: string; createdAt: number }[]>('GET', '/api/invites', undefined, { timeout: 4000 })
export const pushSlot = (rid: string, slot: string, on: boolean, voter: string) =>
  call('POST', `/api/requests/${encodeURIComponent(rid)}/slots`, { slot, on, voter }).then(Boolean)
export const pushRsvp = (rid: string, status: Rsvp, voter: string) =>
  call('POST', `/api/requests/${encodeURIComponent(rid)}/rsvp`, { status, voter }).then(Boolean)
export const pushMessage = (rid: string, text: string, voter: string) =>
  call<{ ok: boolean; id: string }>('POST', `/api/requests/${encodeURIComponent(rid)}/messages`, { text, voter }).then(Boolean)
export const pushDeadline = (rid: string, closesAt: number | null) =>
  call('POST', `/api/requests/${encodeURIComponent(rid)}/deadline`, { closesAt }).then(Boolean)
export const pushSuggestion = (rid: string, b: { placeId: string; by: string; comment: string; hue?: number }) => {
  const p = placeById.get(b.placeId)
  return call('POST', `/api/requests/${encodeURIComponent(rid)}/suggestions`, { ...b, place: p?.source ? snapOf(p) : undefined }).then(Boolean)
}
export const pushReopen = (rid: string) => call<{ ok: boolean }>('POST', `/api/requests/${encodeURIComponent(rid)}/reopen`, {}).then(Boolean)
/** endereço da foto de perfil (pública por apelido; ?v= troca quando a pessoa muda a foto) */
export function avatarUrl(pid?: string | null, v?: number | null): string | null {
  if (!pid || !v) return null
  const base = health?.base ?? lastGood()
  return base ? `${base}/media/a/${pid}.jpg?v=${v}` : null
}
export const uploadAvatar = (data: string | null) => call<{ ok: boolean; photo: number | null; pid: string }>('POST', '/api/me/photo', { data }, { timeout: 15000 })
export const pushDecision = (rid: string, placeId: string, time?: string) =>
  call('POST', `/api/requests/${encodeURIComponent(rid)}/decide`, { placeId, time }).then(Boolean)

/* ---------- eventos enviados + curadoria ---------- */
export const pushSubmission = (s: EventSubmission) =>
  call('POST', '/api/submissions', { id: s.id, draft: { ...stripLocal(s) } }).then(Boolean)
const stripLocal = (s: EventSubmission): EventDraft & { hue: number } => {
  const { id: _i, status: _s, origin: _o, at: _a, reviewedAt: _r, ...draft } = s
  return draft
}

/** status dos MEUS envios (quem enviou vê "aprovado" sem precisar de mensagem) */
export async function pullMySubmissions() {
  const list = await call<{ id: string; status: EventSubmission['status']; reviewed_at?: number }[]>('GET', '/api/submissions/mine')
  if (!list) return
  for (const r of list) {
    const local = await db.submissions.get(r.id)
    if (local && local.status !== r.status) await db.submissions.update(r.id, { status: r.status, reviewedAt: r.reviewed_at })
  }
}

/** fila da curadoria (precisa da chave): espelha no local como 'recebido' */
export async function pullQueue(): Promise<boolean> {
  if (!getAdminKey()) return false
  const list = await call<(EventDraft & { id: string; hue: number; status: EventSubmission['status']; at: number; reviewedAt?: number })[]>('GET', '/api/submissions', undefined, { admin: true })
  if (!list) return false
  for (const r of list) {
    const local = await db.submissions.get(r.id)
    if (!local) await db.submissions.add({ ...r, origin: 'recebido' })
    else if (local.status !== r.status) await db.submissions.update(r.id, { status: r.status, reviewedAt: r.reviewedAt })
  }
  return true
}
export const pushReview = (id: string, status: EventSubmission['status']) =>
  call('POST', `/api/submissions/${encodeURIComponent(id)}/status`, { status }, { admin: true }).then(Boolean)
export const checkAdmin = async () => !!(await call('GET', '/api/admin/check', undefined, { admin: true }))
/** papel deste aparelho (conta Google na lista de admins, curador promovido, ou chave da curadoria) */
export type Role = 'admin' | 'curador' | 'usuario'
export const myRole = async (): Promise<Role> => ((await call<{ ok: boolean; role: Role }>('GET', '/api/admin/check', undefined, { admin: true, timeout: 3000 }))?.role ?? 'usuario')
export interface AdminUser { device: string; name: string; hood: string | null; email: string | null; google: boolean; role: Role; createdAt: number }
export const adminUsers = () => call<AdminUser[]>('GET', '/api/admin/users', undefined, { admin: true, timeout: 5000 })
export const setUserRole = (device: string, role: 'usuario' | 'curador') => call<{ ok: boolean }>('POST', `/api/admin/users/${device}/role`, { role }, { admin: true })
export const publishedEvents = () => call<(EventDraft & { id: string; hue: number; at: number })[]>('GET', '/api/events', undefined, { timeout: 3000 })

/* ---------- métricas, feedback, leads ---------- */
let queue: TrackEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
export function enqueueEvent(e: TrackEvent) {
  queue.push(e)
  if (queue.length > 200) queue = queue.slice(-200)
  if (!timer) timer = setTimeout(flushEvents, 4000)
}
export async function flushEvents() {
  timer = null
  if (!queue.length) return
  const batch = queue.splice(0, 60)
  const ok = await call('POST', '/api/track', { events: batch })
  if (!ok) queue.unshift(...batch) // tenta de novo no próximo lote
  else if (queue.length) timer = setTimeout(flushEvents, 500)
}
if (typeof window !== 'undefined') {
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushEvents() })
}
export const pushFeedback = (f: Feedback) => call('POST', '/api/feedback', f)
export const pushLead = (l: Lead & { placeName?: string }) => call('POST', '/api/leads', l)
export const globalStats = () => call<GlobalStats>('GET', '/api/stats', undefined, { admin: true, timeout: 6000 })

export interface GlobalStats {
  counts: Record<string, number>
  total: number
  devices: number
  bySrc: Record<string, Record<string, number>>
  firstAt?: number
  lastAt?: number
  recent: { device: string; name: string; path: string; props: Record<string, unknown>; at: number }[]
  feedback: (Feedback & { at: number })[]
  leads: (Lead & { placeName?: string; at: number })[]
  totals: { requests: number; votes: number; suggestions: number; decided: number }
  base?: { places: number; areas: number }
  apis?: { month: Record<string, number>; today: Record<string, number> }
  funnel?: { people: { label: string; n: number }[]; requests: { label: string; n: number }[] }
  people?: { users: number; withGoogle: number; byHood: Record<string, number>; byNiche: Record<string, number>; reviews: number; groups: number; activeGroups: number; examples?: number; corrected?: number; unmet?: [string, number][] }
}

/* ---------- catálogo comunitário de lugares ---------- */
export const pushCommunityPlace = (p: import('../lib/types').Place, comment: string) =>
  call<{ ok: boolean; status: 'ok' | 'revisao'; motivo?: string; existing?: boolean }>('POST', '/api/places', { place: snapOf(p), comment, lat: p.lat, lng: p.lng }, { timeout: 12000 })
export const communityPlaces = () => call<unknown[]>('GET', '/api/places', undefined, { timeout: 3500 })
export interface PlaceReview { place: unknown[]; comment: string; status: 'ok' | 'revisao' | 'recusado'; motivo?: string; at: number; uses: number }
export const placesForReview = () => call<PlaceReview[]>('GET', '/api/places/review', undefined, { admin: true })
export const pushPlaceStatus = (id: string, status: 'ok' | 'recusado') =>
  call('POST', `/api/places/${encodeURIComponent(id)}/status`, { status }, { admin: true }).then(Boolean)

/* ---------- região (CEP/GPS → bairro) ---------- */
export interface GeoOut { lat: number; lng: number; label: string; city?: string }
export const geoCep = (cep: string) => call<GeoOut>('GET', `/api/geo/cep/${cep}`, undefined, { timeout: 15000 })
export const geoRev = (lat: number, lng: number) => call<GeoOut>('GET', `/api/geo/rev?lat=${lat}&lng=${lng}`, undefined, { timeout: 12000 })

/* ---------- pessoas: perfil, avaliações, turmas (LGPD: perfil só com consentimento) ---------- */
export const pushMe = (p: Profile) => (p.consentAt ? call<{ ok: boolean; handle?: string }>('POST', '/api/me', { consentAt: p.consentAt, profile: { name: p.name, handle: p.handle, hue: p.hue, hood: p.hood, niches: p.niches, vibes: p.vibes, home: p.home } }) : Promise.resolve(null))
export interface GoogleLogin {
  existing: boolean; device: string; session?: string; email: string; name?: string; profile?: Partial<Profile>; consentAt?: number
  reviews?: { id: string; place_id: string; request_id: string | null; verdict: Review['verdict']; note: string; place?: unknown; at: number }[]
}
export const googleLogin = (credential: string) => call<GoogleLogin>('POST', '/api/auth/google', { credential }, { timeout: 12000 })
export const deleteMe = () => call<{ ok: boolean }>('POST', '/api/me/delete', {}, { timeout: 8000 })
export const pushPlaceReview = (r: Review & { name: string; hue: number; placeName: string; place?: unknown }) =>
  call<{ ok: boolean; status: string }>('POST', '/api/reviews', { id: r.id, placeId: r.placeId, requestId: r.requestId, verdict: r.verdict, note: r.note, name: r.name, hue: r.hue, placeName: r.placeName, place: r.place, at: r.createdAt }, { timeout: 12000 })
export interface CommunityReviews { score: number | null; count: number; items: { id: string; name: string; hue: number; verdict: NonNullable<Review['verdict']>; note: string; at: number; mine: boolean; pending: boolean; pid: string }[] }
export const placeReviews = (id: string) => call<CommunityReviews>('GET', `/api/places/${encodeURIComponent(id)}/reviews`, undefined, { timeout: 4000 })
export const ratings = () => call<Record<string, [number, number]>>('GET', '/api/ratings', undefined, { timeout: 4000 })
export interface Turma { id: string; name: string | null; mine: boolean; admin?: boolean; updatedAt: number; visibility?: 'privada' | 'publica'; members: { name: string; hue: number; me: boolean; pid?: string; handle?: string | null; photo?: number | null; level?: string; owner?: boolean; admin?: boolean }[]; requests: { id: string; text: string; createdAt: number; decided: boolean; mine?: boolean }[] }
export const myGroups = () => call<Turma[]>('GET', '/api/groups', undefined, { timeout: 4000 })
export const renameGroup = (id: string, name: string) => call('POST', `/api/groups/${id}/name`, { name })
export const leaveGroup = (id: string) => call('POST', `/api/groups/${id}/leave`, {})
/** turma sem votação, link de convite e administração */
export const createGroup = (name: string) => call<{ ok: boolean; id: string }>('POST', '/api/groups', { name })
export const groupLink = (gid: string, reset = false) => call<{ ok: boolean; token: string }>('POST', `/api/groups/${gid}/link`, { reset }).then((r) => r?.token ?? null)
export interface GroupPeek { id: string; name: string | null; members: { name: string; hue: number; pid: string; photo: number | null }[]; count: number; member: boolean }
export const groupByLink = (token: string) => call<GroupPeek>('GET', `/api/groups/by-link/${encodeURIComponent(token)}`, undefined, { timeout: 6000 })
export const joinByLink = (token: string) => call<{ ok: boolean; id: string }>('POST', `/api/groups/by-link/${encodeURIComponent(token)}/join`, {})
export const manageMember = (gid: string, pid: string, action: 'admin' | 'membro' | 'remove') => call<{ ok: boolean }>('POST', `/api/groups/${gid}/members`, { pid, action }).then(Boolean)

/* ---------- aprendizado da IA: exemplos rotulados (pedido → critérios confirmados) ---------- */
export const pushExample = (e: { text: string; ai: unknown; final: unknown; corrected: boolean; unmet: string[]; engine: string }) => call('POST', '/api/examples', e)

export const deleteRequestRemote = (id: string) => call('POST', `/api/requests/${encodeURIComponent(id)}/delete`, {})

/* ---------- avisos (Web Push) ---------- */
export const pushKey = () => call<{ key: string }>('GET', '/api/push/key', undefined, { timeout: 4000 })
export const pushSubscribe = (sub: PushSubscriptionJSON) => call<{ ok: boolean }>('POST', '/api/push/subscribe', sub)

/* ---------- denúncias ---------- */
export type ReportKind = 'review' | 'message' | 'suggestion' | 'photo' | 'placephoto' | 'chat'
export const report = (kind: ReportKind, id: string, reason: string) => call('POST', '/api/reports', { kind, id, reason }).then(Boolean)
export interface OpenReport { kind: ReportKind; id: string; count: number; reasons: string[]; at: number; who: string; text: string }
export const openReports = () => call<OpenReport[]>('GET', '/api/admin/reports', undefined, { admin: true, timeout: 5000 })
export const resolveReport = (kind: ReportKind, id: string, action: 'remove' | 'keep') => call('POST', `/api/admin/reports/${kind}/${encodeURIComponent(id)}`, { action }, { admin: true }).then(Boolean)

/* ---------- fotos do rolê (guardadas no servidor) ---------- */
export const pushPhoto = (rid: string, dataUrl: string, voter: string, toPlace = false) =>
  call<{ ok: boolean; id: string }>('POST', `/api/requests/${encodeURIComponent(rid)}/photos`, { data: dataUrl, voter, toPlace }, { timeout: 30_000 })
export const deletePhoto = (id: string) => call('POST', `/api/photos/${id}/delete`, {}).then(Boolean)
export async function photoUrl(rid: string, id: string) { const b = await apiBase(); return b ? `${b}/media/${rid}/${id}.jpg` : null }

/* ---------- página da casa ---------- */
export interface Venue { status: 'livre' | 'pendente' | 'verificada' | 'recusada'; mine?: boolean; bio?: string; instagram?: string; groupMax?: number | null; offer?: string; sponsored?: boolean }
export const venueOf = (pid: string) => call<Venue>('GET', `/api/venues/${encodeURIComponent(pid)}`, undefined, { timeout: 4000 })
export const claimVenue = (pid: string, b: { name: string; role: string; contact: string; placeName: string }) => call('POST', `/api/venues/${encodeURIComponent(pid)}/claim`, b).then(Boolean)
export const saveVenue = (pid: string, b: { bio: string; instagram: string; groupMax: number | null; offer: string }) => call('POST', `/api/venues/${encodeURIComponent(pid)}`, b).then(Boolean)
export const venueReport = (pid: string) => call<{ views: number; inRequests: number; votes: number; wins: number; contacts: number }>('GET', `/api/venues/${encodeURIComponent(pid)}/report`, undefined, { admin: true })
export interface Claim { placeId: string; status: string; claim: { name: string; role: string; contact: string; placeName: string } | null; sponsoredUntil: number | null; at: number }
export const adminClaims = () => call<Claim[]>('GET', '/api/admin/claims', undefined, { admin: true })
export const actClaim = (pid: string, action: 'approve' | 'reject' | 'sponsor', days?: number) => call('POST', `/api/admin/claims/${encodeURIComponent(pid)}`, { action, days }, { admin: true }).then(Boolean)
/** ofertas e destaques ativos: carregados na abertura, usados pelo ranking e pelos cards */
export const venuesActive = new Map<string, { offer: string | null; sponsored: boolean }>()
export async function loadVenuesActive() {
  const r = await call<{ placeId: string; offer: string | null; sponsored: boolean }[]>('GET', '/api/venues/active', undefined, { timeout: 5000 })
  venuesActive.clear()
  for (const v of r ?? []) venuesActive.set(v.placeId, { offer: v.offer, sponsored: v.sponsored })
}

/* ---------- fotos do lugar que são nossas (casa e comunidade, com nota da IA) ---------- */
export interface OwnPhoto { id: string; source: 'casa' | 'comunidade'; score: number | null; url: string }
export async function placePhotos(pid: string): Promise<OwnPhoto[]> {
  const b = await apiBase()
  if (!b) return []
  const r = await call<{ id: string; source: 'casa' | 'comunidade'; score: number | null }[]>('GET', `/api/places/${encodeURIComponent(pid)}/photos`, undefined, { timeout: 4000 })
  return (r ?? []).map((x) => ({ ...x, url: `${b}/media/p/${pid}/${x.id}.jpg` }))
}
export const uploadPlacePhoto = (pid: string, dataUrl: string) => call<{ ok: boolean; id: string }>('POST', `/api/places/${encodeURIComponent(pid)}/photos`, { data: dataUrl }, { timeout: 30_000 })
export const allPlacePhotos = (pid: string) => call<{ id: string; source: string; score: number | null; reason: string | null; status: string }[]>('GET', `/api/places/${encodeURIComponent(pid)}/photos/all`)
export const deletePlacePhoto = (id: string) => call('POST', `/api/place-photos/${id}/delete`, {}).then(Boolean)

/* ---------- rede social ---------- */
export const setHandle = (handle: string) => call<{ ok: boolean; handle?: string; error?: 'taken' | 'handle' }>('POST', '/api/me/handle', { handle })
export const personByHandle = (h: string) => call<{ pid: string }>('GET', `/api/people/by-handle/${encodeURIComponent(h.replace(/^@/, ''))}`, undefined, { timeout: 5000 })
export interface InboxItem { id: string; kind: string; title: string; body: string; url: string; actor: string | null; at: number; read: boolean }
export const inbox = () => call<{ unread: number; items: InboxItem[] }>('GET', '/api/inbox', undefined, { timeout: 5000 })
export const inboxRead = (id?: string) => call('POST', '/api/inbox/read', id ? { id } : {}).then(Boolean)
export interface Rep { points: number; level: string; reviews: number; photos: number; closed: number }
export interface PersonCard { pid: string; handle?: string | null; photo?: number | null; name: string; hue: number; reputation: Rep }
export interface PersonPage { pid: string; handle?: string | null; photo?: number | null; requests?: { id: string; text: string; decided: boolean; place: string | null; time: string | null; at: number }[]; name: string; hue: number; hood: string | null; niches: string[]; me: boolean; relation: 'nenhuma' | 'enviado' | 'recebido' | 'amigos'; reputation: Rep
  reviews: { placeId: string; verdict: string; note: string; name: string | null; at: number }[]; lists: { id: string; title: string; places: unknown[]; updatedAt: number }[]; friendsCount: number; groups?: { id: string; name: string; members: number; member: boolean }[] }
export type FeedItem = { kind: 'review'; who: PersonCard; placeId: string; placeName: string | null; verdict: string; note: string; at: number }
  | { kind: 'list'; who: PersonCard; listId: string; title: string; count: number; at: number }
  | { kind: 'decided'; who: PersonCard; placeId: string; placeName: string | null; at: number }
  | { kind: 'request' | 'voted'; who: PersonCard; requestId: string; text: string; at: number }
/** convite pessoal pro app: quem entra pelo link vira amigo de quem convidou */
export const myInvite = () => call<{ ok: boolean; token: string }>('POST', '/api/invites', {}).then((r) => r?.token ?? null)
export const inviteInfo = (token: string) => call<{ name: string; hue: number; pid: string; handle: string | null; photo: number | null; me: boolean; relation: string }>('GET', `/api/invites/${encodeURIComponent(token)}`, undefined, { timeout: 6000 })
export const acceptInvite = (token: string) => call<{ ok: boolean }>('POST', `/api/invites/${encodeURIComponent(token)}/accept`, {})
export const person = (pid: string) => call<PersonPage>('GET', `/api/people/${pid}`, undefined, { timeout: 5000 })
export const personAction = (pid: string, a: 'add' | 'accept' | 'remove' | 'block' | 'unblock') => call<{ ok: boolean }>('POST', `/api/people/${pid}/${a}`, {}).then(Boolean)
export const searchPeople = (q: string) => call<(PersonCard & { hood: string | null; relation: string })[]>('GET', `/api/people?q=${encodeURIComponent(q)}`, undefined, { timeout: 5000 })
export const social = () => call<{ friends: PersonCard[]; incoming: PersonCard[]; sent: PersonCard[]; feed: FeedItem[] }>('GET', '/api/social', undefined, { timeout: 5000 })
export const ranking = (hood?: string, scope: 'amigos' | 'geral' = 'amigos') => call<(PersonCard & { hood: string | null; me: boolean })[]>('GET', `/api/ranking?scope=${scope}${hood ? `&hood=${encodeURIComponent(hood)}` : ''}`, undefined, { timeout: 5000 })
export interface UserList { id: string; title: string; places: unknown[]; public: boolean; updatedAt: number }
export const myLists = () => call<UserList[]>('GET', '/api/lists/mine', undefined, { timeout: 5000 })
export const listOf = (id: string) => call<UserList & { mine: boolean; owner: { pid: string; name: string; hue: number } }>('GET', `/api/lists/${id}`, undefined, { timeout: 5000 })
export const createList = (title: string, pub = true) => call<{ ok: boolean; id: string }>('POST', '/api/lists', { title, public: pub })
export const listAction = (id: string, a: 'add' | 'remove' | 'delete', place?: PlaceT) =>
  call('POST', `/api/lists/${id}/${a}`, place ? { placeId: place.id, place: place.source ? snapOf(place) : undefined } : {}).then(Boolean)
export interface ChatMsg { id: string; name: string; text: string; at: number; mine: boolean; pid: string | null; system?: boolean; ref?: string | null }
export const groupChat = (gid: string, since = 0) => call<ChatMsg[]>('GET', `/api/groups/${gid}/chat?since=${since}`, undefined, { timeout: 5000 })
export const sendChat = (gid: string, text: string, place?: PlaceT) => call('POST', `/api/groups/${gid}/chat`, place ? { text, placeId: place.id, place: place.source ? snapOf(place) : undefined } : { text }).then(Boolean)
/** lugar compartilhado no chat: 'place:[id, ...resumo]' → o lugar (registra no catálogo da sessão se veio do Google) */
export function chatPlace(ref?: string | null): PlaceT | null {
  if (!ref?.startsWith('place:')) return null
  try {
    const a = JSON.parse(ref.slice(6)) as unknown[]
    const id = String(a[0])
    if (placeById.has(id)) return placeById.get(id)!
    if (a.length > 1) { const p = fromSnap(a as never); if (p) { registerPlace(p); return p } }
  } catch { /* ref estranho */ }
  return null
}
export const pushTest = () => call<{ subs: number; results: string[] }>('POST', '/api/admin/push-test', {}, { admin: true, timeout: 15000 })

/* ---------- montar a votação (autor) ---------- */
/** tira uma opção ou põe um lugar na votação; o servidor é a fonte (todo aparelho vê igual) */
export async function editOption(rid: string, action: 'add' | 'remove', place: PlaceT) {
  const r = await call<{ ok: boolean; optionIds: string[] }>('POST', `/api/requests/${encodeURIComponent(rid)}/options`, { action, placeId: place.id, place: place.source ? snapOf(place) : undefined })
  if (!r) return false
  const local = await db.requests.get(rid)
  if (local) {
    const snaps = place.source && action === 'add' ? mergeSnaps([snapOf(place)], local.optSnaps) : local.optSnaps
    await db.requests.update(rid, { optionIds: r.optionIds.filter((x) => placeById.has(x) || x === place.id), optSnaps: snaps })
  }
  return true
}
export const setVoters = (rid: string, voters: 'link' | 'amigos') => call<{ ok: boolean }>('POST', `/api/requests/${encodeURIComponent(rid)}/settings`, { voters }).then(Boolean)
export const setGroupVisibility = (gid: string, visibility: 'privada' | 'publica') => call('POST', `/api/groups/${gid}/settings`, { visibility }).then(Boolean)
export const inviteToGroup = (gid: string, pid: string) => call<{ ok: boolean; already?: boolean }>('POST', `/api/groups/${gid}/invite`, { pid }).then(Boolean)
export const joinGroup = (gid: string) => call('POST', `/api/groups/${gid}/join`, {}).then(Boolean)
