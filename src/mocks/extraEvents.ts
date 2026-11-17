import type { EventDraft, EventFit, EventSubmission, Place, RoleRequest } from '../lib/types'
import { DAY_SHORT } from '../lib/hours'
import { db } from '../db/db'
import { rank } from './ranker'
import { isCurated, placeById, places, registerPlace } from './seeds/places'

/* Eventos que não vêm do seed: enviados por artistas/produtores/criadores e aprovados pela curadoria.
   Fonte global: eventos.json no repositório (lido em tempo de execução, como o llm.json) — publicar = commit.
   Fonte local: aprovações feitas neste aparelho (aparecem na hora, só aqui, até irem pro eventos.json). */

const EVENTS_URL = import.meta.env.VITE_EVENTS_URL as string | undefined

const dateOf = (d: string) => new Date(`${d}T12:00:00`)
export const eventWhen = (d: Pick<EventDraft, 'date' | 'hour'>) => {
  const dt = dateOf(d.date)
  return `${DAY_SHORT[dt.getDay()]} ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}, ${d.hour}h`
}
/** já passou (considera o dia inteiro do evento) */
export const isPast = (d: Pick<EventDraft, 'date'>) => dateOf(d.date).getTime() + 12 * 3_600_000 < Date.now()

export function toPlace(s: EventSubmission): Place {
  const dow = dateOf(s.date).getDay()
  const when = eventWhen(s)
  return {
    id: s.id, name: s.name, kind: 'evento', hood: s.hood, niches: s.niches, vibes: s.vibes, occasions: s.occasions,
    price: s.price, capacity: s.capacity,
    // sem histórico: nota neutra no ranking (nem bônus nem penalidade); a UI mostra "novo"
    rating: 8, ratingCount: 0, hue: s.hue,
    tagline: s.tagline, highlights: s.highlights.length ? s.highlights : [s.tagline],
    description: [s.tagline, ...s.highlights].join(' · '),
    address: `${s.hood}, São Paulo`, hours: when, when, tags: [], privateSpace: false,
    periods: [{ days: [dow], open: s.hour, close: s.hour + 6 }],
    promoter: s.by.handle, ticketUrl: s.ticketUrl, eventDate: s.date,
  }
}

async function fetchPublished(): Promise<EventSubmission[]> {
  if (!EVENTS_URL) return []
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 3000)
  try {
    const r = await fetch(`${EVENTS_URL}?t=${Math.floor(Date.now() / 120_000)}`, { signal: ctl.signal })
    const list = r.ok ? await r.json() : []
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string') : []
  } catch { return [] } finally { clearTimeout(t) }
}

/** roda no boot, antes de renderizar: publicados (global) + aprovados aqui (local) */
export async function loadExtraEvents() {
  // 3 fontes: eventos.json (manual), backend do PC (aprovados na curadoria) e aprovações deste aparelho
  const [published, fromApi, local] = await Promise.all([
    fetchPublished(),
    import('./remote').then((r) => r.publishedEvents()).catch(() => null),
    db.submissions.where('status').equals('aprovado').toArray().catch(() => []),
  ])
  const api = (fromApi ?? []).map((e) => sanitizeDraft(e) && { ...sanitizeDraft(e)!, id: e.id, hue: Number(e.hue) || 200, at: e.at ?? 0, origin: 'recebido' as const, status: 'aprovado' as const })
  for (const s of [...published, ...api.filter(Boolean) as EventSubmission[], ...local]) registerPlace(toPlace({ ...s, status: 'aprovado' }))
}

export function approveLocally(s: EventSubmission) {
  if (!placeById.has(s.id)) registerPlace(toPlace(s))
}

/** quantos pedidos da comunidade esse evento atenderia bem — é o critério de entrada da curadoria */
export function fitOf(draft: EventDraft, requests: RoleRequest[]): EventFit {
  const p = toPlace({ ...draft, id: 'preview', hue: 0, at: 0, status: 'pendente', origin: 'meu' })
  // critério: em quantos pedidos ele entraria no top 5, competindo com o catálogo inteiro
  const scored = requests.map((r) => {
    const ranked = rank([...places.filter((x) => x.id !== p.id && isCurated(x)), p], r.criteria)
    const pos = ranked.findIndex((x) => x.place.id === 'preview') + 1
    return { text: r.text, match: (ranked[pos - 1]?.match ?? 0) / 100, pos }
  }).sort((a, b) => a.pos - b.pos)
  return { total: requests.length, matches: scored.filter((x) => x.pos <= 5).length, top: scored.slice(0, 3).filter((x) => x.pos <= 10) }
}

/** validação mínima do que chega por link (nunca confiar no payload) */
export function sanitizeDraft(d: any): EventDraft | null {
  if (!d || typeof d.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) return null
  const str = (v: unknown, n: number) => String(v ?? '').slice(0, n)
  const arr = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => str(x, 40)).slice(0, n) : [])
  const url = str(d.ticketUrl, 300)
  return {
    name: str(d.name, 60), niches: arr(d.niches, 3) as any, vibes: arr(d.vibes, 2) as any, occasions: arr(d.occasions, 3) as any,
    hood: str(d.hood, 40), date: d.date, hour: Math.min(30, Math.max(0, Math.round(Number(d.hour) || 20))),
    price: Math.max(0, Math.round(Number(d.price) || 0)), capacity: Math.max(1, Math.round(Number(d.capacity) || 50)),
    tagline: str(d.tagline, 90), highlights: arr(d.highlights, 3),
    ticketUrl: /^https:\/\//.test(url) ? url : undefined,
    by: { handle: str(d.by?.handle, 32), role: (['artista', 'produtor', 'casa', 'criador'].includes(d.by?.role) ? d.by.role : 'criador'), contact: str(d.by?.contact, 40) || undefined },
  }
}
