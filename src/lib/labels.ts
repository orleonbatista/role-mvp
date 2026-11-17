import type { Niche, Occasion, PlaceKind, Verdict, Vibe } from './types'

export const NICHES: { id: Niche; label: string; hint: string }[] = [
  { id: 'listening', label: 'Listening bar', hint: 'som bom, vinil, conversa' },
  { id: 'eletronica', label: 'Eletrônica', hint: 'pista, techno, house' },
  { id: 'boteco', label: 'Boteco & acepipes', hint: 'torresmo, chopp, raiz' },
  { id: 'gastronomia', label: 'Gastronomia', hint: 'jantar que vale a ida' },
  { id: 'drinks', label: 'Drinks', hint: 'coquetel, vinho, rooftop' },
  { id: 'jazz', label: 'Jazz & ao vivo', hint: 'sax, trio, porão' },
  { id: 'ao-ar-livre', label: 'Ao ar livre', hint: 'quintal, laje, sol' },
]

export const VIBES: { id: Vibe; label: string }[] = [
  { id: 'tranquilo', label: 'Tranquilo' },
  { id: 'animado', label: 'Animado' },
  { id: 'intimista', label: 'Intimista' },
  { id: 'underground', label: 'Underground' },
  { id: 'descolado', label: 'Descolado' },
  { id: 'raiz', label: 'Raiz' },
  { id: 'sofisticado', label: 'Sofisticado' },
]

export const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: 'aniversario', label: 'Aniversário' },
  { id: 'date', label: 'Date' },
  { id: 'amigos', label: 'Com amigos' },
  { id: 'trabalho', label: 'Happy hour' },
  { id: 'esquenta', label: 'Esquenta' },
  { id: 'solo', label: 'Solo' },
]

export const KIND_LABEL: Record<PlaceKind, string> = {
  bar: 'Bar',
  restaurante: 'Restaurante',
  balada: 'Balada',
  evento: 'Evento',
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  amei: 'Amei',
  ok: 'Foi ok',
  'nao-curti': 'Não curti',
}

export const HOODS = [
  'Pinheiros', 'Vila Madalena', 'Centro', 'Barra Funda', 'Consolação', 'Bixiga',
  'Vila Mariana', 'Itaim', 'Mooca', 'Santa Cecília', 'Liberdade', 'Vila Prudente',
]

export const nicheLabel = (n: Niche) => NICHES.find((x) => x.id === n)?.label ?? n
export const vibeLabel = (v: Vibe) => VIBES.find((x) => x.id === v)?.label ?? v
export const occasionLabel = (o: Occasion) => OCCASIONS.find((x) => x.id === o)?.label ?? o

export const priceLabel = (p: number) => (p === 0 ? 'Grátis' : `~R$ ${p}`)

export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'agora'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h`
  return `${Math.round(h / 24)} d`
}
