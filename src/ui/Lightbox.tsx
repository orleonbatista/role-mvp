import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { usePlacePhotoQuery } from '../lib/gphoto'
import { Overlay, cx } from './primitives'
import { useToast } from './Toast'
import { track } from '../lib/track'

/* Visualizador de fotos dentro do app (antes a foto abria numa aba do navegador, fora do app).
   A foto aparece numa moldura por cima da tela, com fundo desfocado. Arrasta pros lados pra trocar,
   pra baixo pra fechar (como no app Fotos), toque duplo aproxima. "Salvar" usa o compartilhamento do celular
   (no iPhone: "Salvar imagem"). */
export interface LightItem { key: string; src?: string; gname?: string; caption?: string }

export function Lightbox({ items, start, onClose }: { items: LightItem[]; start: number | null; onClose: () => void }) {
  const [i, setI] = useState(start ?? 0)
  useEffect(() => { if (start !== null) setI(start) }, [start])
  const open = start !== null && items.length > 0
  const y = useMotionValue(0)
  const x = useMotionValue(0)
  const bg = useTransform(y, [0, 300], [1, 0])
  const scaleY = useTransform(y, [0, 400], [1, 0.82])
  const [zoom, setZoom] = useState(false)
  const toast = useToast()
  const it = items[Math.min(i, items.length - 1)]

  useEffect(() => { y.set(0); x.set(0); setZoom(false) }, [i, open, x, y])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((v) => Math.min(items.length - 1, v + 1)); if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1)) }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [open, items.length, onClose])

  const go = (d: number) => setI((v) => Math.max(0, Math.min(items.length - 1, v + d)))

  async function save() {
    const src = (document.querySelector('[data-lightbox-img]') as HTMLImageElement | null)?.src
    if (!src) return
    track('photo_save', {})
    try {
      const blob = await (await fetch(src)).blob()
      const file = new File([blob], `role-${it.key}.jpg`, { type: blob.type || 'image/jpeg' })
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return }
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } catch (e) { if ((e as Error)?.name !== 'AbortError') toast('Não deu pra salvar essa foto (toque e segure nela pra salvar)') }
  }

  return (
    <Overlay>
      <AnimatePresence>
        {open && it && (
          <motion.div key="lb" role="dialog" aria-modal="true" aria-label="Foto" className="pointer-events-auto absolute inset-0 z-[96] flex flex-col"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-xl" style={{ opacity: bg }} onClick={onClose} />
            <div className="relative z-10 flex items-center justify-between px-4 pt-safe">
              <span className="text-[13px] text-white/70">{items.length > 1 ? `${i + 1} de ${items.length}` : ''}</span>
              <div className="flex gap-2">
                {/* foto do Google não pode ser guardada (termos do Google): só as fotos do rolê e da comunidade */}
                {it.src && <button onClick={save} aria-label="Salvar foto" className="grid size-10 place-items-center rounded-full bg-white/10 text-white"><Download size={17} /></button>}
                <button onClick={onClose} aria-label="Fechar" className="grid size-10 place-items-center rounded-full bg-white/10 text-white"><X size={18} /></button>
              </div>
            </div>
            <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 py-4">
              <motion.div key={it.key} className="relative max-h-full w-full"
                initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                style={{ y, x, scaleY }}
                drag={!zoom} dragElastic={0.6} dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} dragDirectionLock
                onDragEnd={(_, info) => {
                  if (info.offset.y > 120 || info.velocity.y > 700) { onClose(); return }
                  if (info.offset.x < -70 || info.velocity.x < -500) go(1)
                  else if (info.offset.x > 70 || info.velocity.x > 500) go(-1)
                  animate(x, 0, { type: 'spring', stiffness: 400, damping: 36 }); animate(y, 0, { type: 'spring', stiffness: 400, damping: 36 })
                }}
                onDoubleClick={() => setZoom((z) => !z)}>
                {/* moldura: borda clara, sombra e cantos arredondados */}
                <motion.div className="mx-auto w-fit overflow-hidden rounded-[22px] border border-white/15 bg-white/5 p-1.5 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
                  animate={{ scale: zoom ? 1.8 : 1 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
                  <LightImg it={it} />
                </motion.div>
              </motion.div>
              {items.length > 1 && (
                <>
                  <button onClick={() => go(-1)} aria-label="Foto anterior" disabled={i === 0} className="absolute left-2 hidden size-10 place-items-center rounded-full bg-white/10 text-white disabled:opacity-0 sm:grid"><ChevronLeft size={20} /></button>
                  <button onClick={() => go(1)} aria-label="Próxima foto" disabled={i === items.length - 1} className="absolute right-2 hidden size-10 place-items-center rounded-full bg-white/10 text-white disabled:opacity-0 sm:grid"><ChevronRight size={20} /></button>
                </>
              )}
            </div>
            <div className="relative z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
              {it.caption && <p className="text-[13px] text-white/80">{it.caption}</p>}
              {items.length > 1 && (
                <div className="mt-2 flex justify-center gap-1">{items.map((_, j) => <span key={j} className={cx('size-1.5 rounded-full', j === i ? 'bg-white' : 'bg-white/30')} />)}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Overlay>
  )
}

function LightImg({ it }: { it: LightItem }) {
  const g = usePlacePhotoQuery(!!it.gname, it.gname ?? '')
  const src = it.src ?? g.data ?? undefined
  if (!src) return <div className="grid h-[50vh] w-[80vw] place-items-center text-[13px] text-white/60">carregando…</div>
  return <img data-lightbox-img src={src} alt={it.caption ?? ''} draggable={false} className="block max-h-[70vh] max-w-full rounded-[16px] object-contain" />
}
