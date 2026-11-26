import { motion } from 'motion/react'
import type { Place } from '../lib/types'
import { usePlacePhoto } from '../lib/gphoto'
import { cx } from './primitives'

/** foto real do Google por cima da capa colorida (a capa fica de fundo enquanto carrega ou sem foto) */
export function PlacePhoto({ place, enabled, className, rounded = 'rounded-[28px]', w, credit = 'top' }: { place: Place; enabled: boolean; className?: string; rounded?: string; w?: number; credit?: 'top' | 'bottom' }) {
  const url = usePlacePhoto(place, enabled, w)
  if (!url) return null
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className={cx('absolute inset-0 overflow-hidden', rounded, className)}>
      <img src={url} alt="" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full object-cover" />
      {place.photo?.by && <span className={cx('absolute right-2 rounded-full', credit === 'top' ? 'top-2' : 'bottom-2', ' bg-black/50 px-2 py-0.5 text-[9px] text-white/80 backdrop-blur')}>Foto: {place.photo.by}</span>}
    </motion.div>
  )
}
