import type { Place } from './types'
import { gmatchGet, gmatchPut } from '../mocks/remote'

/* Google ao vivo na ficha do lugar (docs/10-plano-google.md).
   Nada do que vem daqui é salvo — fica só em memória enquanto o app está aberto. O único dado guardado é o
   place_id (no banco do PC, ligando o lugar do OSM ao Google), que os termos permitem.
   Custos: achar o place_id de um lugar do OSM usa Text Search "IDs only" (sem custo); a ficha é 1 Place Details
   Enterprise + 1 foto (1.000 grátis/mês cada; cota diária de 30 no Google Cloud + guarda por aparelho). */

const KEY = import.meta.env.VITE_PLACES_KEY as string | undefined
export const mapsEmbedOn = !!KEY && import.meta.env.VITE_MAPS_EMBED === '1'
const DEVICE_DAILY = 25

const BASIC = ['id', 'businessStatus', 'googleMapsUri', 'formattedAddress', 'currentOpeningHours', 'regularOpeningHours', 'rating', 'userRatingCount', 'nationalPhoneNumber', 'photos']
const GROUP = ['goodForGroups', 'reservable', 'liveMusic', 'outdoorSeating']

export interface LiveInfo {
  placeId: string
  status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  mapsUri?: string
  address?: string
  openNow?: boolean
  today?: string
  week?: string[]
  rating?: number
  ratings?: number
  phone?: string
  photo?: { url: string; author?: string; authorUri?: string }
  group?: { goodForGroups?: boolean; reservable?: boolean; liveMusic?: boolean; outdoorSeating?: boolean }
}
export type LiveResult = { ok: true; info: LiveInfo } | { ok: false; reason: 'off' | 'nao_achou' | 'limite' | 'erro' }

const dayKey = () => `role.glive.${new Date().toISOString().slice(0, 10)}`
const left = () => { try { return DEVICE_DAILY - Number(localStorage.getItem(dayKey()) ?? 0) } catch { return DEVICE_DAILY } }
const spend = () => { try { localStorage.setItem(dayKey(), String(Number(localStorage.getItem(dayKey()) ?? 0) + 1)) } catch { /* */ } }

const mem = new Map<string, LiveInfo>() // só memória: some ao fechar o app

async function resolvePlaceId(p: Place): Promise<string | null> {
  if (p.id.startsWith('g-')) return p.id.slice(2)
  if (!p.id.startsWith('o-')) return null
  const known = await gmatchGet(p.id)
  if (known) return known.placeId
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY!, 'X-Goog-FieldMask': 'places.id' }, // "IDs only": sem custo
    body: JSON.stringify({
      textQuery: p.name, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 1,
      ...(p.lat && p.lng ? { locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 250 } } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(String(r.status))
  const id = ((await r.json()) as { places?: { id: string }[] }).places?.[0]?.id ?? null
  gmatchPut(p.id, id)
  return id
}

interface GDetails {
  id: string; businessStatus?: LiveInfo['status']; googleMapsUri?: string; formattedAddress?: string; rating?: number; userRatingCount?: number
  nationalPhoneNumber?: string
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[]
  goodForGroups?: boolean; reservable?: boolean; liveMusic?: boolean; outdoorSeating?: boolean
}

export async function liveInfo(p: Place, opts: { group?: boolean } = {}): Promise<LiveResult> {
  if (!KEY) return { ok: false, reason: 'off' }
  const ck = `${p.id}|${opts.group ? 1 : 0}`
  if (mem.has(ck)) return { ok: true, info: mem.get(ck)! }
  if (left() <= 0) return { ok: false, reason: 'limite' }
  try {
    const pid = await resolvePlaceId(p)
    if (!pid) return { ok: false, reason: 'nao_achou' }
    spend()
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}?languageCode=pt-BR`, {
      headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': [...BASIC, ...(opts.group ? GROUP : [])].join(',') },
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 429) return { ok: false, reason: 'limite' }
    if (!r.ok) return { ok: false, reason: 'erro' }
    const g = (await r.json()) as GDetails
    const hours = g.currentOpeningHours ?? g.regularOpeningHours
    const week = hours?.weekdayDescriptions
    const dow = (new Date().getDay() + 6) % 7 // Google: segunda = 0
    const ph = g.photos?.[0]
    const info: LiveInfo = {
      placeId: pid, status: g.businessStatus, mapsUri: g.googleMapsUri, address: g.formattedAddress,
      openNow: hours?.openNow, week, today: week?.[dow]?.replace(/^[^:]+:\s*/, ''),
      rating: g.rating, ratings: g.userRatingCount, phone: g.nationalPhoneNumber,
      photo: ph ? { url: `https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=800&key=${KEY}`, author: ph.authorAttributions?.[0]?.displayName, authorUri: ph.authorAttributions?.[0]?.uri } : undefined,
      group: opts.group ? { goodForGroups: g.goodForGroups, reservable: g.reservable, liveMusic: g.liveMusic, outdoorSeating: g.outdoorSeating } : undefined,
    }
    mem.set(ck, info)
    return { ok: true, info }
  } catch {
    return { ok: false, reason: 'erro' }
  }
}

export const embedUrl = (placeId: string) => `https://www.google.com/maps/embed/v1/place?key=${KEY}&q=place_id:${encodeURIComponent(placeId)}&language=pt-BR`
export const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil` : String(n))
