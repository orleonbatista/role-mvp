import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AlertTriangle, Check, Copy, ExternalLink, Heart, MapPinPlus, Send, Share2, Sparkles, Star } from 'lucide-react'
import { AnimatedNumber, Avatar, Button, Cover, EmptyState, Page, Skeleton, StreamText, Tag, TopBar, Typing, cx } from '../ui/primitives'
import { placeIcon } from '../ui/placeIcon'
import { track } from '../lib/track'
import { shareText, shareUrl, suggestUrl } from '../lib/share'
import { withSource, type StoryCard } from '../lib/storyCard'
import { StorySheet } from './StorySheet'
import { occasionLabel as occLabel } from '../lib/labels'
import { openStatus } from '../lib/hours'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { ease, spring } from '../ui/motion'
import { useHelpful, useRequest } from '../lib/api'
import { KIND_LABEL, nicheLabel, occasionLabel, priceLabel } from '../lib/labels'
import type { RequestDetail } from '../lib/types'
import { isCommunity } from '../mocks/seeds/places'

export function Results() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, isLoading, isError } = useRequest(id)
  const [introDone, setIntroDone] = useState(false)
  // lacuna de curadoria: recomendação veio da base (OSM) ou o melhor curado encaixa mal → IA convida a comunidade
  const recs = data?.recommendations ?? []
  const curatedGood = recs.some((r) => r.place.curation !== 'base' && r.match >= 55)
  const gap = !!data && recs.some((r) => r.place.curation === 'base')
  const crit = data?.request.criteria
  const gapLabel = crit ? [crit.niches[0] ? nicheLabel(crit.niches[0]).toLowerCase() : crit.occasion ? `lugar pra ${occLabel(crit.occasion).toLowerCase()}` : 'lugar assim', crit.hood ? `em ${crit.hood}` : ''].filter(Boolean).join(' ') : ''
  useEffect(() => { if (gap && introDone) track('curation_invite_shown', { id, curatedGood }) }, [gap, introDone]) // eslint-disable-line react-hooks/exhaustive-deps
  const [share, setShare] = useState(false)
  const [story, setStory] = useState(false)
  const [storySugira, setStorySugira] = useState(false)
  const loaded = !!data
  const optKey = data?.options.map((o) => o.id).join() ?? ''
  const [link, setLink] = useState('')
  useEffect(() => { if (data) shareUrl(data).then(setLink) }, [data?.request.id, optKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // memo: a arte não pode ser refeita a cada polling do pedido
  const storyCard = useMemo(() => (data ? pedidoCard(data) : null), [data?.request.id, optKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const sugiraCard = useMemo<StoryCard | null>(() => {
    if (!data) return null
    const p = pedidoCard(data) as Extract<StoryCard, { kind: 'pedido' }>
    return { kind: 'sugira', text: p.text, chips: p.chips, current: data.options.map((o) => o.name), author: p.author }
  }, [data?.request.id, optKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) track('results_viewed', { id, confidence: data?.confidence }) }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isError) return (
    <Page><TopBar /><EmptyState title="Pedido não encontrado" text="Esse rolê não existe neste aparelho. Se veio de um link, peça para reenviarem pelo app." action={<Button onClick={() => nav('/')}>Ir pro início</Button>} /></Page>
  )

  const footer = data ? (
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => { setShare(true); track('share_opened', { id }) }} icon={<Send size={16} />}>Mandar pro grupo</Button>
            <Button size="lg" variant="soft" onClick={() => nav(`/r/${id}`)}>Votar</Button>
          </div>
  ) : null

  return (
    <Page footer={footer}>
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
              {data.request.criteria.when && <Tag>{data.request.criteria.when.label}</Tag>}
              {data.request.criteria.budget && <Tag>até R$ {data.request.criteria.budget}</Tag>}
              {data.request.criteria.niches.map((n) => <Tag key={n}>{nicheLabel(n)}</Tag>)}
            </div>
          </header>

          <section className="mt-7 px-5">
            <div className="rounded-[24px] border border-accent/20 bg-accent/[0.05] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-accent">
                <Sparkles size={13} /> IA do rolê
                <span className={cx('ml-auto rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal', data.confidence === 'alta' ? 'bg-accent/15 text-accent' : data.confidence === 'media' ? 'bg-white/10 text-ink/80' : 'bg-amber-400/15 text-amber-300')}>
                  confiança {data.confidence === 'media' ? 'média' : data.confidence}
                </span>
              </div>
              <StreamText text={data.intro} className="text-[15px] leading-relaxed text-ink/90" onDone={() => setIntroDone(true)} />
              {introDone && gap && (
                <p className="mt-2 text-[13px] leading-relaxed text-ink/75">
                  {curatedGood ? 'Completei com lugares reais da cidade que ninguém daqui curou ainda (marcados).' : 'A comunidade ainda não curou nada que encaixe bem nisso. Mostrei lugares reais da cidade, sem curadoria: confira antes de ir.'}
                </p>
              )}
              {data.request.criteria.source && (
                <p className="mt-2 text-[11px] text-faint">
                  {data.request.criteria.source.engine === 'llm'
                    ? `entendido por ${data.request.criteria.source.model} rodando na ${data.request.criteria.source.via ?? 'sua GPU'} · ${((data.request.criteria.source.ms ?? 0) / 1000).toFixed(1)}s`
                    : 'entendido pelo parser local (regras)'}
                </p>
              )}
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

          {introDone && gap && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6, ease }}
              className="mx-5 mt-5 rounded-[24px] border border-dashed border-accent/40 bg-accent/[0.04] p-4">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-accent"><MapPinPlus size={13} />Falta curadoria aqui</p>
              <p className="mt-2 text-[14px] leading-relaxed text-ink/90">
                Ninguém da comunidade indicou {gapLabel} ainda. Conhece algum que valha? Sua indicação entra nesta votação e no catálogo do rolê.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button icon={<MapPinPlus size={15} />} onClick={() => { track('curation_invite_click', { id }); nav(`/s/${id}`) }}>Indicar um lugar</Button>
                <Button variant="soft" icon={<Share2 size={15} />} onClick={() => { track('curation_invite_share', { id }); setShare(true) }}>Pedir aos amigos</Button>
              </div>
            </motion.section>
          )}

          <Community data={data} />

          <div className="mt-8 px-5 text-center">
            <Link to={`/avaliar/${id}`} className="text-sm text-mute underline decoration-white/20 underline-offset-4 hover:text-ink">Já foi? Conta como foi</Link>
          </div>
        </>
      )}


      {data && <ShareSheet open={share} onClose={() => setShare(false)} data={data} link={link} onStory={() => { setShare(false); setTimeout(() => setStory(true), 250) }} onStorySugira={() => { setShare(false); setTimeout(() => setStorySugira(true), 250) }} />}
      {data && <StorySheet open={storySugira} onClose={() => setStorySugira(false)} card={sugiraCard} link={link ? withSource(suggestUrl(link), 'ig') : ''} context="sugestoes" />}
      {data && <StorySheet open={story} onClose={() => setStory(false)} card={storyCard} link={link ? withSource(link, 'ig') : ''} context="pedido" />}
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
        <Cover hue={p.hue} icon={placeIcon(p)} iconSize={64} layoutId={`cover-${p.id}`} className="h-44 w-full" rounded="rounded-none" />
        <span className="absolute left-4 top-4 font-serif text-5xl italic leading-none text-white/90 drop-shadow">{rank}</span>
        {p.curation === 'base' && <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-ink/90 backdrop-blur-md">sem curadoria · OpenStreetMap</span>}
        {isCommunity(p) && <span className="absolute bottom-3 left-3 rounded-full bg-accent/90 px-2.5 py-1 text-[11px] font-medium text-accent-ink">curado pela comunidade</span>}
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
          <span className="flex items-center gap-1 text-sm text-ink/80">{p.ratingCount ? <><Star size={13} className="fill-accent text-accent" />{p.rating.toFixed(1)}</> : p.curation === 'base' ? null : <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">novo</span>}</span>
        </div>
        {p.source
          ? <p className="mt-1.5 text-xs text-mute">{p.tagline === 'Sugerido pela comunidade' ? KIND_LABEL[p.kind] : p.tagline} · {p.hood} · {priceLabel(p.price)}{p.curation === 'base' ? ' (estimado)' : ''} · horário no Maps</p>
          : <>
              <p className="mt-1.5 text-xs text-mute">{KIND_LABEL[p.kind]} · {p.hood} · {priceLabel(p.price)} · até {p.capacity} pessoas</p>
              <p className={cx('mt-1 text-[11px]', openStatus(p).open ? 'text-accent' : 'text-faint')}>{p.kind === 'evento' ? p.when : openStatus(p).label}</p>
            </>}
        <ul className="mt-3.5 grid gap-2">
          {r.reasons.map((s, i) => (
            <motion.li key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease }} className="flex items-start gap-2 text-[13px] text-ink/85">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><Check size={10} strokeWidth={3} /></span>{s}
            </motion.li>
          ))}
        </ul>
        {r.warnings.map((w) => (
          <p key={w} className="mt-2 flex items-start gap-2 text-[13px] text-amber-300/90"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{w}</p>
        ))}
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
                  <p className="text-[13px]">{a.kind === 'sugestao' ? a.user.name : a.user.handle}</p>
                  <p className="truncate text-[11px] text-mute">
                    {a.kind === 'sugestao' ? 'sugestão pelo link' : `curador · ${a.user.curatorOf.map(nicheLabel).join(', ').toLowerCase()} · ${a.user.reputation} rep`}
                  </p>
                </div>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px]', a.fit.match >= 70 ? 'bg-accent/15 text-accent' : 'bg-amber-400/15 text-amber-300')}>{a.fit.match}% encaixe</span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/90">{a.comment}</p>
              {a.fit.warnings[0] && <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-amber-300/90"><AlertTriangle size={12} />{a.fit.warnings[0]}</p>}
              <div className="mt-3 flex items-center justify-between">
                <Link to={`/lugar/${a.place.id}`} className="flex items-center gap-2 rounded-full bg-white/[0.05] py-1 pl-1 pr-3 text-xs hover:bg-white/[0.08]">
                  <Cover hue={a.place.hue} className="size-6" rounded="rounded-full" />{a.place.name}{a.place.source === 'google' && <span className="text-faint">· comunidade</span>}
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

export function pedidoCard(d: RequestDetail): StoryCard {
  const c = d.request.criteria
  const chips = [c.occasion && occLabel(c.occasion), c.groupSize > 1 && `${c.groupSize} pessoas`, c.hood, c.when?.label].filter(Boolean) as string[]
  return { kind: 'pedido', text: d.request.text, chips, options: d.options.slice(0, 3), author: d.author.name.split(' ')[0] }
}

function ShareSheet({ open, onClose, data, link, onStory, onStorySugira }: { open: boolean; onClose: () => void; data: RequestDetail; link: string; onStory: () => void; onStorySugira: () => void }) {
  const toast = useToast()
  const nav = useNavigate()
  const url = link ? withSource(link, 'wa') : ''
  const text = shareText(data)
  const [copied, setCopied] = useState(false)
  const opts = data.options.slice(0, 3)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Vota no rolê', text, url })
      track('share_sent', { via: 'native' })
    } catch { /* cancelado */ }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-none">Mandar pro grupo</p>
      <p className="mt-2 text-sm text-mute">O link já leva o pedido junto: abre em qualquer celular, sem instalar nada.</p>

      <div className="mt-5 rounded-[22px] bg-[#0b141a] p-3">
        <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15, duration: 0.5, ease }} className="ml-auto max-w-[88%] rounded-[14px] rounded-tr-sm bg-[#005c4b] p-1.5 text-[#e9edef]">
          <div className="overflow-hidden rounded-[10px] bg-black/25">
            <div className="flex h-20">
              {opts.map((p) => <Cover key={p.id} hue={p.hue} icon={placeIcon(p)} iconSize={22} className="h-full flex-1" rounded="rounded-none" />)}
            </div>
            <div className="px-2.5 py-2">
              <p className="text-[13px] font-medium leading-tight">Vota no rolê: {opts.map((o) => o.name).join(', ')}</p>
              <p className="mt-1 text-[11px] text-white/45">{location.host}</p>
            </div>
          </div>
          <p className="px-1.5 pb-0.5 pt-1.5 text-[13px]">{text}</p>
          <p className="truncate px-1.5 text-[13px] text-[#53bdeb]">{url}</p>
          <p className="pr-1 text-right text-[10px] text-white/50">agora ✓✓</p>
        </motion.div>
      </div>

      <div className="mt-5 grid gap-2">
        <button
          onClick={onStory}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full text-[15px] font-medium text-white shadow-[0_10px_34px_-10px_rgba(225,48,108,0.6)] transition-transform active:scale-[0.98]"
          style={{ background: 'linear-gradient(90deg,#f58529,#dd2a7b 45%,#8134af 75%,#515bd4)' }}
        >
          Postar no Story do Instagram
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => track('share_sent', { via: 'whatsapp' })}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#25d366] text-[15px] font-medium text-[#062b14] shadow-[0_8px_30px_-8px_rgba(37,211,102,0.55)] transition-transform active:scale-[0.98]"
        >
          <Send size={16} /> Enviar no WhatsApp
        </a>
        <div className="grid grid-cols-2 gap-2">
          {canShare ? (
            <Button size="lg" variant="soft" icon={<Share2 size={16} />} onClick={nativeShare}>Compartilhar</Button>
          ) : (
            <Button size="lg" variant="soft" icon={copied ? <Check size={16} /> : <Copy size={16} />}
              onClick={async () => {
                try { await navigator.clipboard.writeText(`${text}\n${url}`) } catch { /* sem clipboard */ }
                setCopied(true); toast('Link copiado'); track('share_sent', { via: 'copy' }); setTimeout(() => setCopied(false), 1800)
              }}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          )}
          <Button size="lg" variant="soft" icon={<ExternalLink size={16} />} onClick={() => { onClose(); nav(`/r/${data.request.id}`) }}>Votação</Button>
        </div>
      </div>

      <div className="mt-7 border-t border-line pt-5">
        <p className="font-serif text-[22px] leading-none">Pedir sugestões</p>
        <p className="mt-1.5 text-[13px] text-mute">Quem recebe indica um lugar e vê se encaixa no pedido. A sugestão entra na votação (na hora, quando o backend está no ar).</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={link ? `https://wa.me/?text=${encodeURIComponent(`Me indica um lugar? “${data.request.text}”\n👉 Sugere aqui:\n${withSource(suggestUrl(link), 'wa')}`)}` : undefined}
            target="_blank" rel="noreferrer" onClick={() => track('suggest_request_sent', { via: 'whatsapp' })}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/[0.07] text-sm font-medium hover:bg-white/[0.1]"
          >
            <Send size={15} /> WhatsApp
          </a>
          <Button variant="soft" className="h-12" onClick={onStorySugira}>Story</Button>
        </div>
      </div>
    </Sheet>
  )
}
