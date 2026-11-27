import { useQuery } from '@tanstack/react-query'
import type { Place } from './types'
import { track } from './track'

/* Foto do Google nos cards: a referência vem grátis na busca; baixar a imagem conta na franquia de fotos
   (1.000/mês). Guarda por aparelho: 15 fotos/dia; só memória (o endereço final da foto é temporário). */
const KEY = import.meta.env.VITE_PLACES_KEY as string | undefined
const DAILY = 40
const k = () => `role.gphoto.${new Date().toISOString().slice(0, 10)}`
const used = () => { try { return Number(localStorage.getItem(k()) ?? 0) } catch { return DAILY } }
// endereço da foto reaproveitado no mesmo dia (antes cada reabertura gastava a cota de novo e as fotos sumiam)
const CK = 'role.gphoto.uri'
const cached = (key: string): string | null => { try { const m = JSON.parse(sessionStorage.getItem(CK) ?? '{}'); const e = m[key]; return e && Date.now() - e[1] < 6 * 3600_000 ? e[0] : null } catch { return null } }
const remember = (key: string, uri: string) => { try { const m = JSON.parse(sessionStorage.getItem(CK) ?? '{}'); m[key] = [uri, Date.now()]; sessionStorage.setItem(CK, JSON.stringify(m)) } catch { /* cheio */ } }

async function photoUrl(name: string, w: number): Promise<string | null> {
  const hit = cached(`${name}|${w}`)
  if (hit) return hit
  if (!KEY || used() >= DAILY) return null
  try {
    localStorage.setItem(k(), String(used() + 1))
    track('google_call', { sku: 'photo' })
    const r = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&skipHttpRedirect=true&key=${KEY}`, { signal: AbortSignal.timeout(8000) })
    const uri = r.ok ? ((await r.json()) as { photoUri?: string }).photoUri ?? null : null
    if (uri) remember(`${name}|${w}`, uri)
    return uri
  } catch { return null }
}

/** foto do card (enabled = só os primeiros cards de cada lista, pra caber na franquia) */
// uma largura só pra miniatura e carrossel: a mesma foto vira o mesmo endereço guardado (antes a miniatura e o
// carrossel pediam tamanhos diferentes, gastavam cota em dobro e um aparecia sem o outro)
export const PHOTO_W = 720
export function usePlacePhoto(p: Place, enabled: boolean, _w = PHOTO_W, name = p.photo?.name) {
  return usePlacePhotoQuery(enabled, name).data ?? null
}
export function usePlacePhotoQuery(enabled: boolean, name?: string) {
  return useQuery({
    queryKey: ['gphoto', name, PHOTO_W],
    queryFn: () => photoUrl(name!, PHOTO_W),
    enabled: enabled && !!name,
    staleTime: Infinity, gcTime: 60 * 60_000, retry: false,
  })
}
