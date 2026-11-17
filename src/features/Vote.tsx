import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight, CalendarCheck, Clock, Crown, Info, MapPinPlus, Radio, Send, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar, AnimatedNumber, Button, Cover, EmptyState, Overlay, Page, Skeleton, cx } from '../ui/primitives'
import { ease, spring } from '../ui/motion'
import { placeIcon } from '../ui/placeIcon'
import { importRequest, useDecide, useProfile, useRequest, useSync, useVote } from '../lib/api'
import { priceLabel } from '../lib/labels'
import { currentVoteLink, readPayload } from '../lib/share'
import { track } from '../lib/track'
import type { Place, VoteTally } from '../lib/types'
import { StorySheet } from './StorySheet'
import { AskBox } from './AskBox'
import type { StoryCard } from '../lib/storyCard'

const FRIENDS = ['Bia', 'Caio', 'Duda', 'Léo', 'Mari']
const hueOf = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360
const leaderOf = (t: VoteTally[]) => [...t].sort((a, b) => b.count - a.count).find((x) => x.count > 0)

/** Página pública que o link do WhatsApp abre: vota sem login, em qualquer aparelho. */
export function VotePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [ready, setReady] = useState(false)

  // link autossuficiente: se o pedido veio no #p=..., cria localmente antes de buscar
  useEffect(() => {
    ;(async () => {
      const payload = await readPayload(location.hash)
      if (payload && payload.id === id) {
        await importRequest(payload)
        await qc.invalidateQueries({ queryKey: ['request', id] })
      }
      setReady(true)
      track('vote_page_opened', { id, viaLink: !!payload })
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isError } = useRequest(ready ? id : '')
  // veio de outro aparelho pelo link: quem abre é convidado, não o autor
  const external = !!data?.request.externalAuthor
  const { data: me } = useProfile()
  const vote = useVote(id)
  const decide = useDecide(id)
  const syncQ = useSync()
  const live = !!syncQ.data?.online
  const [voter, setVoter] = useState(() => localStorage.getItem('role.voter') ?? '')
  const [celebrate, setCelebrate] = useState(false)
  const [highlight, setHighlight] = useState<string[]>([])
  const nameRef = useRef<HTMLInputElement>(null)
  const shake = useAnimationControls()

  useEffect(() => { if (!voter && me?.name) setVoter(me.name.split(' ')[0]) }, [me, voter])
  useEffect(() => { if (voter) localStorage.setItem('role.voter', voter) }, [voter])

  // modo demo: amigos fictícios votam para mostrar o placar ao vivo (desligado para testes reais)
  const reqId = data?.request.id
  useEffect(() => {
    // com placar ao vivo (backend no ar) não simula: voto fictício misturado com voto real confunde o grupo
    if (!data || external || me?.demoMode === false || !syncQ.isFetched || live) return
    const key = `role.sim.${id}`
    if (localStorage.getItem(key)) return
    const opts = data.options
    const picks = [0, 1, 0, 2].map((i) => opts[Math.min(i, opts.length - 1)].id)
    const timers = FRIENDS.slice(0, 4).flatMap((f, i) => [
      setTimeout(() => {
        vote.mutate({ placeId: picks[i], voter: f, demo: true })
        vote.mutate({ placeId: data.times[i % 2 === 0 ? 0 : Math.min(1, data.times.length - 1)], voter: f, kind: 'time', demo: true })
        if (i === 3) localStorage.setItem(key, '1')
      }, 1400 + i * 1700),
    ])
    return () => timers.forEach(clearTimeout)
  }, [reqId, external, me?.demoMode, syncQ.isFetched, live]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = data?.tally.reduce((a, t) => a + t.count, 0) ?? 0
  const leader = useMemo(() => {
    const top = data && leaderOf(data.tally)
    return top ? data!.options.find((o) => o.id === top.placeId) ?? null : null
  }, [data])
  const leaderTime = data && leaderOf(data.timeTally)?.placeId
  const decided = data?.request.status === 'decidido'
  const iVoted = !!data?.tally.some((t) => t.voters.includes(voter.trim()))
  // visitante (veio pelo link) depois de votar: convite para fazer o próprio pedido
  const showCta = !!data && iVoted && (external || !me?.onboarded)

  function cast(placeId: string, kind: 'place' | 'time' = 'place') {
    if (!voter.trim()) {
      nameRef.current?.focus()
      shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } })
      return
    }
    vote.mutate({ placeId, voter: voter.trim(), kind })
    track('vote_cast', { kind, external })
  }

  if (isError) return (
    <Page><EmptyState title="Rolê não encontrado" text="Esse link está incompleto ou expirou. Peça para reenviarem pelo botão “Mandar pro grupo”." action={<Button onClick={() => nav('/')}>Conhecer o rolê.</Button>} /></Page>
  )

  const footer = data && leader && total >= 2 && !decided && !external ? (
            <Button size="lg" className="w-full" icon={<CalendarCheck size={16} />} disabled={decide.isPending}
              onClick={async () => { await decide.mutateAsync({ placeId: leader.id, time: leaderTime }); track('decided', { placeId: leader.id, time: leaderTime }); setCelebrate(true) }}>
              Fechar no {leader.name}{leaderTime ? ` · ${leaderTime}` : ''}
            </Button>
  ) : null

  return (
    <Page className="pb-8" footer={footer}>
      <div className="flex items-center justify-between px-5 pt-14">
        <span className="font-serif text-xl italic">rolê<span className="text-accent">.</span></span>
        <button onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} className="grid size-9 place-items-center rounded-full bg-white/[0.06]" aria-label="Fechar"><X size={16} /></button>
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

          {decided && (() => {
            const p = data.options.find((o) => o.id === data.request.decidedPlaceId)
            return p ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
                className="mx-5 mt-5 flex items-center gap-3 rounded-[22px] border border-accent/40 bg-accent/[0.08] p-3">
                <Cover hue={p.hue} icon={placeIcon(p)} iconSize={20} className="size-12 shrink-0" rounded="rounded-[12px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-accent">Fechado</p>
                  <p className="truncate font-serif text-[22px] leading-tight">{p.name}{data.request.decidedTime ? ` · ${data.request.decidedTime}` : ''}</p>
                </div>
                <Link to={`/lugar/${p.id}`} className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink">Ver</Link>
              </motion.div>
            ) : null
          })()}

          <motion.label animate={shake} className={cx('mx-5 mt-6 flex items-center gap-3 rounded-[20px] border bg-surface px-4 py-3 transition-colors', voter.trim() ? 'border-line' : 'border-accent/60')}>
            <span className="text-xs text-mute">Votando como</span>
            <input ref={nameRef} value={voter} onChange={(e) => setVoter(e.target.value)} placeholder="seu nome" aria-label="Seu nome"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute" />
          </motion.label>

          <section className="mt-5 grid gap-3 px-5">
            {data.options.map((p, i) => {
              const t = data.tally.find((x) => x.placeId === p.id)
              const count = t?.count ?? 0
              const pct = total ? count / total : 0
              const mine = t?.voters.includes(voter.trim())
              const isLeader = leader?.id === p.id
              return (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.6, ease } }}
                  whileTap={{ scale: 0.98 }}
                  aria-pressed={mine}
                  data-opt={p.id}
                  onClick={() => !decided && cast(p.id)}
                  className={cx('relative overflow-hidden rounded-[22px] border p-3 text-left transition-[colors,box-shadow] duration-500', mine ? 'border-accent/70' : 'border-line bg-surface/60', highlight.includes(p.id) && 'shadow-[0_0_0_2px_rgba(198,255,61,0.9),0_0_40px_-6px_rgba(198,255,61,0.55)]')}
                >
                  <motion.div className="absolute inset-y-0 left-0 bg-accent/[0.12]" initial={false} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />
                  <div className="relative flex items-center gap-3">
                    <Cover hue={p.hue} icon={placeIcon(p)} iconSize={22} className="size-14 shrink-0" rounded="rounded-[14px]" />
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

          <section className="mt-7 px-5">
            <p className="mb-2.5 flex items-center gap-2 text-[13px] uppercase tracking-[0.14em] text-mute"><Clock size={13} /> Quando?</p>
            <div className="grid grid-cols-3 gap-2">
              {data.times.map((tm) => {
                const t = data.timeTally.find((x) => x.placeId === tm)
                const mine = t?.voters.includes(voter.trim())
                return (
                  <motion.button key={tm} whileTap={{ scale: 0.95 }} aria-pressed={mine} onClick={() => !decided && cast(tm, 'time')}
                    className={cx('rounded-[18px] border px-2 py-3 text-center transition-colors', mine ? 'border-accent bg-accent/10' : 'border-line bg-surface/60')}>
                    <p className="text-[14px]">{tm}</p>
                    <p className="mt-0.5 text-[11px] text-mute"><AnimatedNumber value={t?.count ?? 0} /> {t?.count === 1 ? 'voto' : 'votos'}{leaderTime === tm ? ' · 👑' : ''}</p>
                  </motion.button>
                )
              })}
            </div>
          </section>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-faint">
            {live && <Radio size={12} className="text-accent" />}
            {total} {total === 1 ? 'voto' : 'votos'}{live ? ' · placar ao vivo' : ' neste aparelho'}
          </p>

          {!decided && (
            <div className="mx-5 mt-4 grid gap-2">
              <button onClick={() => { track('suggest_from_vote', { id }); nav(`/s/${id}${location.search}${location.hash}`) }}
                className="flex items-center gap-3 rounded-[20px] border border-dashed border-white/15 px-4 py-3 text-left transition-colors hover:border-accent/40">
                <MapPinPlus size={18} className="shrink-0 text-accent" />
                <span className="flex-1">
                  <span className="block text-[14px]">Nenhuma te convence?</span>
                  <span className="block text-[12px] text-mute">Sugere outro lugar: {live ? 'entra na votação na hora' : `vai pro ${data.author.name.split(' ')[0]} aprovar`}</span>
                </span>
                <ArrowRight size={16} className="text-mute" />
              </button>
              {iVoted && (
                <a href={`https://wa.me/?text=${encodeURIComponent(`Já votei no rolê. Falta você 👇\n${currentVoteLink()}`)}`} target="_blank" rel="noreferrer"
                  onClick={() => track('vote_reshared', { id })}
                  className="flex items-center justify-center gap-2 rounded-full bg-white/[0.05] py-2.5 text-[13px] text-mute transition-colors hover:text-ink">
                  <Send size={14} />Falta gente votar? Cobra no grupo
                </a>
              )}
            </div>
          )}

          <AskBox
            pedido={data.request.text}
            options={data.options}
            criteria={data.request.criteria}
            tally={data.tally}
            hood={me?.hood}
            onHighlight={(ids) => {
              setHighlight(ids)
              setTimeout(() => setHighlight([]), 9000)
            }}
          />
          <AnimatePresence>
            {showCta && (
              <motion.button
                initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease }}
                onClick={() => { track('cta_new_request', { from: 'vote' }); nav(me?.onboarded ? '/novo' : '/onboarding') }}
                className="mx-5 mt-5 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-[24px] border border-accent/30 bg-accent/[0.07] p-4 text-left"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Sparkles size={18} /></span>
                <span className="flex-1">
                  <span className="block font-serif text-[22px] leading-none">Tem um rolê pra decidir?</span>
                  <span className="mt-1 block text-[13px] text-mute">Descreve em uma frase: a IA sugere e sua turma vota.</span>
                </span>
                <ArrowRight size={18} className="text-accent" />
              </motion.button>
            )}
          </AnimatePresence>
          {external && !live && (
            <p className="mx-5 mt-3 flex items-start gap-2 rounded-[16px] bg-white/[0.04] p-3 text-[12px] leading-relaxed text-mute">
              <Info size={14} className="mt-0.5 shrink-0" />
              Versão de teste: seu voto fica salvo neste celular. Conta no grupo em qual você votou — o placar compartilhado chega com a próxima versão.
            </p>
          )}
        </>
      )}


      <Overlay>
        <AnimatePresence>
          {celebrate && data && (
            <Celebration
              place={data.options.find((o) => o.id === data.request.decidedPlaceId) ?? leader!}
              size={data.request.criteria.groupSize}
              time={data.request.decidedTime ?? leaderTime}
              onReview={() => nav(`/avaliar/${id}`)}
              onHome={() => nav('/')}
              author={data.author.name.split(' ')[0]}
            />
          )}
        </AnimatePresence>
      </Overlay>
    </Page>
  )
}

function Celebration({ place, size, time, onReview, onHome, author }: { place: Place; size: number; time?: string; onReview: () => void; onHome: () => void; author: string }) {
  const dots = Array.from({ length: 28 })
  const [story, setStory] = useState(false)
  const card = useMemo<StoryCard>(() => ({ kind: 'fechado', place, time, people: size, author }), [place, time, size, author])
  const link = `${location.origin}${import.meta.env.BASE_URL}?src=ig`
  return (
    <motion.div className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg/90 px-8 text-center backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-3 text-sm text-mute">{time ? `${time} · ` : ''}Reserva simulada pra {size} {size === 1 ? 'pessoa' : 'pessoas'}.</motion.p>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.5, ease }} className="mt-10 grid w-full gap-2">
        <button
          onClick={() => setStory(true)}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full text-[15px] font-medium text-white shadow-[0_10px_34px_-10px_rgba(225,48,108,0.6)] transition-transform active:scale-[0.98]"
          style={{ background: 'linear-gradient(90deg,#f58529,#dd2a7b 45%,#8134af 75%,#515bd4)' }}
        >
          Postar no Story
        </button>
        <Button size="lg" variant="soft" onClick={onReview}>Já fui, quero avaliar</Button>
        <Button size="lg" variant="ghost" onClick={onHome}>Voltar pro início</Button>
      </motion.div>
      <StorySheet open={story} onClose={() => setStory(false)} card={card} link={link} context="fechado" />
    </motion.div>
  )
}
