import { AnimatePresence, animate, motion, useMotionValue, useTransform, type HTMLMotionProps } from 'motion/react'
import { useEffect, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, SearchX } from 'lucide-react'
import { useNavigate } from 'react-router'
import { page, spring } from './motion'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** Tela: camada absoluta com rolagem própria — permite transições sobrepostas e elementos compartilhados.
 *  `footer`: barra de ações que OCUPA espaço no layout (o conteúdo rola acima dela, nunca por baixo).
 *  `chrome`: elementos fixos sobre a tela (ex.: barra de topo transparente), fora da área de rolagem. */
export function Page({ children, className, tabbed, footer, chrome, scrollRef }: {
  children: ReactNode; className?: string; tabbed?: boolean
  footer?: ReactNode; chrome?: ReactNode; scrollRef?: Ref<HTMLDivElement>
}) {
  const layout = footer !== undefined || chrome !== undefined || scrollRef !== undefined
  if (!layout) {
    return (
      <motion.main
        variants={page}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cx('absolute inset-0 overflow-y-auto overflow-x-hidden no-scrollbar bg-bg', tabbed ? 'pb-28' : 'pb-10', className)}
      >
        {children}
      </motion.main>
    )
  }
  return (
    <motion.main variants={page} initial="initial" animate="animate" exit="exit" className="absolute inset-0 flex flex-col overflow-hidden bg-bg">
      <div ref={scrollRef} className={cx('no-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden', tabbed ? 'pb-28' : 'pb-8', className)}>
        {children}
      </div>
      {chrome}
      <AnimatePresence initial={false}>
        {footer ? (
          <motion.footer
            key="footer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-20 shrink-0 overflow-hidden border-t border-white/[0.06] bg-bg/90 backdrop-blur-xl"
          >
            <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>
          </motion.footer>
        ) : null}
      </AnimatePresence>
    </motion.main>
  )
}

export function TopBar({ title, right, back = true }: { title?: ReactNode; right?: ReactNode; back?: boolean }) {
  const nav = useNavigate()
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 bg-bg/70 px-4 pb-2 pt-safe backdrop-blur-xl">
      {back && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => (history.length > 1 ? nav(-1) : nav('/'))}
          className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-ink"
          aria-label="Voltar"
        >
          <ChevronLeft size={18} />
        </motion.button>
      )}
      <div className="flex-1 truncate text-sm font-medium text-mute">{title}</div>
      {right}
    </div>
  )
}

type BtnProps = HTMLMotionProps<'button'> & { variant?: 'accent' | 'ghost' | 'soft'; size?: 'md' | 'lg'; icon?: ReactNode }
export function Button({ variant = 'accent', size = 'md', icon, className, children, ...rest }: BtnProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={spring}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-colors disabled:opacity-40 disabled:pointer-events-none',
        size === 'lg' ? 'h-14 px-6 text-[15px]' : 'h-11 px-5 text-sm',
        variant === 'accent' && 'bg-accent text-accent-ink shadow-[0_8px_30px_-8px_rgba(198,255,61,0.55)]',
        variant === 'soft' && 'bg-white/[0.07] text-ink hover:bg-white/[0.1]',
        variant === 'ghost' && 'text-mute hover:text-ink',
        className,
      )}
      {...rest}
    >
      {icon}
      {children as ReactNode}
    </motion.button>
  )
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      layout
      whileTap={{ scale: 0.94 }}
      transition={spring}
      onClick={onClick}
      className={cx(
        'relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap',
        active ? 'text-accent-ink' : 'text-ink/85 bg-white/[0.06] hover:bg-white/[0.09]',
        className,
      )}
    >
      {active && <motion.span layoutId={undefined} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} className="absolute inset-0 rounded-full bg-accent" />}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </motion.button>
  )
}

export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' }) {
  return (
    <span className={cx('inline-flex h-6 max-w-full items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium', tone === 'accent' ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-mute')}>
      {children}
    </span>
  )
}

export function Avatar({ name, hue, size = 32 }: { name: string; hue: number; size?: number }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-medium text-black/80 ring-2 ring-bg"
      style={{
        width: size, height: size, fontSize: size * 0.4,
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 95% 78%), hsl(${(hue + 40) % 360} 80% 55%))`,
      }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  )
}

/** Capa generativa: gradiente em malha por matiz + granulado. Substitui fotos no mock. */
export function Cover({ hue, label, icon: Icon, iconSize = 56, className, layoutId, rounded = 'rounded-[28px]' }: { hue: number; label?: string; icon?: LucideIcon; iconSize?: number; className?: string; layoutId?: string; rounded?: string }) {
  const h2 = (hue + 45) % 360
  const h3 = (hue + 300) % 360
  return (
    <motion.div
      layoutId={layoutId}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      className={cx('grain relative overflow-hidden', rounded, className)}
      style={{
        background: `radial-gradient(120% 90% at 15% 20%, hsl(${hue} 90% 62% / .95), transparent 55%),
          radial-gradient(90% 80% at 85% 75%, hsl(${h2} 85% 50% / .9), transparent 60%),
          radial-gradient(70% 60% at 70% 10%, hsl(${h3} 80% 60% / .6), transparent 60%),
          #101012`,
      }}
    >
      {Icon && (
        <Icon aria-hidden size={iconSize} strokeWidth={1.25} className="absolute bottom-[12%] right-[10%] text-white/35 mix-blend-overlay" />
      )}
      {label && (
        <span className="absolute bottom-2 right-3 font-serif text-[64px] leading-none italic text-white/25 select-none">{label}</span>
      )}
    </motion.div>
  )
}

export function AnimatedNumber({ value, className, decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => v.toFixed(decimals))
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [value, mv])
  return <motion.span className={className}>{text}</motion.span>
}

/** Texto que "chega" palavra a palavra, como streaming de IA. */
export function StreamText({ text, className, speed = 28, onDone }: { text: string; className?: string; speed?: number; onDone?: () => void }) {
  // **negrito** vindo da IA vira negrito de verdade (antes aparecia com os asteriscos)
  const words = text.split('**').flatMap((seg, k) => seg.split(' ').filter(Boolean).map((w) => ({ w, b: k % 2 === 1 })))
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    const id = setInterval(() => setN((x) => {
      if (x >= words.length) { clearInterval(id); onDone?.(); return x }
      return x + 1
    }), speed)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return (
    <p className={className}>
      {words.slice(0, n).map((w, i) => (
        <motion.span key={i} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.4 }}>
          {w.b ? <b className="font-semibold text-ink">{w.w}</b> : w.w}{' '}
        </motion.span>
      ))}
      {n < words.length && <motion.span className="inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent" animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.9 }} />}
    </p>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-2xl bg-white/[0.08]', className)}>
      <motion.div
        className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.12] to-transparent"
        animate={{ x: ['-100%', '250%'] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
      />
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between px-5">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-mute">{children}</h2>
      {aside}
    </div>
  )
}

export function Typing() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-1.5 rounded-full bg-mute" animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }} />
      ))}
    </span>
  )
}

/** Renderiza fora da área que rola, preso à "tela" do aparelho (sheets, celebrações). */
export function Overlay({ children }: { children: ReactNode }) {
  const el = typeof document !== 'undefined' ? document.getElementById('overlay-root') : null
  return el ? createPortal(children, el) : <>{children}</>
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-8 pt-24 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-white/[0.05] text-mute"><SearchX size={26} strokeWidth={1.5} /></span>
      <h2 className="mt-6 font-serif text-[32px] leading-none">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-mute">{text}</p>
      {action && <div className="mt-8">{action}</div>}
    </motion.div>
  )
}
