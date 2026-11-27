import { useState } from 'react'
import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import type { Place } from '../lib/types'
import { usePlacePhoto } from '../lib/gphoto'
import { placePhotos, type OwnPhoto } from '../mocks/remote'
import { cx } from './primitives'

/* Carrossel de fotos por cima da capa colorida (a capa fica de fundo enquanto carrega ou sem foto).
   Ordem: fotos nossas (da casa e da comunidade, já ordenadas pela nota da IA) e depois as do Google.
   Foto nossa não gasta franquia; foto do Google só é buscada (ao vivo) quando o slide aparece. */
type Slide = { kind: 'own'; p: OwnPhoto } | { kind: 'google'; name: string; by?: string }

export function PlacePhoto({ place, enabled, className, rounded = 'rounded-[28px]', w, credit = 'top', carousel = true }: { place: Place; enabled: boolean; className?: string; rounded?: string; w?: number; credit?: 'top' | 'bottom'; carousel?: boolean }) {
  const own = useQuery({ queryKey: ['place-photos', place.id], queryFn: () => placePhotos(place.id), enabled, staleTime: 10 * 60_000, retry: false })
  const google = place.photos?.length ? place.photos : place.photo ? [place.photo] : []
  const slides: Slide[] = [...(own.data ?? []).map((p) => ({ kind: 'own' as const, p })), ...google.map((g) => ({ kind: 'google' as const, name: g.name, by: g.by }))].slice(0, carousel ? 8 : 1)
  const [at, setAt] = useState(0)
  if (!enabled || !slides.length) return null
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className={cx('absolute inset-0 overflow-hidden', rounded, className)}>
      <div className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto" aria-roledescription="carrossel" aria-label={`Fotos de ${place.name}`}
        onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))) }}>
        {slides.map((s, i) => (
          <div key={s.kind === 'own' ? s.p.id : s.name} className="relative h-full w-full shrink-0 snap-center">
            {s.kind === 'own'
              ? <img src={s.p.url} alt={`${place.name}: foto ${s.p.source === 'casa' ? 'da casa' : 'da comunidade'}`} loading="lazy" className="h-full w-full object-cover" />
              : <GoogleSlide place={place} name={s.name} w={w} load={i <= at + 1} />}
            {(s.kind === 'own' || s.by) && (
              <span className={cx('absolute right-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] text-white/80 backdrop-blur', credit === 'top' ? 'top-2' : 'bottom-2')}>
                {s.kind === 'own' ? (s.p.source === 'casa' ? 'Foto da casa' : 'Foto da comunidade') : `Foto: ${s.by}`}
              </span>
            )}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className={cx('pointer-events-none absolute inset-x-0 flex justify-center gap-1', credit === 'top' ? 'bottom-[96px]' : 'top-3')}>
          {slides.map((_, i) => <span key={i} className={cx('size-1.5 rounded-full', i === at ? 'bg-white' : 'bg-white/40')} />)}
        </div>
      )}
    </motion.div>
  )
}

/** foto do Google buscada ao vivo só quando o slide fica visível (ou é o próximo) */
function GoogleSlide({ place, name, w, load }: { place: Place; name: string; w?: number; load: boolean }) {
  const url = usePlacePhoto(place, load, w, name)
  return url ? <img src={url} alt="" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full object-cover" /> : null
}
