import { animate, motion, useMotionValue, useTransform, type HTMLMotionProps } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router'
import { page, spring } from './motion'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** Tela: camada absoluta com rolagem própria — permite transições sobrepostas e elementos compartilhados. */
export function Page({ children, className, tabbed }: { children: ReactNode; className?: string; tabbed?: boolean }) {
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

export function TopBar({ title, right, back = true }: { title?: ReactNode; right?: ReactNode; back?: boolean }) {
  const nav = useNavigate()
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 bg-bg/70 px-4 pb-2 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur-xl sm:pt-12">
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
    <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium', tone === 'accent' ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-mute')}>
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
export function Cover({ hue, label, className, layoutId, rounded = 'rounded-[28px]' }: { hue: number; label?: string; className?: string; layoutId?: string; rounded?: string }) {
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
  const words = text.split(' ')
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
          {w}{' '}
        </motion.span>
      ))}
      {n < words.length && <motion.span className="inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent" animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.9 }} />}
    </p>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-2xl bg-white/[0.04]', className)}>
      <motion.div
        className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
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
