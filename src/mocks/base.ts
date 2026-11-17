import type { Niche, Place, PlaceKind } from '../lib/types'
import { defaultPeriods } from '../lib/hours'
import { mapsUrlOf } from '../lib/places'
import { registerPlace } from './seeds/places'

/* Camada BASE: lugares reais do OpenStreetMap (© colaboradores do OpenStreetMap, ODbL), gerados por
   llm-gateway/tools/fetch-osm.mjs em public/base-sp.json. Não aparecem no feed: a IA usa como reserva
   quando nada curado atende, sempre marcados "sem curadoria", e a busca de sugestões acha nomes reais. */

type Row = [id: string, name: string, kind: PlaceKind, hood: string, niches: Niche[], price: number, lat: number, lng: number, cuisine: string, hours: string]
export let baseInfo = { count: 0, at: '' }
const hueOf = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 29, 0) % 360

export function baseToPlace([id, name, kind, hood, niches, price, lat, lng, cuisine, hours]: Row): Place {
  const label = kind === 'restaurante' ? `Restaurante${cuisine ? ` · ${cuisine.split(';')[0].replace(/_/g, ' ')}` : ''}` : kind === 'balada' ? 'Balada' : 'Bar'
  return {
    id, name, kind, hood, niches: niches.length ? niches : ['drinks'], vibes: [], occasions: kind === 'restaurante' ? ['date', 'amigos'] : ['amigos'],
    price, capacity: kind === 'balada' ? 200 : 40, rating: 8, ratingCount: 0, hue: hueOf(id),
    tagline: label, description: '', highlights: [], address: `${hood}, São Paulo`,
    hours: hours || 'Ver horário no Google Maps', tags: [], privateSpace: false, periods: defaultPeriods(kind),
    source: 'osm', curation: 'base', lat, lng, mapsUrl: mapsUrlOf(id, name, hood),
  }
}

export async function loadBase() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}base-sp.json`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return
    const j = (await r.json()) as { at: string; rows: Row[] }
    for (const row of j.rows) registerPlace(baseToPlace(row))
    baseInfo = { count: j.rows.length, at: j.at }
  } catch { /* sem base: o app segue com o que é curado */ }
}
