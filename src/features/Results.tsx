import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Check, Copy, ExternalLink, Heart, Send, Sparkles, Star } from 'lucide-react'
import { AnimatedNumber, Avatar, Button, Cover, Page, Skeleton, StreamText, Tag, TopBar, Typing, cx } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { ease, spring } from '../ui/motion'
import { useHelpful, useRequest } from '../lib/api'
import { KIND_LABEL, nicheLabel, occasionLabel, priceLabel } from '../lib/labels'
import type { RequestDetail } from '../lib/types'

export function Results() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, isLoading } = useRequest(id)
  const [introDone, setIntroDone] = useState(false)
  const [share, setShare] = useState(false)

  return (
    <Page className="pb-32">
      <TopBar title={data?.author.id === 'me' ? 'Seu pedido' : data?.author.handle} />
      {isLoading || !data ? (
        <div className="grid gap-3 px-5 pt-4"><Skeleton className="h-20" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      ) : (
        <>
          <header className="px-5 pt-2">
            <p className="font-serif text-[30px] leading-[1.05] tracking-tight text-balance">“{data.request.text}”</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.request.criteria.occasion && <Tag>{occasionLabel(data.request.criteria.occasion)}</Tag>}
              <Tag>{data.request.criteria.groupSize} {data.request.criteria.groupSize === 1 ? 'pessoa' : 'pessoas'}</Tag>
              {data.request.criteria.hood && <Tag>{data.request.criteria.hood}</Tag>}
              {data.request.criteria.budget && <Tag>até R$ {data.request.criteria.budget}</Tag>}
              {data.request.criteria.niches.map((n) => <Tag key={n}>{nicheLabel(n)}</Tag>)}
            </div>
          </header>

          <section className="mt-7 px-5">
            <div className="rounded-[24px] border border-accent/20 bg-accent/[0.05] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-accent">
                <Sparkles size={13} /> IA do rolê
              </div>
              <StreamText text={data.intro} className="text-[15px] leading-relaxed text-ink/90" onDone={() => setIntroDone(true)} />
            </div>
          </section>

          <section className="mt-5 grid gap-4 px-5">
            <AnimatePresence>
              {introDone
                ? data.recommendations.map((r, i) => (
                    <motion.div key={r.place.id} initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: i * 0.12, duration: 0.7, ease }}>
                      <RecCard rank={i + 1} detail={data} placeId={r.place.id} />
                    </motion.div>
                  ))
                : [0, 1, 2].map((i) => <Skeleton key={i} className="h-[300px] rounded-[28px]" />)}
            </AnimatePresence>
          </section>

          <Community data={data} />

          <div className="mt-8 px-5 text-center">
            <Link to={`/avaliar/${id}`} className="text-sm text-mute underline decoration-white/20 underline-offset-4 hover:text-ink">Já foi? Conta como foi</Link>
          </div>
        </>
      )}

      {data && (
        <motion.div initial={{ y: 100 }} animate={{ y: 0, transition: { delay: 0.6, ...spring } }} className="bottom-bar absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pb-7 pt-10">
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => setShare(true)} icon={<Send size={16} />}>Mandar pro grupo</Button>
            <Button size="lg" variant="soft" onClick={() => nav(`/r/${id}`)}>Votar</Button>
          </div>
        </motion.div>
      )}

      {data && <ShareSheet open={share} onClose={() => setShare(false)} data={data} />}
    </Page>
  )
}

function RecCard({ rank, detail, placeId }: { rank: number; detail: RequestDetail; placeId: string }) {
  const r = detail.recommendations.find((x) => x.place.id === placeId)!
  const votes = detail.tally.find((t) => t.placeId === placeId)?.count ?? 0
  const p = r.place
  return (
    <Link to={`/lugar/${p.id}`} className="group block overflow-hidden rounded-[28px] border border-line bg-surface">
      <div className="relative">
        <Cover hue={p.hue} layoutId={`cover-${p.id}`} className="h-44 w-full" rounded="rounded-none" />
        <span className="absolute left-4 top-4 font-serif text-5xl italic leading-none text-white/90 drop-shadow">{rank}</span>
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs backdrop-blur-md">
          <span className="relative size-4">
            <svg viewBox="0 0 20 20" className="size-4 -rotate-90">
              <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="3" />
              <motion.circle cx="10" cy="10" r="8" fill="none" stroke="#c6ff3d" strokeWidth="3" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: r.match / 100 }} transition={{ duration: 1.2, ease, delay: 0.3 }} />
            </svg>
          </span>
          <span><AnimatedNumber value={r.match} />% match</span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-serif text-[28px] leading-none">{p.name}</p>
          <span className="flex items-center gap-1 text-sm text-ink/80"><Star size={13} className="fill-accent text-accent" />{p.rating.toFixed(1)}</span>
        </div>
        <p className="mt-1.5 text-xs text-mute">{KIND_LABEL[p.kind]} · {p.hood} · {priceLabel(p.price)} · até {p.capacity} pessoas</p>
        <ul className="mt-3.5 grid gap-2">
          {r.reasons.map((s, i) => (
            <motion.li key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease }} className="flex items-start gap-2 text-[13px] text-ink/85">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><Check size={10} strokeWidth={3} /></span>{s}
            </motion.li>
          ))}
        </ul>
        {votes > 0 && <p className="mt-3 text-xs text-accent">{votes} {votes === 1 ? 'voto' : 'votos'} do grupo</p>}
      </div>
    </Link>
  )
}

function Community({ data }: { data: RequestDetail }) {
  const helpful = useHelpful(data.request.id)
  return (
    <section className="mt-10 px-5">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-mute">Da comunidade</h2>
        <span className="text-xs text-faint">{data.answers.length} {data.answers.length === 1 ? 'resposta' : 'respostas'}</span>
      </div>
      <div className="grid gap-3">
        <AnimatePresence initial={false}>
          {data.answers.map((a) => (
            <motion.article
              key={a.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.97, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.6, ease }}
              className="rounded-[24px] border border-line bg-surface/70 p-4"
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={a.user.name} hue={a.user.hue} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">{a.user.handle}</p>
                  <p className="truncate text-[11px] text-mute">curador · {a.user.curatorOf.map(nicheLabel).join(', ').toLowerCase()} · {a.user.reputation} rep</p>
                </div>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/90">{a.comment}</p>
              <div className="mt-3 flex items-center justify-between">
                <Link to={`/lugar/${a.place.id}`} className="flex items-center gap-2 rounded-full bg-white/[0.05] py-1 pl-1 pr-3 text-xs hover:bg-white/[0.08]">
                  <Cover hue={a.place.hue} className="size-6" rounded="rounded-full" />{a.place.name}
                </Link>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => helpful.mutate(a.id)}
                  className={cx('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors', a.markedHelpful ? 'bg-accent text-accent-ink' : 'bg-white/[0.05] text-mute')}
                >
                  <motion.span key={String(a.markedHelpful)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={spring}>
                    <Heart size={12} className={a.markedHelpful ? 'fill-current' : ''} />
                  </motion.span>
                  <AnimatedNumber value={a.helpful} /> útil
                </motion.button>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {data.pendingAnswers > 0 && (
            <motion.div key="typing" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 overflow-hidden rounded-[20px] border border-dashed border-line px-4 py-3.5 text-[13px] text-mute">
              <Typing /> {data.pendingAnswers} {data.pendingAnswers === 1 ? 'curador está' : 'curadores estão'} respondendo…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

function ShareSheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: RequestDetail }) {
  const toast = useToast()
  const nav = useNavigate()
  const url = `${location.origin}${import.meta.env.BASE_URL}r/${data.request.id}`
  const [copied, setCopied] = useState(false)
  const opts = data.options.slice(0, 3)
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-none">Mandar pro grupo</p>
      <p className="mt-2 text-sm text-mute">É assim que o link aparece no WhatsApp. Quem abrir vota sem instalar nada.</p>

      <div className="mt-5 rounded-[22px] bg-[#0b141a] p-3">
        <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15, duration: 0.5, ease }} className="ml-auto max-w-[88%] rounded-[14px] rounded-tr-sm bg-[#005c4b] p-1.5 text-[#e9edef]">
          <div className="overflow-hidden rounded-[10px] bg-black/25">
            <div className="flex h-24">
              {opts.map((p) => <Cover key={p.id} hue={p.hue} className="h-full flex-1" rounded="rounded-none" />)}
            </div>
            <div className="px-2.5 py-2">
              <p className="text-[13px] font-medium leading-tight">Vota no rolê: {opts.map((o) => o.name).join(', ')}</p>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-white/60">“{data.request.text}”</p>
              <p className="mt-1 text-[11px] text-white/45">{location.host}</p>
            </div>
          </div>
          <p className="px-1.5 pb-0.5 pt-1.5 text-[13px] text-[#53bdeb] break-all">{url}</p>
          <p className="pr-1 text-right text-[10px] text-white/50">agora ✓✓</p>
        </motion.div>
      </div>

      <div className="mt-5 grid gap-2">
        <Button
          size="lg"
          icon={copied ? <Check size={16} /> : <Copy size={16} />}
          onClick={async () => {
            try { await navigator.clipboard.writeText(url) } catch { /* ambiente sem clipboard */ }
            setCopied(true); toast('Link copiado'); setTimeout(() => setCopied(false), 1800)
          }}
        >
          {copied ? 'Copiado' : 'Copiar link'}
        </Button>
        <Button size="lg" variant="soft" icon={<ExternalLink size={16} />} onClick={() => { onClose(); nav(`/r/${data.request.id}`) }}>
          Abrir página de votação
        </Button>
      </div>
    </Sheet>
  )
}
