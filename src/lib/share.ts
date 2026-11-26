import type { EventDraft, RequestDetail } from './types'
import { placeById, places, seedCount } from '../mocks/seeds/places'
import { parseRequest, timeOptions, unmetFor } from '../mocks/ranker'
import { adoptSnaps, snapsFor } from '../mocks/gplaces'
import { snapOf } from './places'

/* Link autossuficiente e CURTO: o pedido vai comprimido no fragmento (#d=...), que nunca chega ao servidor.
   Só o essencial viaja (id, texto, opções, autor); critérios e horários são recalculados do texto.
   Formato v2: deflate-raw(JSON [id, texto, [índices dos lugares], autor, matiz]) em base64url.
   Links antigos (#p= JSON completo) continuam abrindo. */

export interface SharePayload {
  id: string
  text: string
  criteria: RequestDetail['request']['criteria']
  optionIds: string[]
  times: string[]
  author: { name: string; hue: number }
  createdAt: number
  snaps?: unknown[]
}

const toB64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}
const canCompress = () => typeof CompressionStream !== 'undefined'

/** lugar do seed vai como índice (curto); evento enviado pela comunidade vai pelo id */
const refOf = (id: string): number | string => {
  const i = places.findIndex((p) => p.id === id)
  return i < 0 ? -1 : i < seedCount() ? i : id
}
const idOf = (r: unknown) => (typeof r === 'string' ? (placeById.has(r) ? r : undefined) : (r as number) < seedCount() ? places[r as number]?.id : undefined)

export async function shareUrl(d: RequestDetail) {
  const idx = d.options.map((o) => refOf(o.id)).filter((i) => i !== -1)
  const ids = d.options.map((o) => o.id)
  // resumo salvo na criação (com motivo da IA e o que o Google confirmou) + o que estiver na memória
  const saved = (d.request.optSnaps ?? []).filter((s) => Array.isArray(s) && ids.includes(s[0]))
  const fresh = snapsFor(ids).filter((s) => !saved.some((x) => (x as unknown[])[0] === s[0]))
  const gs = [...saved, ...fresh]
  // 6º item (opcional): resumo dos lugares do Google, que o outro aparelho não tem no catálogo
  const compact = [d.request.id, d.request.text, idx, d.author.name.split(' ')[0], d.author.hue, ...(gs.length ? [gs] : [])]
  const json = new TextEncoder().encode(JSON.stringify(compact))
  const base = `${location.origin}${import.meta.env.BASE_URL}v/?id=${encodeURIComponent(d.request.id)}`
  if (canCompress()) return `${base}#d=${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`
  return `${base}#j=${toB64url(json)}`
}

function expand(arr: unknown): SharePayload | null {
  if (!Array.isArray(arr)) return null
  const [id, text, idx, name, hue, gs] = arr as [string, string, (number | string)[], string, number, unknown]
  if (typeof id !== 'string' || typeof text !== 'string') return null
  adoptSnaps(gs)
  const criteria = parseRequest(text)
  criteria.unmet = unmetFor(criteria, places)
  return {
    id, text, criteria, times: timeOptions(criteria),
    optionIds: (idx ?? []).map(idOf).filter(Boolean) as string[],
    author: { name: name || 'Alguém', hue: Number(hue) || 82 }, createdAt: Date.now(),
    snaps: Array.isArray(gs) ? gs.slice(0, 8) : undefined,
  }
}

export async function readPayload(hash: string): Promise<SharePayload | null> {
  try {
    const d = hash.match(/[#&]d=([A-Za-z0-9_-]+)/)
    if (d) return expand(JSON.parse(new TextDecoder().decode(await pipe(fromB64url(d[1]), new DecompressionStream('deflate-raw')))))
    const j = hash.match(/[#&]j=([A-Za-z0-9_-]+)/)
    if (j) return expand(JSON.parse(new TextDecoder().decode(fromB64url(j[1]))))
    const p = hash.match(/[#&]p=([A-Za-z0-9_-]+)/) // formato v1
    if (p) return JSON.parse(new TextDecoder().decode(fromB64url(p[1])))
  } catch { /* link corrompido */ }
  return null
}

export function shareText(d: RequestDetail) {
  const names = d.options.slice(0, 3).map((o) => o.name).join(', ')
  return `Bora decidir o rolê? “${d.request.text}”\nOpções: ${names}.\n👉 Vota aqui:`
}

/** mesmo link do pedido, mas abrindo a página "me indica um lugar" */
export const suggestUrl = (voteLink: string) => voteLink.replace('/v/?', '/v/?to=s&')

const b64 = (s: string) => toB64url(new TextEncoder().encode(s))
/** link de retorno: leva o pedido (#d=) + a sugestão (&g=) de volta ao autor */
export function returnUrl(voteLink: string, placeId: string, by: string, comment: string, hue: number) {
  const p = placeById.get(placeId)
  const g = b64(JSON.stringify([refOf(placeId), by.slice(0, 30), comment.slice(0, 140), hue, ...(p?.source ? [snapOf(p)] : [])]))
  return voteLink.replace('/v/?', '/v/?to=i&').replace(/[?&]src=[^&#]*/, '') + `&g=${g}`
}

export function readSuggestion(hash: string): { placeId: string; by: string; comment: string; hue: number } | null {
  const m = hash.match(/[#&]g=([A-Za-z0-9_-]+)/)
  if (!m) return null
  try {
    const [idx, by, comment, hue, snap] = JSON.parse(new TextDecoder().decode(fromB64url(m[1])))
    if (snap) adoptSnaps([snap])
    const pid = idOf(idx)
    return pid ? { placeId: pid, by: String(by || 'Alguém'), comment: String(comment ?? ''), hue: Number(hue) || 200 } : null
  } catch { return null }
}

/** reconstrói o link de votação a partir da URL atual (para montar o link de retorno) */
export function currentVoteLink() {
  const d = location.hash.match(/[#&](d|j|p)=([A-Za-z0-9_-]+)/)
  const id = location.pathname.split('/').filter(Boolean).pop() ?? ''
  return `${location.origin}${import.meta.env.BASE_URL}v/?id=${encodeURIComponent(id)}${d ? `#${d[1]}=${d[2]}` : ''}`
}

/* ---------- divulgação de eventos ---------- */
export const handleSlug = (h: string) => h.toLowerCase().normalize('NFD').replace(/[^a-z0-9_.]/g, '').slice(0, 24)
/** link de divulgação: abre o convite do evento (/e/) já com a origem do divulgador (cr_handle) */
export function promoteUrl(placeId: string, handle?: string) {
  const slug = handle ? handleSlug(handle) : ''
  return `${location.origin}${import.meta.env.BASE_URL}v/?to=e&id=${encodeURIComponent(placeId)}&src=${slug ? `cr_${slug}` : 'evt'}`
}
export function promoteText(p: { name: string; when?: string; hood: string; price: number }) {
  return `🎟 ${p.name}\n${[p.when, p.hood, p.price === 0 ? 'grátis' : `~R$ ${p.price}`].filter(Boolean).join(' · ')}\nBora? Monta a votação com teu grupo:`
}

/** envio pra curadoria: o evento inteiro vai comprimido no fragmento */
export async function curadoriaUrl(subId: string, draft: EventDraft) {
  const json = new TextEncoder().encode(JSON.stringify(draft))
  const base = `${location.origin}${import.meta.env.BASE_URL}v/?to=c&id=${encodeURIComponent(subId)}`
  if (canCompress()) return `${base}#d=${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`
  return `${base}#j=${toB64url(json)}`
}
export async function readDraft(hash: string): Promise<unknown> {
  try {
    const d = hash.match(/[#&]d=([A-Za-z0-9_-]+)/)
    if (d) return JSON.parse(new TextDecoder().decode(await pipe(fromB64url(d[1]), new DecompressionStream('deflate-raw'))))
    const j = hash.match(/[#&]j=([A-Za-z0-9_-]+)/)
    if (j) return JSON.parse(new TextDecoder().decode(fromB64url(j[1])))
  } catch { /* corrompido */ }
  return null
}
/** link fixo da bio do divulgador */
export const bioUrl = (handle: string) => {
  const slug = handleSlug(handle.replace(/^@/, ''))
  return `${location.origin}${import.meta.env.BASE_URL}v/?to=p&id=${slug}&src=cr_${slug}`
}
