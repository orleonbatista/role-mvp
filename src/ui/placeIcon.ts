import { AudioWaveform, Beer, CalendarDays, Disc3, Martini, Music, Sun, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { Niche, Place } from '../lib/types'

const BY_NICHE: Record<Niche, LucideIcon> = {
  listening: Disc3, eletronica: AudioWaveform, boteco: Beer, gastronomia: UtensilsCrossed,
  drinks: Martini, jazz: Music, 'ao-ar-livre': Sun,
}

/** ícone que identifica o tipo de lugar na capa (substitui foto enquanto não há fotos reais) */
export const placeIcon = (p: Place): LucideIcon => (p.kind === 'evento' ? CalendarDays : BY_NICHE[p.niches[0]] ?? Martini)
