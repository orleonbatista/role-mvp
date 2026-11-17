import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import { resetAll } from '../db/db'

/** No celular: tela cheia. No desktop: moldura de aparelho com brilho ambiente. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden sm:py-8">
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        <motion.div
          className="absolute left-1/2 top-1/2 size-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-[120px]"
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <aside className="absolute left-10 top-1/2 hidden max-w-[260px] -translate-y-1/2 xl:block">
        <p className="font-serif text-5xl italic leading-none">rolê.</p>
        <p className="mt-4 text-sm leading-relaxed text-mute">
          MVP local. Dados, IA e comunidade são simulados no navegador (MSW + IndexedDB). Nada sai da sua máquina.
        </p>
        <button onClick={resetAll} className="mt-6 inline-flex items-center gap-2 text-xs text-faint hover:text-ink">
          <RotateCcw size={12} /> zerar dados locais
        </button>
      </aside>

      <div className="relative isolate h-dvh w-full overflow-hidden bg-bg sm:h-[844px] sm:max-h-[calc(100dvh-4rem)] sm:w-[390px] sm:rounded-[54px] sm:border sm:border-white/10 sm:shadow-[0_50px_140px_-30px_rgba(0,0,0,0.9),0_0_0_10px_#111113,0_0_0_11px_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute left-1/2 top-2.5 z-[70] hidden h-7 w-28 -translate-x-1/2 rounded-full bg-black sm:block" />
        {children}
      </div>
    </div>
  )
}
