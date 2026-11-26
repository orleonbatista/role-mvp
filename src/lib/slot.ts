import { DAY_SHORT } from './hours'

/** "Sex 20h" | "Sáb 29/11 21h30" → Date da próxima ocorrência a partir de `ref` (ou da data explícita) */
export function slotDate(label: string | undefined, ref: number): Date | null {
  if (!label) return null
  const hm = label.match(/(\d{1,2})h(\d{2})?/)
  if (!hm) return null
  const h = Number(hm[1]), mi = Number(hm[2] ?? 0)
  const dm = label.match(/(\d{1,2})\/(\d{1,2})/)
  const base = new Date(ref)
  if (dm) {
    const d = new Date(base.getFullYear(), Number(dm[2]) - 1, Number(dm[1]), h, mi)
    if (d.getTime() < ref - 180 * 86_400_000) d.setFullYear(d.getFullYear() + 1)
    return d
  }
  const wd = DAY_SHORT.findIndex((x) => label.toLowerCase().startsWith(x.toLowerCase()))
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, mi)
  if (wd >= 0) { d.setDate(d.getDate() + ((wd - base.getDay() + 7) % 7)); if (d.getTime() < ref - 3 * 3600_000) d.setDate(d.getDate() + 7) }
  return d
}

/** rótulo a partir de "2026-11-29" + "21:30" → "Sáb 29/11 21h30" */
export function slotLabel(date: string, time: string): string | null {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number)
  if (!y || !m || !d || Number.isNaN(h)) return null
  const dt = new Date(y, m - 1, d)
  return `${DAY_SHORT[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${h}h${mi ? String(mi).padStart(2, '0') : ''}`
}
