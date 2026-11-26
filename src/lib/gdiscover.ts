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

/** limites do dia batidos neste aparelho (a tela avisa em vez de falhar em silêncio) */
export const limits = { basic: false, rich: false }

const done = new Map<string, Promise<Place[]>>() // memória da sessão: mesma busca não repete
const km = (a: { lat: number; lng: number }, b: Place) => (b.lat == null || b.lng == null ? 99 : Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 102))

export async function discover(query: string, center: { lat: number; lng: number }, radius = RADIUS): Promise<Place[]> {
  if (!KEY) return []
  const ck = `${query}|${center.lat.toFixed(2)},${center.lng.toFixed(2)}|${radius}`
  if (!done.has(ck)) {
    if (used() >= DEVICE_DAILY) { limits.basic = true; return [] }
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

/* ---------- pedido: busca rica (1 chamada) com confirmação ao vivo ----------
   Text Search com nota, horário e atributos (área externa, cerveja, grupo, música): faixa Enterprise + Atmosphere
   (1.000 grátis/mês) — uma chamada por pedido traz até 20 lugares já com o que precisa ser confirmado. */
const RICH = [FIELDS, 'places.rating', 'places.userRatingCount', 'places.regularOpeningHours', 'places.outdoorSeating', 'places.servesBeer',
  'places.goodForGroups', 'places.liveMusic', 'places.servesCocktails'].join(',')
const RICH_DAILY = 12
const richKey = () => `role.grich.${new Date().toISOString().slice(0, 10)}`
const richUsed = () => { try { return Number(localStorage.getItem(richKey()) ?? 0) } catch { return 0 } }

interface GHours { periods?: { open: { day: number; hour: number; minute?: number }; close?: { day: number; hour: number; minute?: number } }[] }
/** horário do Google → períodos do app (dia 0 = domingo nos dois); fecha depois da meia-noite vira > 24 */
export function periodsFrom(h?: GHours): Place['periods'] | null {
  if (!h?.periods?.length) return null
  if (h.periods.length === 1 && !h.periods[0].close) return [{ days: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 24 }]
  return h.periods.filter((p) => p.close).map((p) => {
    const open = p.open.hour + (p.open.minute ?? 0) / 60
    let close = p.close!.hour + (p.close!.minute ?? 0) / 60
    if (p.close!.day !== p.open.day || close <= open) close += 24
    return { days: [p.open.day], open, close }
  })
}

/** tira do texto o que não é "o quê" (distância, dia, hora, quantas pessoas) — o Google entende o resto */
export function cleanQuery(text: string) {
  return text.toLowerCase()
    .replace(/\b(ate|até|em|num raio de|raio de|no m[aá]ximo|a)\s*\d{1,2}\s*(km|quil[oô]metros?)\b/g, ' ')
    .replace(/\b(da|na|perto da|pela)?\s*minha regi[aã]o\b|\bperto de (mim|casa)\b|\baqui perto\b|\bperto daqui\b/g, ' ')
    .replace(/\b(no|na|de|do|nesse|nessa|neste|nesta|pra|para|à|a)?\s*(fim|final) d[ae] (tarde|semana)\b/g, ' ')
    .replace(/\b(de|na|no|nesta|neste|nessa|nesse|essa|esse|pra|para|à|a)?\s*(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(-feira)?\b/g, ' ')
    .replace(/\b(hoje|amanh[aã]|agora|[àa] noite|de noite|[àa] tarde|de tarde|de manh[aã])\b/g, ' ')
    .replace(/\b(pra|para|com|somos)?\s*\d{1,3}\s*(pessoas|amigos|amigas)\b|\bat[eé]\s*r?\$?\s*\d{2,4}\s*(reais|conto)?\b|\br\$\s*\d+/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

/** pedido: busca a frase do pedido (limpa) com raio de verdade (retângulo), já confirmando nota/horário/atributos */
export async function discoverForRequest(c: Criteria, home?: Home, text = '') {
  const at = c.hood ? hoodCoord(c.hood) : undefined
  const center = at ? { lat: at[0], lng: at[1] } : home
  if (!center || !KEY) return 0
  const radiusKm = c.hood ? 2.5 : Math.min(20, c.maxKm ?? 5)
  let q = cleanQuery(text)
  if (q.split(' ').length < 2) q = (c.niches.length ? c.niches.slice(0, 2).map((x) => QUERY[x] ?? 'bar').join(' ') : 'bar') + (q ? ` ${q}` : '')
  if (c.hood && !q.includes(c.hood.toLowerCase())) q += ` ${c.hood}`
  const ck = `rich|${q}|${center.lat.toFixed(2)},${center.lng.toFixed(2)}|${radiusKm}`
  if (done.has(ck)) return (await done.get(ck)!).length
  if (richUsed() >= RICH_DAILY) {
    limits.rich = true
    // sem cota rica no aparelho: cai pra busca simples (sem confirmação)
    const lists = await Promise.all((c.niches.length ? c.niches.slice(0, 2) : (['drinks'] as Niche[])).map((x) => discover(QUERY[x] ?? 'bar', center, radiusKm * 1000)))
    return lists.flat().length
  }
  done.set(ck, (async () => {
    try {
      try { localStorage.setItem(richKey(), String(richUsed() + 1)) } catch { /* */ }
      const dLa = radiusKm / 111, dLo = radiusKm / 102
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': RICH },
        body: JSON.stringify({
          textQuery: q, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20,
          locationRestriction: { rectangle: { low: { latitude: center.lat - dLa, longitude: center.lng - dLo }, high: { latitude: center.lat + dLa, longitude: center.lng + dLo } } },
        }),
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) { done.delete(ck); return [] }
      type G = Parameters<typeof toPlace>[0] & { rating?: number; userRatingCount?: number; regularOpeningHours?: GHours; outdoorSeating?: boolean; servesBeer?: boolean; goodForGroups?: boolean; liveMusic?: boolean; servesCocktails?: boolean }
      const j = (await r.json()) as { places?: G[] }
      const out: Place[] = []
      for (const g of j.places ?? []) {
        if (g.businessStatus && g.businessStatus !== 'OPERATIONAL') continue
        const base = toPlace(g, q)
        if (km(center, base) > radiusKm) continue // raio pedido, em linha reta
        const periods = periodsFrom(g.regularOpeningHours)
        const p: Place = {
          ...base, curation: 'base', ...(periods ? { periods } : {}),
          live: { rating: g.rating, count: g.userRatingCount, outdoor: g.outdoorSeating, beer: g.servesBeer, groups: g.goodForGroups, music: g.liveMusic, cocktails: g.servesCocktails, hours: !!periods },
        }
        registerPlace(p, true)
        out.push(p)
      }
      return out
    } catch { done.delete(ck); return [] }
  })())
  return (await done.get(ck)!).length
}

/** centro de quem usa: região do cadastro ou centro do bairro escolhido */
export function centerOf(me?: { home?: Home; hood?: string } | null) {
  if (me?.home) return { lat: me.home.lat, lng: me.home.lng }
  const h = me?.hood ? hoodCoord(me.hood) : undefined
  return h ? { lat: h[0], lng: h[1] } : undefined
}
