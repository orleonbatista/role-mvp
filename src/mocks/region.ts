import type { Home } from '../lib/types'
import { knownHoodNear } from '../lib/hours'
import { geoCep, geoRev, isOnline } from './remote'

/* Região de quem usa: GPS ou CEP → coordenada arredondada (~1 km) + nome do bairro. A descoberta de lugares em
   volta é feita ao vivo no Google (lib/gdiscover.ts). */

const r2 = (x: number) => Math.round(x * 100) / 100

/** bairro usado no app: o conhecido mais perto, senão o nome da região */
export function hoodFor(h: Pick<Home, 'lat' | 'lng' | 'label'>) {
  return knownHoodNear(h.lat, h.lng) ?? h.label
}

export type GeoResult = { ok: true; home: Home } | { ok: false; reason: 'negado' | 'indisponivel' | 'cep' | 'naoachei' | 'offline' }

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
  // CEP que não existe e servidor fora são coisas diferentes pra quem está digitando
  if (!g) return { ok: false, reason: (await isOnline()) ? 'naoachei' : 'offline' }
  return { ok: true, home: { lat: g.lat, lng: g.lng, label: g.label, city: g.city, via: 'cep' } }
}

