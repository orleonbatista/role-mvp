import type { Home } from '../lib/types'
import { knownHoodNear, registerHood } from '../lib/hours'
import { baseLoad, baseNear, geoCep, geoRev } from './remote'
import { baseToPlace, type BaseRow } from './base'
import { registerPlace } from './seeds/places'

/* Região de quem usa: GPS ou CEP → coordenada arredondada (~1 km) + nome do bairro.
   No cadastro, o backend do PC carrega do OpenStreetMap os lugares reais em volta (uma vez por região, fica no
   SQLite) e o app registra como camada BASE: a IA usa como reserva e o painel do fundador mostra o que falta curar. */

const r2 = (x: number) => Math.round(x * 100) / 100
const isRow = (r: unknown): r is BaseRow => Array.isArray(r) && typeof r[0] === 'string' && /^o-[nwr]\d+$/.test(r[0]) && typeof r[1] === 'string'

/** bairro usado no app: o conhecido mais perto, senão o nome da região */
export function hoodFor(h: Pick<Home, 'lat' | 'lng' | 'label'>) {
  return knownHoodNear(h.lat, h.lng) ?? h.label
}

export type GeoResult = { ok: true; home: Home } | { ok: false; reason: 'negado' | 'indisponivel' | 'cep' | 'offline' }

export function gpsPosition(): Promise<{ lat: number; lng: number } | 'negado' | 'indisponivel'> {
  return new Promise((res) => {
    if (!('geolocation' in navigator)) return res('indisponivel')
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: r2(p.coords.latitude), lng: r2(p.coords.longitude) }),
      (e) => res(e.code === e.PERMISSION_DENIED ? 'negado' : 'indisponivel'),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600_000 },
    )
  })
}

export async function homeFromGps(): Promise<GeoResult> {
  const p = await gpsPosition()
  if (typeof p === 'string') return { ok: false, reason: p }
  const g = await geoRev(p.lat, p.lng)
  // sem backend: ainda dá pra usar a coordenada com o bairro conhecido mais perto
  const label = g?.label ?? knownHoodNear(p.lat, p.lng, 4) ?? 'Minha região'
  return { ok: true, home: { lat: p.lat, lng: p.lng, label, city: g?.city, via: 'gps' } }
}

export async function homeFromCep(cep: string): Promise<GeoResult> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return { ok: false, reason: 'cep' }
  const g = await geoCep(digits)
  if (!g) return { ok: false, reason: 'offline' }
  return { ok: true, home: { lat: g.lat, lng: g.lng, label: g.label, city: g.city, via: 'cep' } }
}

let regionCount = 0
export const regionPlaces = () => regionCount

/** lê do banco do PC os lugares em volta (rápido) e registra como base */
export async function loadRegion(home: Home) {
  registerHood(hoodFor(home), [home.lat, home.lng])
  const j = await baseNear(home.lat, home.lng, 3)
  if (!j) return 0
  for (const a of j.areas ?? []) registerHood(a.label, [a.lat, a.lng])
  let n = 0
  for (const r of j.rows ?? []) if (isRow(r)) { registerPlace(baseToPlace(r)); n++ }
  regionCount = n
  return n
}

/** no cadastro: garante a região no banco (consulta o OSM se for nova) e carrega no aparelho */
export async function ensureRegion(home: Home) {
  const out = await baseLoad(home.lat, home.lng, hoodFor(home))
  const n = await loadRegion(home)
  return { loaded: n, fresh: out ? !out.cached : false, ok: !!out }
}
