import { track } from './track'
import type { Niche, Occasion, OpenPeriod, Place, PlaceKind, Vibe } from './types'
import { HOODS } from './labels'
import { parseRequest } from '../mocks/ranker'

/* Google Places API (New) direto do navegador.
   A chave é pública por natureza (vai no bundle) e é protegida por: restrição de site (só o domínio do rolê),
   restrição de API (só Places) e cotas diárias no Google Cloud (30 buscas/dia ⇒ dentro da cota grátis).
   Aqui ainda há uma guarda por aparelho, para um amigo empolgado não gastar a cota do dia sozinho. */

const KEY = import.meta.env.VITE_PLACES_KEY as string | undefined
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'
// Os campos pedidos definem a faixa cobrada: só campos da faixa Pro (5.000 buscas grátis/mês).
// Nota, nº de avaliações, nível de preço e horário são Enterprise (1.000/mês) e os termos não deixam
// guardá-los — quem vê nota e horário abre o Google Maps pelo link.
export const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress', 'places.location',
  'places.primaryType', 'places.primaryTypeDisplayName', 'places.types', 'places.priceRange',
  'places.googleMapsUri', 'places.addressComponents', 'places.businessStatus', 'places.photos',
].join(',')
const SP = { latitude: -23.5614, longitude: -46.6559 }
const DEVICE_DAILY = 20

export const placesEnabled = () => !!KEY

const dayKey = () => `role.places.${new Date().toISOString().slice(0, 10)}`
export function searchesLeftToday() {
  try { return Math.max(0, DEVICE_DAILY - Number(localStorage.getItem(dayKey()) ?? 0)) } catch { return DEVICE_DAILY }
}
function spend() {
  try { localStorage.setItem(dayKey(), String(Number(localStorage.getItem(dayKey()) ?? 0) + 1)) } catch { /* */ }
}

/* ---------- mapeamento Google → Place do rolê ---------- */
interface GPlace {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  shortFormattedAddress?: string
  location?: { latitude: number; longitude: number }
  primaryType?: string
  primaryTypeDisplayName?: { text: string }
  types?: string[]
  priceRange?: { startPrice?: { units?: string }; endPrice?: { units?: string } }
  googleMapsUri?: string
  addressComponents?: { longText: string; shortText: string; types: string[] }[]
  businessStatus?: string
  photos?: { name: string; authorAttributions?: { displayName?: string }[] }[]
}

const KIND_BY_TYPE: [RegExp, PlaceKind][] = [
  [/night_club|dance_hall/, 'balada'],
  [/restaurant|food_court|steak_house|pizzeria|bistro|brunch|diner|deli/, 'restaurante'],
  [/event_venue|concert_hall|amphitheatre|performing_arts|live_music|cultural_center/, 'evento'],
]
const NICHE_BY_TYPE: [RegExp, Niche][] = [
  [/night_club|dance_hall/, 'eletronica'],
  [/cocktail_bar|wine_bar|lounge_bar|bar$|^bar_/, 'drinks'],
  [/pub|brewery|beer|botequim/, 'boteco'],
  [/restaurant|food|bistro|pizzeria|steak|brunch/, 'gastronomia'],
  [/live_music|concert|jazz/, 'jazz'],
  [/park|garden|rooftop|beach/, 'ao-ar-livre'],
]
/** link pro Google Maps sem custo: pelo place_id (lugar do Google) ou pela busca nome + bairro (lugar do OSM) */
export const mapsUrlOf = (id: string, name = '', hood = '') => id.startsWith('g-')
  ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id.replace(/^g-/, ''))}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${hood} São Paulo`)}`
const hueOf = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 31, 0) % 360

function hoodOf(g: GPlace) {
  const sub = g.addressComponents?.find((c) => c.types.includes('sublocality_level_1') || c.types.includes('sublocality') || c.types.includes('neighborhood'))?.longText
  if (!sub) return g.shortFormattedAddress?.split(' - ').pop()?.split(',')[0]?.trim() || 'São Paulo'
  // casa com os bairros que o app conhece (distância, filtros), sem acento/caixa
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return HOODS.find((h) => n(sub).includes(n(h)) || n(h).includes(n(sub))) ?? sub
}


/** taxonomia do rolê: o tipo do Google ("Lanchonete", "Restaurante") nem sempre diz o que o lugar é pra quem sai.
 *  O nome manda quando é claro (Boteco Augusta é boteco, mesmo cadastrado como restaurante). */
export function ownType(name: string, types: string, googleLabel?: string): { label: string; kind?: Place['kind'] } {
  const n = name.toLowerCase()
  if (/night_club/.test(types)) return { label: 'Balada', kind: 'balada' }
  if (/cocktail_bar/.test(types) || /coquetel|cocktail|drinks?\b/.test(n)) return { label: 'Coquetelaria', kind: 'bar' }
  if (/wine_bar/.test(types) || /\bvinhos?\b|wine/.test(n)) return { label: 'Bar de vinhos', kind: 'bar' }
  if (/brewery|brewpub|beer_hall/.test(types) || /cervejaria|brew/.test(n)) return { label: 'Cervejaria', kind: 'bar' }
  if (/bot[ei]co|buteco|botequim/.test(n)) return { label: 'Boteco', kind: 'bar' }
  if (/\bpub\b/.test(types) || /\bpub\b/.test(n)) return { label: 'Pub', kind: 'bar' }
  if (/\bbar\b|choperia|chopp|choperia/.test(n) || /(^| )bar( |$)/.test(types)) return { label: 'Bar', kind: 'bar' }
  if (/restaurant/.test(types)) return { label: googleLabel && /restaurante/i.test(googleLabel) ? googleLabel : 'Restaurante', kind: 'restaurante' }
  return { label: googleLabel ?? 'Bar' }
}

/** query ajuda a estimar estilo/vibe: quem buscou "listening bar" quer um listening bar */
export function toPlace(g: GPlace, query = ''): Place {
  const types = [g.primaryType ?? '', ...(g.types ?? [])].join(' ')
  const own = ownType(g.displayName?.text ?? '', types, g.primaryTypeDisplayName?.text)
  const kind = own.kind ?? KIND_BY_TYPE.find(([re]) => re.test(types))?.[1] ?? 'bar'
  const fromQuery = query ? parseRequest(query) : null
  const niches = [...new Set([...(fromQuery?.niches ?? []), ...NICHE_BY_TYPE.filter(([re]) => re.test(types)).map(([, n]) => n)])].slice(0, 3) as Niche[]
  const vibes = (fromQuery?.vibes ?? []).slice(0, 2) as Vibe[]
  const occasions: Occasion[] = kind === 'restaurante' ? ['date', 'amigos', 'aniversario'] : kind === 'balada' ? ['amigos', 'solo', 'aniversario'] : ['amigos', 'date', 'aniversario']
  const range = g.priceRange ? [Number(g.priceRange.startPrice?.units), Number(g.priceRange.endPrice?.units)].filter((x) => x > 0) : []
  const price = range.length ? Math.round(range.reduce((a, b) => a + b, 0) / range.length) : kind === 'restaurante' ? 90 : 70
  const typeLabel = own.label
  return {
    id: `g-${g.id}`, name: g.displayName?.text ?? 'Lugar', kind, hood: hoodOf(g), niches: niches.length ? niches : ['drinks'], vibes, occasions,
    price, capacity: kind === 'balada' ? 300 : 40,
    // sem nota do Google (não pode ser guardada): neutra no ranking até a comunidade avaliar
    rating: 8, ratingCount: 0, hue: hueOf(g.id),
    tagline: typeLabel, description: g.formattedAddress ?? '', highlights: [],
    address: g.shortFormattedAddress ?? g.formattedAddress ?? '', hours: 'Ver horário no Google Maps', tags: [], privateSpace: false,
    periods: [{ days: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 24 }],
    source: 'google', mapsUrl: mapsUrlOf(g.id), lat: g.location?.latitude, lng: g.location?.longitude,
    ...(g.photos?.[0] ? { photo: { name: g.photos[0].name, by: g.photos[0].authorAttributions?.[0]?.displayName } } : {}),
  }
}

/* ---------- busca ---------- */
const cache = new Map<string, Place[]>()
export type PlacesResult = { ok: true; places: Place[] } | { ok: false; reason: 'off' | 'limite_aparelho' | 'limite_dia' | 'erro' }

export async function searchGoogle(query: string): Promise<PlacesResult> {
  if (!KEY) return { ok: false, reason: 'off' }
  const q = query.trim().slice(0, 80)
  const ck = q.toLowerCase()
  if (cache.has(ck)) return { ok: true, places: cache.get(ck)! }
  if (searchesLeftToday() <= 0) return { ok: false, reason: 'limite_aparelho' }
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({
        textQuery: /s[aã]o paulo|sp\b/i.test(q) ? q : `${q} São Paulo`,
        languageCode: 'pt-BR', regionCode: 'BR', pageSize: 8,
        locationBias: { circle: { center: SP, radius: 30000 } },
      }),
      signal: AbortSignal.timeout(8000),
    })
    spend()
    track('google_call', { sku: 'text_pro' })
    if (r.status === 429) return { ok: false, reason: 'limite_dia' }
    if (!r.ok) return { ok: false, reason: 'erro' }
    const j = (await r.json()) as { places?: GPlace[] }
    const places = (j.places ?? []).filter((g) => g.businessStatus !== 'CLOSED_PERMANENTLY').map((g) => toPlace(g, q))
    cache.set(ck, places)
    return { ok: true, places }
  } catch {
    return { ok: false, reason: 'erro' }
  }
}

/* ---------- lugar do catálogo comunitário circulando entre aparelhos ----------
   Do Google só o place_id (permitido guardar). Nome, bairro, estilo, vibe, ocasião e faixa de preço são os que
   a pessoa confirmou ao sugerir: conteúdo da comunidade. Nota/horário: link pro Google Maps. */
/** la/lo: coordenada (os termos do Google permitem guardar por 30 dias — o resumo inteiro sai em 30 dias) */
export interface SnapInfo { r?: number; c?: number; o?: boolean; b?: boolean; m?: boolean; g?: boolean; n?: string; la?: number; lo?: number }
export type PlaceSnap = [id: string, name: string, kind: PlaceKind, hood: string, niches: Niche[], price: number, vibes: Vibe[], occasions: Occasion[], base?: 'b' | '', info?: SnapInfo]
/** 9º item 'b' = lugar sem curadoria (descoberta ao vivo no Google): do outro lado não vira curado nem é salvo no aparelho */
export const snapOf = (p: Place, note?: string): PlaceSnap => {
  const L = p.live
  const info: SnapInfo | undefined = L || note || p.lat != null ? { r: L?.rating, c: L?.count, o: L?.outdoor, b: L?.beer, m: L?.music, g: L?.groups, n: note, la: p.lat, lo: p.lng } : undefined
  const head = [p.id, p.name, p.kind, p.hood, p.niches, p.price, p.vibes, p.occasions]
  return (info ? [...head, p.curation === 'base' ? 'b' : '', info] : p.curation === 'base' ? [...head, 'b'] : head) as PlaceSnap
}
export function fromSnap(s: unknown): Place | null {
  if (!Array.isArray(s) || typeof s[0] !== 'string' || !/^(g-[A-Za-z0-9_-]{5,120}|o-[nwr]\d{1,14})$/.test(s[0])) return null
  const [id, name, kind, hood, niches, price, vibes, occasions, b, info] = s as PlaceSnap
  const base = b === 'b'
  const k: PlaceKind = ['bar', 'restaurante', 'balada', 'evento'].includes(kind) ? kind : 'bar'
  const periods: OpenPeriod[] = [{ days: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 24 }]
  const arr = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).slice(0, n) : [])
  const occ = arr(occasions, 3) as Occasion[]
  return {
    id, name: String(name).slice(0, 80), kind: k, hood: String(hood).slice(0, 40), niches: arr(niches, 3) as Niche[],
    vibes: arr(vibes, 2) as Vibe[], occasions: occ.length ? occ : ['amigos'], price: Number(price) || 0, capacity: 40, rating: 8, ratingCount: 0,
    hue: hueOf(id), tagline: base ? (k === 'restaurante' ? 'Restaurante' : k === 'balada' ? 'Balada' : 'Bar') : 'Sugerido pela comunidade', description: '', highlights: [], address: String(hood).slice(0, 40), hours: 'Ver horário no Google Maps',
    tags: [], privateSpace: false, periods, source: id.startsWith('o-') ? 'osm' : 'google', mapsUrl: mapsUrlOf(id, String(name), String(hood)),
    ...(base ? { curation: 'base' as const } : {}),
    ...(info && typeof info === 'object' ? { shared: info, ...(Number.isFinite(info.la) && Number.isFinite(info.lo) ? { lat: info.la, lng: info.lo } : {}) } : {}),
  }
}
