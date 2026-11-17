import type { RequestDetail } from './types'

/* Link autossuficiente: o pedido vai junto no fragmento da URL (#p=...), então abre em qualquer aparelho
   sem backend. O fragmento não é enviado ao servidor. Votos ainda ficam em cada aparelho — agregar
   votos entre pessoas exige o backend compartilhado (próxima fase). */

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

export interface SharePayload {
  id: string
  text: string
  criteria: RequestDetail['request']['criteria']
  optionIds: string[]
  times: string[]
  author: { name: string; hue: number }
  createdAt: number
}

export function shareUrl(d: RequestDetail) {
  const payload: SharePayload = {
    id: d.request.id, text: d.request.text, criteria: d.request.criteria,
    optionIds: d.options.map((o) => o.id), times: d.times,
    author: { name: d.author.name.split(' ')[0], hue: d.author.hue }, createdAt: d.request.createdAt,
  }
  return `${location.origin}${import.meta.env.BASE_URL}r/${d.request.id}#p=${b64url(JSON.stringify(payload))}`
}

export function readPayload(hash: string): SharePayload | null {
  const m = hash.match(/p=([A-Za-z0-9_-]+)/)
  if (!m) return null
  try { return JSON.parse(unb64url(m[1])) } catch { return null }
}

export function shareText(d: RequestDetail) {
  const names = d.options.slice(0, 3).map((o) => o.name).join(', ')
  return `Bora decidir o rolê? “${d.request.text}”\nOpções: ${names}. Vota aqui:`
}
