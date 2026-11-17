import type { Transition, Variants } from 'motion/react'

export const ease = [0.22, 1, 0.36, 1] as const

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 30 }
/** usado nos elementos compartilhados entre telas (capa do lugar, composer) */
export const sharedSpring: Transition = { type: 'spring', stiffness: 300, damping: 34, mass: 1 }

export const page: Variants = {
  initial: { opacity: 0, y: 18, filter: 'blur(10px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease } },
  exit: { opacity: 0, y: -10, filter: 'blur(8px)', transition: { duration: 0.28, ease } },
}

export const list: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
}

export const item: Variants = {
  initial: { opacity: 0, y: 16, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease } },
}

export const pop: Variants = {
  initial: { opacity: 0, scale: 0.85, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: spring },
  exit: { opacity: 0, scale: 0.85, filter: 'blur(4px)', transition: { duration: 0.18 } },
}

export const press = { whileTap: { scale: 0.97 }, transition: spring }
