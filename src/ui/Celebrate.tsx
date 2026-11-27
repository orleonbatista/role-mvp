import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Overlay } from './primitives'

/* Animações de comemoração do rolê., desenhadas em SVG e animadas com Motion (sem imagem nem biblioteca nova).
   - CheersMugs: duas canecas de chope que se encontram e brindam, com espuma voando
   - Confetti: estouro de confete
   - BeerLoader: caneca enchendo, com bolhas (carregamento)
   - celebrate(): comemoração rápida em tela cheia (some sozinha em ~2 s ou com um toque)
   Quem pediu menos movimento no celular (reduced motion) vê só o desenho parado: o MotionConfig do App cuida disso. */

const ACCENT = '#c6ff3d'

/** uma caneca de chope: vidro com cerveja, espuma e alça */
function Mug({ flip = false, gid }: { flip?: boolean; gid: string }) {
  return (
    <g transform={flip ? 'translate(64 0) scale(-1 1)' : undefined}>
      {/* alça */}
      <path d="M44 34 h7 a9 9 0 0 1 9 9 v18 a9 9 0 0 1 -9 9 h-7" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="5" strokeLinecap="round" />
      {/* vidro */}
      <path d="M6 22 h40 l-3 56 a6 6 0 0 1 -6 5.5 h-22 a6 6 0 0 1 -6 -5.5 z" fill={`url(#${gid}-beer)`} stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
      {/* reflexo */}
      <path d="M13 30 l2 44" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round" />
      {/* bolhas paradas */}
      <circle cx="26" cy="60" r="1.8" fill="rgba(255,255,255,0.55)" />
      <circle cx="33" cy="48" r="1.3" fill="rgba(255,255,255,0.5)" />
      <circle cx="21" cy="44" r="1.1" fill="rgba(255,255,255,0.45)" />
      {/* espuma */}
      <g fill="#fffaf0">
        <circle cx="10" cy="22" r="7" /><circle cx="20" cy="17" r="8.5" /><circle cx="32" cy="18" r="8" /><circle cx="42" cy="22" r="6.5" />
        <rect x="6" y="20" width="40" height="7" rx="3" />
      </g>
    </g>
  )
}

/** duas canecas brindando. loop: repete (pra telas de espera); senão brinda uma vez */
export function CheersMugs({ size = 200, loop = false, delay = 0 }: { size?: number; loop?: boolean; delay?: number }) {
  const gid = useId().replace(/:/g, '')
  const dur = 1.5
  const rep = loop ? { repeat: Infinity, repeatDelay: 0.6 } : {}
  const hit = 0.5 // momento do encontro (fração da animação)
  const drops = [
    { x: -14, y: -40, r: 4 }, { x: 0, y: -52, r: 5 }, { x: 14, y: -42, r: 3.5 }, { x: -24, y: -26, r: 3 }, { x: 24, y: -28, r: 3 }, { x: 6, y: -64, r: 2.5 },
  ]
  return (
    <svg viewBox="0 0 240 150" width={size} height={size * 0.625} aria-hidden overflow="visible">
      <defs>
        <linearGradient id={`${gid}-beer`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd24a" /><stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* caneca da esquerda: inclina e vem pro centro */}
      <motion.g style={{ originX: '50%', originY: '100%' }}
        initial={{ x: 18, y: 50, rotate: -14 }}
        animate={{ x: [18, 42, 38, 38], y: [50, 46, 48, 50], rotate: [-14, 20, 12, 12] }}
        transition={{ duration: dur, times: [0, hit, 0.7, 1], ease: 'easeInOut', delay, ...rep }}>
        <Mug gid={gid} flip />
      </motion.g>
      {/* caneca da direita (alças pra fora, como quem segura) */}
      <motion.g style={{ originX: '50%', originY: '100%' }}
        initial={{ x: 158, y: 50, rotate: 14 }}
        animate={{ x: [158, 134, 138, 138], y: [50, 46, 48, 50], rotate: [14, -20, -12, -12] }}
        transition={{ duration: dur, times: [0, hit, 0.7, 1], ease: 'easeInOut', delay, ...rep }}>
        <Mug gid={gid} />
      </motion.g>
      {/* espuma voando no brinde */}
      {drops.map((d, i) => (
        <motion.circle key={i} cx={120} cy={68} r={d.r} fill="#fffaf0"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 0], x: [0, d.x], y: [0, d.y], scale: [0.4, 1, 0.8] }}
          transition={{ duration: 0.8, times: [0, 0.2, 1], ease: 'easeOut', delay: delay + dur * hit, ...(loop ? { repeat: Infinity, repeatDelay: dur + 0.6 - 0.8 } : {}) }} />
      ))}
      {/* brilho do "tim-tim" */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (-90 + (i - 2) * 32) * (Math.PI / 180)
        return (
          <motion.line key={`s${i}`} x1={120 + Math.cos(a) * 16} y1={60 + Math.sin(a) * 16} x2={120 + Math.cos(a) * 28} y2={60 + Math.sin(a) * 28}
            stroke={ACCENT} strokeWidth="3" strokeLinecap="round"
            initial={{ opacity: 0, pathLength: 0 }} animate={{ opacity: [0, 1, 0], pathLength: [0, 1, 1] }}
            transition={{ duration: 0.5, delay: delay + dur * hit, ...(loop ? { repeat: Infinity, repeatDelay: dur + 0.6 - 0.5 } : {}) }} />
        )
      })}
    </svg>
  )
}

/** estouro de confete a partir do centro do elemento pai (posicione o pai como relative) */
export function Confetti({ count = 26, radius = 140, hues = [82, 330, 200, 45], delay = 0.1 }: { count?: number; radius?: number; hues?: number[]; delay?: number }) {
  const bits = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + (i % 2) * 0.2
    const r = radius * (0.65 + ((i * 37) % 10) / 22)
    return { a, r, hue: hues[i % hues.length], rect: i % 3 === 0, rot: (i * 47) % 360 }
  })
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {bits.map((b, i) => (
        <motion.span key={i} className={b.rect ? 'absolute h-2.5 w-1.5 rounded-[1px]' : 'absolute size-2 rounded-full'}
          style={{ background: b.hue === 82 ? ACCENT : `hsl(${b.hue} 90% 64%)` }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{ x: Math.cos(b.a) * b.r, y: [0, Math.sin(b.a) * b.r, Math.sin(b.a) * b.r + 40], scale: [0, 1.2, 0.8], opacity: [1, 1, 0], rotate: b.rot + 180 }}
          transition={{ duration: 1.5, times: [0, 0.55, 1], ease: [0.16, 1, 0.3, 1], delay }} />
      ))}
    </div>
  )
}

/** caneca enchendo, com bolhas subindo (carregamento) */
export function BeerLoader({ size = 56 }: { size?: number }) {
  const gid = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 80" width={size} height={size * 1.25} aria-hidden>
      <defs>
        <clipPath id={`${gid}-glass`}><path d="M8 14 h40 l-3 56 a6 6 0 0 1 -6 5.5 h-22 a6 6 0 0 1 -6 -5.5 z" /></clipPath>
        <linearGradient id={`${gid}-b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd24a" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
      </defs>
      <path d="M46 26 h6 a8 8 0 0 1 8 8 v16 a8 8 0 0 1 -8 8 h-6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="4.5" strokeLinecap="round" />
      <g clipPath={`url(#${gid}-glass)`}>
        <motion.rect x="0" width="64" height="80" fill={`url(#${gid}-b)`} initial={{ y: 80 }} animate={{ y: [80, 18, 18, 80] }} transition={{ duration: 2.4, times: [0, 0.55, 0.85, 1], repeat: Infinity, ease: 'easeInOut' }} />
        <motion.rect x="0" width="64" height="7" rx="3" fill="#fffaf0" initial={{ y: 80 }} animate={{ y: [80, 12, 12, 80] }} transition={{ duration: 2.4, times: [0, 0.55, 0.85, 1], repeat: Infinity, ease: 'easeInOut' }} />
        {[18, 28, 38].map((x, i) => (
          <motion.circle key={x} cx={x} r={1.6} fill="rgba(255,255,255,0.7)" initial={{ cy: 76, opacity: 0 }} animate={{ cy: [76, 24], opacity: [0, 1, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.3 + i * 0.35, ease: 'easeOut' }} />
        ))}
      </g>
      <path d="M8 14 h40 l-3 56 a6 6 0 0 1 -6 5.5 h-22 a6 6 0 0 1 -6 -5.5 z" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
    </svg>
  )
}

/** estrelinhas que sobem (avaliação enviada) */
export function StarBurst({ count = 7 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const x = (i - (count - 1) / 2) * 26
        return (
          <motion.svg key={i} viewBox="0 0 24 24" width={18} height={18} className="absolute -ml-[9px] -mt-[9px]"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }} animate={{ x, y: [-10, -90 - (i % 3) * 20], opacity: [0, 1, 0], scale: [0, 1.2, 0.9], rotate: (i - 3) * 20 }}
            transition={{ duration: 1.4, delay: 0.15 + i * 0.05, ease: 'easeOut' }}>
            <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.2l7.1-.6z" fill={i % 2 ? ACCENT : '#ffd24a'} />
          </motion.svg>
        )
      })}
    </div>
  )
}

/* ---------- comemoração rápida global ---------- */
type CelebrateKind = 'cheers' | 'friends' | 'turma' | 'check'
interface CelebrateMsg { kind: CelebrateKind; title: string; text?: string }
let push: ((m: CelebrateMsg) => void) | null = null
/** comemoração em tela cheia por ~2 s (amizade, entrar na turma, item da lista, rolê criado…) */
export function celebrate(m: CelebrateMsg) { push?.(m) }

function KindArt({ kind }: { kind: CelebrateKind }) {
  if (kind === 'cheers') return <CheersMugs size={190} />
  if (kind === 'friends' || kind === 'turma') {
    // dois (ou três) rostinhos que se aproximam e se juntam
    const n = kind === 'turma' ? 3 : 2
    return (
      <div className="relative flex h-24 items-center justify-center">
        {Array.from({ length: n }, (_, i) => {
          const off = (i - (n - 1) / 2) * 46
          return (
            <motion.span key={i} className="mx-[-6px] grid size-16 place-items-center rounded-full border-4 border-bg text-[28px]"
              style={{ background: ['#c6ff3d', '#7aa7ff', '#ff8ac6'][i] }}
              initial={{ x: off * 2.2, scale: 0.6, opacity: 0 }} animate={{ x: 0, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14, delay: i * 0.08 }}>
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden><circle cx="8.5" cy="10" r="1.6" fill="#0b0d05" /><circle cx="15.5" cy="10" r="1.6" fill="#0b0d05" /><path d="M7.5 14.5c1.2 1.8 2.7 2.7 4.5 2.7s3.3-.9 4.5-2.7" fill="none" stroke="#0b0d05" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </motion.span>
          )
        })}
      </div>
    )
  }
  return (
    <motion.svg viewBox="0 0 64 64" width="88" height="88" aria-hidden initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
      <circle cx="32" cy="32" r="28" fill={ACCENT} />
      <motion.path d="M19 33l9 9 17-19" fill="none" stroke="#0b0d05" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.45 }} />
    </motion.svg>
  )
}

export function CelebrateHost(): ReactNode {
  const [m, setM] = useState<CelebrateMsg | null>(null)
  useEffect(() => { push = (x) => setM(x); return () => { push = null } }, [])
  useEffect(() => { if (!m) return; const t = setTimeout(() => setM(null), 2200); return () => clearTimeout(t) }, [m])
  return (
    <Overlay>
      <AnimatePresence>
        {m && (
          <motion.div key={m.title} role="status" aria-live="polite" onClick={() => setM(null)}
            className="pointer-events-auto absolute inset-0 z-[95] flex flex-col items-center justify-center bg-bg/85 px-8 text-center backdrop-blur-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="relative grid place-items-center">
              <Confetti count={22} radius={130} />
              <KindArt kind={m.kind} />
            </div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.4 }} className="mt-6 font-serif text-[34px] leading-none text-balance">{m.title}</motion.p>
            {m.text && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-2 text-[14px] text-mute">{m.text}</motion.p>}
          </motion.div>
        )}
      </AnimatePresence>
    </Overlay>
  )
}
