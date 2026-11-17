import { AnimatePresence, motion } from 'motion/react'
import { Compass, Plus, User } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { cx } from '../ui/primitives'
import { spring } from '../ui/motion'

const tabs = [
  { to: '/', label: 'Início', icon: Compass },
  { to: '/perfil', label: 'Você', icon: User },
]

export function TabBar({ visible }: { visible: boolean }) {
  const { pathname } = useLocation()
  const nav = useNavigate()
  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(16px,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-surface-2/70 p-1.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            {tabs.slice(0, 1).map((t) => <Tab key={t.to} {...t} active={pathname === t.to} onClick={() => nav(t.to)} />)}
            <motion.button
              whileTap={{ scale: 0.9, rotate: 90 }}
              transition={spring}
              onClick={() => nav('/novo')}
              className="mx-1 grid size-12 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_6px_24px_-6px_rgba(198,255,61,0.7)]"
              aria-label="Novo pedido"
            >
              <Plus size={22} strokeWidth={2.5} />
            </motion.button>
            {tabs.slice(1).map((t) => <Tab key={t.to} {...t} active={pathname === t.to} onClick={() => nav(t.to)} />)}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  )
}

function Tab({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Compass; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('relative flex h-12 items-center gap-2 rounded-full px-5 text-sm transition-colors', active ? 'text-ink' : 'text-mute')}>
      {active && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-0 rounded-full bg-white/[0.09]" />}
      <Icon size={18} className="relative" />
      <span className="relative">{label}</span>
    </button>
  )
}
