import type { OpenPeriod, Place, PlaceKind, When } from './types'

export const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const DAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const fmtH = (h: number) => `${((h % 24) + 24) % 24}h`

export function defaultPeriods(kind: PlaceKind): OpenPeriod[] {
  switch (kind) {
    case 'balada': return [{ days: [4, 5, 6], open: 23, close: 30 }]
    case 'restaurante': return [{ days: [2, 3, 4, 5, 6, 0], open: 12, close: 15 }, { days: [2, 3, 4, 5, 6], open: 19, close: 23.5 }]
    default: return [{ days: [2, 3, 4, 5, 6, 0], open: 18, close: 25 }]
  }
}

/** aberto no dia/hora? considera períodos que passam da meia-noite */
export function isOpenAt(periods: OpenPeriod[], day: number, hour: number) {
  return periods.some((p) =>
    (p.days.includes(day) && hour >= p.open && hour < p.close) ||
    // madrugada: período do dia anterior que vai além das 24h
    (p.close > 24 && p.days.includes((day + 6) % 7) && hour + 24 >= p.open && hour + 24 < p.close),
  )
}

export function nowParts() {
  const d = new Date()
  return { day: d.getDay(), hour: d.getHours() + d.getMinutes() / 60 }
}

/** próxima abertura a partir de (day, hour), em até 7 dias */
export function nextOpening(periods: OpenPeriod[], day: number, hour: number): { day: number; hour: number } | null {
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7
    const opens = periods.filter((p) => p.days.includes(d)).map((p) => p.open).sort((a, b) => a - b)
    const h = opens.find((o) => i > 0 || o > hour)
    if (h !== undefined) return { day: d, hour: h }
  }
  return null
}

export function openStatus(place: Place, at = nowParts()): { open: boolean; label: string } {
  if (isOpenAt(place.periods, at.day, at.hour)) {
    const p = place.periods.find((x) => x.days.includes(at.day) && at.hour >= x.open) ?? place.periods[0]
    return { open: true, label: `Aberto · fecha ${fmtH(p.close)}` }
  }
  const n = nextOpening(place.periods, at.day, at.hour)
  if (!n) return { open: false, label: 'Fechado' }
  const when = n.day === at.day ? 'hoje' : n.day === (at.day + 1) % 7 ? 'amanhã' : DAY_SHORT[n.day].toLowerCase()
  return { open: false, label: `Abre ${when} ${fmtH(n.hour)}` }
}

export function hoursLabel(periods: OpenPeriod[]) {
  return periods
    .map((p) => {
      const ds = [...p.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      const range = ds.length > 2 ? `${DAY_SHORT[ds[0]]}–${DAY_SHORT[ds[ds.length - 1]]}` : ds.map((d) => DAY_SHORT[d]).join(', ')
      return `${range} · ${fmtH(p.open)}–${fmtH(p.close)}`
    })
    .join('  /  ')
}

export function whenLabel(w: When) {
  return w.label
}

/* ---------- distância aproximada por bairro ---------- */
const HOOD_COORD: Record<string, [number, number]> = {
  Pinheiros: [-23.5629, -46.6935], 'Vila Madalena': [-23.5535, -46.691], Centro: [-23.5455, -46.637],
  'Barra Funda': [-23.526, -46.666], Consolação: [-23.553, -46.66], Bixiga: [-23.559, -46.645],
  'Vila Mariana': [-23.589, -46.634], Itaim: [-23.584, -46.68], Mooca: [-23.558, -46.599],
  'Santa Cecília': [-23.539, -46.651], Liberdade: [-23.559, -46.634], 'Vila Prudente': [-23.583, -46.58],
}

export function distanceKm(a?: string, b?: string) {
  if (!a || !b || !HOOD_COORD[a] || !HOOD_COORD[b]) return undefined
  if (a === b) return 0.8
  const [la1, lo1] = HOOD_COORD[a], [la2, lo2] = HOOD_COORD[b]
  const R = 6371, dLa = ((la2 - la1) * Math.PI) / 180, dLo = ((lo2 - lo1) * Math.PI) / 180
  const h = Math.sin(dLa / 2) ** 2 + Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLo / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.3 * 10) / 10 // ×1.3 ≈ ruas, não linha reta
}

export const fmtKm = (km?: number) => (km === undefined ? '' : km < 1 ? 'pertinho' : `~${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`)
