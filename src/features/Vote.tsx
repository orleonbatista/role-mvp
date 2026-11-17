import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarCheck, Crown, X } from 'lucide-react'
import { Avatar, AnimatedNumber, Button, Cover, Page, Skeleton, cx } from '../ui/primitives'
import { ease, spring } from '../ui/motion'
import { useDecide, useProfile, useRequest, useVote } from '../lib/api'
import { priceLabel } from '../lib/labels'

const FRIENDS = ['Bia', 'Caio', 'Duda', 'Léo', 'Mari']
const hueOf = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360

/** Página pública que o link do WhatsApp abre: vota sem login. */
export function VotePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data } = useRequest(id)
  const { data: me } = useProfile()
  const vote = useVote(id)
  const decide = useDecide(id)
  const [voter, setVoter] = useState(() => localStorage.getItem('role.voter') ?? '')
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => { if (!voter && me?.name) setVoter(me.name.split(' ')[0]) }, [me, voter])
  useEffect(() => { if (voter) localStorage.setItem('role.voter', voter) }, [voter])

  // amigos "votando" pelo link — simula o grupo do WhatsApp (uma vez por pedido)
  const reqId = data?.request.id
  useEffect(() => {
    if (!data) return
    const key = `role.sim.${id}`
    if (localStorage.getItem(key)) return
    const opts = data.options
    const picks = [0, 1, 0, 2].map((i) => opts[Math.min(i, opts.length - 1)].id)
    const timers = FRIENDS.slice(0, 4).map((f, i) =>
      setTimeout(() => {
        vote.mutate({ placeId: picks[i], voter: f })
        if (i === 3) localStorage.setItem(key, '1')
      }, 1400 + i * 1700),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqId])

  const total = data?.tally.reduce((a, t) => a + t.count, 0) ?? 0
  const leader = useMemo(() => {
    if (!data || !total) return null
    const top = [...data.tally].sort((a, b) => b.count - a.count)[0]
    return data.options.find((o) => o.id === top.placeId) ?? null
  }, [data, total])
  const myVote = data?.tally.find((t) => t.voters.includes(voter))?.placeId
  const decided = data?.request.status === 'decidido'

  return (
    <Page className="pb-36">
      <div className="flex items-center justify-between px-5 pt-14">
        <span className="font-serif text-xl italic">rolê<span className="text-accent">.</span></span>
        <button onClick={() => nav(-1)} className="grid size-9 place-items-center rounded-full bg-white/[0.06]" aria-label="Fechar"><X size={16} /></button>
      </div>

      {!data ? (
        <div className="grid gap-3 px-5 pt-8"><Skeleton className="h-24" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : (
        <>
          <header className="px-5 pt-6">
            <div className="flex items-center gap-2 text-sm text-mute">
              <Avatar name={data.author.name} hue={data.author.hue} size={24} />
              {data.author.id === 'me' ? 'Seu rolê' : `Rolê de ${data.author.name.split(' ')[0]}`}
            </div>
            <h1 className="mt-3 font-serif text-[34px] leading-[1] tracking-tight text-balance">Onde vai ser?</h1>
            <p className="mt-2 text-[14px] text-mute">“{data.request.text}”</p>
          </header>

          <div className="mx-5 mt-6 flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3">
            <span className="text-xs text-mute">Votando como</span>
            <input value={voter} onChange={(e) => setVoter(e.target.value)} placeholder="seu nome" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
          </div>

          <section className="mt-5 grid gap-3 px-5">
            {data.options.map((p, i) => {
              const t = data.tally.find((x) => x.placeId === p.id)
              const count = t?.count ?? 0
              const pct = total ? count / total : 0
              const mine = myVote === p.id
              const isLeader = leader?.id === p.id && count > 0
              return (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.6, ease } }}
                  whileTap={{ scale: 0.98 }}
                  disabled={!voter.trim() || decided}
                  onClick={() => vote.mutate({ placeId: p.id, voter: voter.trim() })}
                  className={cx('relative overflow-hidden rounded-[22px] border p-3 text-left transition-colors', mine ? 'border-accent/70' : 'border-line bg-surface/60')}
                >
                  <motion.div className="absolute inset-y-0 left-0 bg-accent/[0.12]" initial={false} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />
                  <div className="relative flex items-center gap-3">
                    <Cover hue={p.hue} className="size-14 shrink-0" rounded="rounded-[14px]" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[16px]">
                        {p.name}
                        <AnimatePresence>{isLeader && <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring}><Crown size={14} className="text-accent" /></motion.span>}</AnimatePresence>
                      </p>
                      <p className="text-xs text-mute">{p.hood} · {priceLabel(p.price)}</p>
                      <div className="mt-1.5 flex -space-x-1.5">
                        <AnimatePresence>
                          {t?.voters.map((v) => (
                            <motion.span key={v} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring}>
                              <Avatar name={v} hue={hueOf(v)} size={20} />
                            </motion.span>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="text-right">
                      <AnimatedNumber value={count} className="font-serif text-3xl leading-none" />
                      <p className="text-[11px] text-mute"><AnimatedNumber value={Math.round(pct * 100)} />%</p>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </section>
          <p className="mt-4 text-center text-xs text-faint">{total} {total === 1 ? 'voto' : 'votos'} · atualiza ao vivo</p>
        </>
      )}

      <AnimatePresence>
        {data && leader && total >= 2 && !decided && (
          <motion.div initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={spring} className="bottom-bar absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pb-7 pt-10">
            <Button size="lg" className="w-full" icon={<CalendarCheck size={16} />} disabled={decide.isPending}
              onClick={async () => { await decide.mutateAsync(leader.id); setCelebrate(true) }}>
              Fechar no {leader.name}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {celebrate && data && (
          <Celebration
            place={data.options.find((o) => o.id === data.request.decidedPlaceId) ?? leader!}
            size={data.request.criteria.groupSize}
            onReview={() => nav(`/avaliar/${id}`)}
            onHome={() => nav('/')}
          />
        )}
      </AnimatePresence>
    </Page>
  )
}

function Celebration({ place, size, onReview, onHome }: { place: { name: string; hue: number }; size: number; onReview: () => void; onHome: () => void }) {
  const dots = Array.from({ length: 28 })
  return (
    <motion.div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg/90 px-8 text-center backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="relative">
        {dots.map((_, i) => {
          const a = (i / dots.length) * Math.PI * 2
          const r = 110 + (i % 3) * 30
          return (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2 size-2 rounded-full"
              style={{ background: i % 3 === 0 ? '#c6ff3d' : `hsl(${place.hue + i * 12} 90% 65%)` }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r, scale: [0, 1.4, 0.6], opacity: [1, 1, 0] }}
              transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            />
          )
        })}
        <motion.div initial={{ scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
          <Cover hue={place.hue} className="size-36 shadow-[0_30px_80px_-20px_rgba(198,255,61,0.5)]" rounded="rounded-[36px]" />
        </motion.div>
      </div>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6, ease }} className="mt-10 text-sm uppercase tracking-[0.16em] text-accent">rolê fechado</motion.p>
      <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.6, ease }} className="mt-2 font-serif text-[44px] leading-none">{place.name}</motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-3 text-sm text-mute">Reserva simulada pra {size} {size === 1 ? 'pessoa' : 'pessoas'}. O grupo foi avisado.</motion.p>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.5, ease }} className="mt-10 grid w-full gap-2">
        <Button size="lg" onClick={onReview}>Já fui, quero avaliar</Button>
        <Button size="lg" variant="ghost" onClick={onHome}>Voltar pro início</Button>
      </motion.div>
    </motion.div>
  )
}
