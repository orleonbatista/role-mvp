import { AnimatePresence, motion } from 'motion/react'
import { Compass, Plus, User, Users, UsersRound } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { cx } from '../ui/primitives'
import { spring } from '../ui/motion'

/* Barra inferior: 4 destinos com rótulo + o "+" no meio (novo pedido). Barra de largura total, presa ao rodapé
   (respeita a área segura do iPhone), em vez da cápsula flutuante que ficou apertada com a aba Amigos. */
const left = [
  { to: '/', label: 'Início', icon: Compass },
  { to: '/amigos', label: 'Amigos', icon: Users },
]
const right = [
  { to: '/turmas', label: 'Turmas', icon: UsersRound },
  { to: '/perfil', label: 'Você', icon: User },
]

export function TabBar({ visible }: { visible: boolean }) {
  const { pathname } = useLocation()
  const nav = useNavigate()
  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          aria-label="Navegação principal"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          className="absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg pb-safe-bar"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
            {left.map((t) => <Tab key={t.to} {...t} active={pathname === t.to} onClick={() => nav(t.to)} />)}
            <div className="flex justify-center">
              <motion.button
                whileTap={{ scale: 0.9, rotate: 90 }}
                transition={spring}
                onClick={() => nav('/novo')}
                className="-mt-4 grid size-13 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_8px_28px_-6px_rgba(198,255,61,0.7)] ring-4 ring-bg"
                aria-label="Novo pedido"
              >
                <Plus size={24} strokeWidth={2.5} />
              </motion.button>
            </div>
            {right.map((t) => <Tab key={t.to} {...t} active={pathname === t.to} onClick={() => nav(t.to)} />)}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  )
}

function Tab({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Compass; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className={cx('relative flex h-12 flex-col items-center justify-center gap-1 text-[11px] transition-colors', active ? 'text-accent' : 'text-mute')}>
      {active && <motion.span layoutId="tab-dot" transition={spring} className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
      <Icon size={20} />
      <span>{label}</span>
    </button>
  )
}
