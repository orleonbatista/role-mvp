import { useQuery } from '@tanstack/react-query'
import type { Place } from './types'
import { track } from './track'

/* Foto do Google nos cards: a referência vem grátis na busca; baixar a imagem conta na franquia de fotos
   (1.000/mês). Guarda por aparelho: 15 fotos/dia; só memória (o endereço final da foto é temporário). */
const KEY = import.meta.env.VITE_PLACES_KEY as string | undefined
const DAILY = 15
const k = () => `role.gphoto.${new Date().toISOString().slice(0, 10)}`
const used = () => { try { return Number(localStorage.getItem(k()) ?? 0) } catch { return DAILY } }

async function photoUrl(name: string, w: number): Promise<string | null> {
  if (!KEY || used() >= DAILY) return null
  try {
    localStorage.setItem(k(), String(used() + 1))
    track('google_call', { sku: 'photo' })
    const r = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&skipHttpRedirect=true&key=${KEY}`, { signal: AbortSignal.timeout(8000) })
    return r.ok ? ((await r.json()) as { photoUri?: string }).photoUri ?? null : null
  } catch { return null }
}

/** foto do card (enabled = só os primeiros cards de cada lista, pra caber na franquia) */
export function usePlacePhoto(p: Place, enabled: boolean, w = 480) {
  return useQuery({
    queryKey: ['gphoto', p.photo?.name, w],
    queryFn: () => photoUrl(p.photo!.name, w),
    enabled: enabled && !!p.photo?.name,
    staleTime: Infinity, gcTime: 60 * 60_000, retry: false,
  }).data ?? null
}
