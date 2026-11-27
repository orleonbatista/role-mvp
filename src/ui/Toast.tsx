import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'

type Toast = { id: number; text: string }
const Ctx = createContext<(text: string) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-[60] sm:top-14 flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.9, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
              exit={{ opacity: 0, y: -12, scale: 0.95, filter: 'blur(6px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="flex items-center gap-2 rounded-full border border-line bg-surface-2/90 px-4 py-2.5 text-sm shadow-2xl backdrop-blur-xl"
            >
              <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-ink"><Check size={12} strokeWidth={3} /></span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
