import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Overlay } from './primitives'

/** Bottom sheet arrastável, com spring e backdrop em blur.
 *  Fecha arrastando pra baixo: pela faixa de cima inteira (antes só pela alcinha de 6 px, quase impossível de pegar)
 *  e também pelo conteúdo quando ele já está rolado até o topo, como as folhas do iOS. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const controls = useDragControls()
  const y = useMotionValue(0)
  const scroller = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x0: number; y0: number; pulling: boolean; t0: number } | null>(null)

  const release = (dy: number, ms: number) => {
    const fast = dy > 40 && dy / Math.max(ms, 1) > 0.6
    if (dy > 110 || fast) onClose()
    else animate(y, 0, { type: 'spring', stiffness: 420, damping: 38 })
  }

  // touchmove nativo com passive:false: o do React é passivo e não consegue segurar a rolagem enquanto puxa a folha
  useEffect(() => {
    if (!open) return
    let el: HTMLDivElement | null = null
    const move = (e: TouchEvent) => {
      const t = touch.current
      if (!t || !el) return
      const cy = e.touches[0].clientY
      // só puxa a folha se o conteúdo já está no topo e o dedo vai pra baixo
      if (!t.pulling && cy - t.y0 > 6 && Math.abs(e.touches[0].clientX - t.x0) < cy - t.y0 && el.scrollTop <= 0) { t.pulling = true; t.y0 = cy; t.t0 = Date.now() }
      if (t.pulling) {
        y.set(Math.max(0, cy - t.y0))
        if (e.cancelable) e.preventDefault()
      }
    }
    const id = requestAnimationFrame(() => { el = scroller.current; el?.addEventListener('touchmove', move, { passive: false }) })
    return () => { cancelAnimationFrame(id); el?.removeEventListener('touchmove', move) }
  }, [open, y])

  return (
    <Overlay>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="pointer-events-auto absolute inset-0 z-[85] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog" aria-modal="true"
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-[90] flex max-h-[92%] flex-col rounded-t-[32px] border-t border-line bg-surface px-5 pb-8"
            style={{ y }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose()
            }}
          >
            {/* faixa de arrastar: toda a largura, 28 px de altura */}
            <div className="-mx-5 flex h-7 shrink-0 cursor-grab touch-none items-center justify-center" onPointerDown={(e) => controls.start(e)} aria-hidden>
              <div className="h-1.5 w-10 rounded-full bg-white/20" />
            </div>
            <div
              ref={scroller}
              className="no-scrollbar -mx-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
              onTouchStart={(e) => {
                // áreas que usam o próprio arrasto (recorte da foto, controles deslizantes) não puxam a folha
                const tg = e.target as Element
                if (tg.closest('[data-sheet-nodrag], input[type=range]')) { touch.current = null; return }
                touch.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, pulling: false, t0: Date.now() }
              }}
              onTouchEnd={(e) => {
                const t = touch.current
                touch.current = null
                if (!t?.pulling) return
                const d = Math.max(0, (e.changedTouches[0]?.clientY ?? t.y0) - t.y0)
                release(d, Date.now() - t.t0)
              }}
              onTouchCancel={() => { if (touch.current?.pulling) animate(y, 0); touch.current = null }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </Overlay>
  )
}
