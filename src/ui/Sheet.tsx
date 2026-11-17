import { AnimatePresence, motion, useDragControls } from 'motion/react'
import type { ReactNode } from 'react'

/** Bottom sheet arrastável, com spring e backdrop em blur. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const controls = useDragControls()
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 z-50 rounded-t-[32px] border-t border-line bg-surface px-5 pb-8 pt-3"
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
            <div className="mx-auto mb-4 h-1.5 w-10 cursor-grab rounded-full bg-white/15 touch-none" onPointerDown={(e) => controls.start(e)} />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
