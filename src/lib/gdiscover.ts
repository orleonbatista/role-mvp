import type { Criteria, Home, Niche, Place } from './types'
import { FIELDS, toPlace } from './places'
import { hoodCoord } from './hours'
import { registerPlace } from '../mocks/seeds/places'

/* Descoberta só pelo Google (Text Search, campos Pro: 5.000 grátis/mês; cota diária no Google Cloud).
   Só entram lugares em funcionamento (businessStatus OPERATIONAL). Nada é salvo: os resultados ficam em memória
   enquanto o app está aberto (camada BASE, "sem curadoria"); o que a comunidade confirma vira curado e aí sim é
   guardado — só o place_id + o que a pessoa confirmou. */

const KEY = import.meta.env.VITE_PLACES_KEY as string | undefined
const DEVICE_DAILY = 30
const RADIUS = 5000

const QUERY: Record<Niche, string> = {
  jazz: 'bar com música ao vivo jazz', listening: 'listening bar vinil', eletronica: 'balada música eletrônica',
  drinks: 'bar de drinks coquetelaria', boteco: 'boteco', gastronomia: 'restaurante', 'ao-ar-livre': 'bar ao ar livre',
  samba: 'roda de samba', rock: 'bar de rock', indie: 'bar alternativo',
} as Record<Niche, string>

const dayKey = () => `role.gdisc.${new Date().toISOString().slice(0, 10)}`
const used = () => { try { return Number(localStorage.getItem(dayKey()) ?? 0) } catch { return 0 } }
const spend = () => { try { localStorage.setItem(dayKey(), String(used() + 1)) } catch { /* */ } }

const done = new Map<string, Promise<Place[]>>() // memória da sessão: mesma busca não repete
const km = (a: { lat: number; lng: number }, b: Place) => (b.lat == null || b.lng == null ? 99 : Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 102))

export async function discover(query: string, center: { lat: number; lng: number }, radius = RADIUS): Promise<Place[]> {
  if (!KEY) return []
  const ck = `${query}|${center.lat.toFixed(2)},${center.lng.toFixed(2)}|${radius}`
  if (!done.has(ck)) {
    if (used() >= DEVICE_DAILY) return []
    done.set(ck, (async () => {
      try {
        spend()
        const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS },
          body: JSON.stringify({
            textQuery: query, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20,
            locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
          }),
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) { done.delete(ck); return [] }
        const j = (await r.json()) as { places?: Parameters<typeof toPlace>[0][] }
        const out: Place[] = []
        for (const g of j.places ?? []) {
          if (g.businessStatus && g.businessStatus !== 'OPERATIONAL') continue // fechou (temporária ou definitivamente)
          const p: Place = { ...toPlace(g, query), curation: 'base' }
          if (km(center, p) > (radius / 1000) * 1.3) continue
          registerPlace(p)
          out.push(p)
        }
        return out
      } catch { done.delete(ck); return [] }
    })())
  }
  return done.get(ck)!
}

/** feed do cadastro/abertura: lugares abertos em até 5 km que combinam com o gosto (até 3 estilos = 3 buscas) */
export async function discoverForTaste(center: { lat: number; lng: number } | undefined, niches: Niche[]) {
  if (!center) return 0
  const qs = (niches.length ? niches : (['drinks', 'boteco'] as Niche[])).slice(0, 3).map((n) => QUERY[n] ?? 'bar')
  const lists = await Promise.all(qs.map((q) => discover(q, center)))
  return new Set(lists.flat().map((p) => p.id)).size
}

/** pedido: busca o que o pedido descreve, perto do bairro pedido (ou de quem pede) */
export async function discoverForRequest(c: Criteria, home?: Home) {
  const at = c.hood ? hoodCoord(c.hood) : undefined
  const center = at ? { lat: at[0], lng: at[1] } : home
  if (!center) return 0
  const n = c.niches.slice(0, 2)
  const qs = n.length ? n.map((x) => QUERY[x] ?? 'bar') : [c.occasion === 'date' ? 'bar para date' : c.occasion === 'aniversario' ? 'bar para aniversário' : 'bar']
  const radius = c.hood ? 2500 : Math.min(20, c.maxKm ?? 5) * 1000
  const lists = await Promise.all(qs.map((q) => discover(`${q}${c.hood ? ` ${c.hood}` : ''}`, center, radius)))
  return lists.flat().length
}

/** centro de quem usa: região do cadastro ou centro do bairro escolhido */
export function centerOf(me?: { home?: Home; hood?: string } | null) {
  if (me?.home) return { lat: me.home.lat, lng: me.home.lng }
  const h = me?.hood ? hoodCoord(me.hood) : undefined
  return h ? { lat: h[0], lng: h[1] } : undefined
}
