import { motion, useScroll, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { StoryCard } from '../lib/storyCard'
import { useNavigate, useParams } from 'react-router'
import { CalendarCheck, ChevronLeft, Clock, MapPin, Megaphone, Minus, Plus, Share2, Star, Ticket, Users } from 'lucide-react'
import { Link } from 'react-router'
import { PromoteSheet } from './PromoteSheet'
import { StorySheet } from './StorySheet'
import { Avatar, Button, Chip, Cover, EmptyState, Page, Skeleton, Tag, cx } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'
import { placeIcon } from '../ui/placeIcon'
import { DAY_SHORT, distanceKm, fmtKm, isOpenAt, openStatus } from '../lib/hours'
import { track } from '../lib/track'
import { useCreateLead, useProfile } from '../lib/api'
import type { Place } from '../lib/types'
import { useToast } from '../ui/Toast'
import { ease, item, list } from '../ui/motion'
import { usePlace } from '../lib/api'
import { placeById } from '../mocks/seeds/places'
import { KIND_LABEL, VERDICT_LABEL, nicheLabel, occasionLabel, priceLabel, timeAgo, vibeLabel } from '../lib/labels'

export function PlacePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { data, isError } = usePlace(id)
  const { data: me } = useProfile()
  const [lead, setLead] = useState(false)
  const [promote, setPromote] = useState(false)
  const [story, setStory] = useState<{ link: string; by?: string } | null>(null)
  useEffect(() => { track('place_viewed', { id }) }, [id])
  // usa o seed já carregado para a capa aparecer no mesmo frame (transição compartilhada sem "pulo")
  const place = data?.place ?? placeById.get(id)
  const scroller = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scroller })
  const coverScale = useTransform(scrollY, [-100, 0, 300], [1.15, 1, 1.05])
  const coverY = useTransform(scrollY, [0, 300], [0, 90])
  const titleOpacity = useTransform(scrollY, [140, 220], [0, 1])
  const storyCard = useMemo<StoryCard | null>(() => (story && place ? { kind: 'evento', place, by: story.by } : null), [story, place])

  if (!place && isError) return (
    <Page><EmptyState title="Lugar não encontrado" text="Esse endereço não existe (ou saiu do catálogo)." action={<Button onClick={() => nav('/')}>Ir pro início</Button>} /></Page>
  )
  if (!place) return <Page><Skeleton className="m-5 h-80" /></Page>
  const status = openStatus(place)
  // lugar do Google visto por outro aparelho: só o resumo viaja (sem horário/capacidade)
  const google = place.source === 'google'
  const noHours = google && place.hours.startsWith('Ver horário')
  const km = distanceKm(me?.hood, place.hood)

  const isEvent = place.kind === 'evento'
  const footer = place.ticketUrl
    ? <a href={place.ticketUrl} target="_blank" rel="noreferrer" onClick={() => track('ticket_click', { id: place.id })}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-ink shadow-[0_8px_30px_-8px_rgba(198,255,61,0.55)] active:scale-[0.98]">
        <Ticket size={16} />Ingresso · {priceLabel(place.price)}
      </a>
    : <Button size="lg" className="w-full" icon={<CalendarCheck size={16} />} onClick={() => { setLead(true); track('reserve_intent', { id: place.id, kind: place.kind }) }}>
          {place.kind === 'evento' ? `Garantir ingresso · ${priceLabel(place.price)}` : place.privateSpace ? 'Reservar pra grupo' : 'Reservar mesa'}
        </Button>
  const chrome = (
      <div className="absolute inset-x-0 top-0 z-20 flex h-24 items-end gap-3 px-4 pb-3">
        <motion.div style={{ opacity: titleOpacity }} className="absolute inset-0 border-b border-line bg-bg/80 backdrop-blur-xl" />
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => nav(-1)} className="relative grid size-10 place-items-center rounded-full bg-black/40 backdrop-blur-md" aria-label="Voltar">
          <ChevronLeft size={18} />
        </motion.button>
        <motion.p style={{ opacity: titleOpacity }} className="relative flex-1 truncate pb-2 font-serif text-xl">{place.name}</motion.p>
        {isEvent && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPromote(true)} className="relative grid size-10 place-items-center rounded-full bg-black/40 backdrop-blur-md" aria-label="Divulgar evento">
            <Share2 size={17} />
          </motion.button>
        )}
      </div>
  )

  return (
    <Page scrollRef={scroller} chrome={chrome} footer={footer}>
        <motion.div style={{ scale: coverScale, y: coverY }} className="relative h-[380px] origin-top">
          <Cover hue={place.hue} icon={placeIcon(place)} iconSize={120} layoutId={`cover-${place.id}`} className="h-full w-full" rounded="rounded-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
        </motion.div>

        <div className="relative -mt-28 px-5">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease }} className="text-xs uppercase tracking-[0.14em] text-white/70">
            {KIND_LABEL[place.kind]} · {place.hood}{place.when ? ` · ${place.when}` : ''}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.2, duration: 0.7, ease }} className="mt-1.5 font-serif text-[52px] leading-[0.9] tracking-tight">
            {place.name}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-3 text-[15px] text-ink/80">{place.tagline}</motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {place.kind !== 'evento' && !noHours && (
              <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', status.open ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-mute')}>
                <span className={cx('size-1.5 rounded-full', status.open ? 'bg-accent' : 'bg-faint')} />{status.label}
              </span>
            )}
            {km !== undefined && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-mute">{fmtKm(km)} de {me?.hood}</span>}
            {place.privateSpace && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-mute">espaço reservável</span>}
          </motion.div>

          <motion.div variants={list} initial="initial" animate="animate" className="mt-6 grid grid-cols-3 gap-2">
            {[
              place.source === 'google'
                ? { k: 'Google', v: place.ratingCount ? (place.rating / 2).toFixed(1) : '—', icon: <Star size={13} className="fill-accent text-accent" />, sub: place.ratingCount ? `${place.ratingCount} avaliações` : 'sem nota' }
                : place.ratingCount === 0
                ? { k: 'nota', v: 'novo', icon: null, sub: 'sem avaliações' }
                : { k: 'nota', v: place.rating.toFixed(1), icon: <Star size={13} className="fill-accent text-accent" />, sub: `${place.ratingCount} avaliações` },
              { k: 'por pessoa', v: place.price === 0 ? 'Grátis' : `R$ ${place.price}`, icon: null, sub: google ? 'estimado' : 'média' },
              google
                ? { k: 'grupo', v: '—', icon: <Users size={13} />, sub: 'pergunte à casa' }
                : { k: 'grupo', v: `${place.capacity}`, icon: <Users size={13} />, sub: 'pessoas' },
            ].map((s) => (
              <motion.div key={s.k} variants={item} className="rounded-[20px] bg-surface p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-mute">{s.k}</p>
                <p className="mt-1 flex items-center gap-1 font-serif text-2xl leading-none">{s.icon}{s.v}</p>
                <p className="mt-1 text-[11px] text-faint">{s.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="mt-6 flex flex-wrap gap-1.5">
            {place.niches.map((n) => <Tag key={n} tone="accent">{nicheLabel(n)}</Tag>)}
            {place.vibes.map((v) => <Tag key={v}>{vibeLabel(v)}</Tag>)}
            {place.tags.map((t) => <Tag key={t}>{({ vegano: 'opção vegana', samba: 'samba', pet: 'pet friendly', acessivel: 'acessível', karaoke: 'karaokê' } as Record<string, string>)[t] ?? t}</Tag>)}
          </div>

          {place.highlights.length > 0 && <h2 className="mb-3 mt-8 text-[13px] uppercase tracking-[0.14em] text-mute">Por que ir</h2>}
          <ul className="grid gap-2">
            {place.highlights.map((h, i) => (
              <motion.li key={h} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5, ease }}
                className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3 text-[14px]">
                <span className="font-serif text-xl italic text-accent">{i + 1}</span>{h}
              </motion.li>
            ))}
          </ul>

          <h2 className="mb-3 mt-8 text-[13px] uppercase tracking-[0.14em] text-mute">Bom para</h2>
          <div className="flex flex-wrap gap-1.5">{place.occasions.map((o) => <Tag key={o}>{occasionLabel(o)}</Tag>)}</div>

          {isEvent && (
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease }}
              className="mt-8 rounded-[24px] border border-accent/25 bg-gradient-to-br from-accent/[0.09] to-transparent p-4">
              <p className="flex items-center gap-2 text-[13px] uppercase tracking-[0.14em] text-accent"><Megaphone size={14} />Vai divulgar?</p>
              <p className="mt-2 text-[14px] text-ink/85">
                {place.promoter ? <>Enviado por <b className="font-medium text-ink">{place.promoter}</b> e aprovado pela curadoria. </> : null}
                Gere a arte do Story e um link que vira votação de grupo, com o seu @.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="soft" icon={<Share2 size={15} />} onClick={() => setPromote(true)}>Divulgar</Button>
                <Link to="/divulgar" className="inline-flex h-11 items-center px-3 text-[13px] text-mute underline-offset-4 hover:text-ink hover:underline">Tem um evento? Envie</Link>
              </div>
            </motion.div>
          )}

          <div className="mt-8 grid gap-2 text-sm text-ink/80">
            <p className="flex items-center gap-2"><MapPin size={14} className="text-mute" />{place.address}</p>
            <p className="flex items-center gap-2"><Clock size={14} className="text-mute" />{place.hours}</p>
            {place.source === 'google' && (
              <>
                {place.mapsUrl && (
                  <a href={place.mapsUrl} target="_blank" rel="noreferrer" onClick={() => track('maps_open', { id: place.id })}
                    className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-[13px] text-ink hover:bg-white/[0.1]">
                    <MapPin size={14} className="text-accent" />Abrir no Google Maps
                  </a>
                )}
                <p className="mt-1 text-[11px] text-faint">Lugar sugerido pela comunidade. Nota, endereço e horário: <span className="text-mute">Google Maps</span>. Estilo e preço são estimados.</p>
              </>
            )}
          </div>

          <h2 className="mb-3 mt-9 text-[13px] uppercase tracking-[0.14em] text-mute">Quem foi</h2>
          <div className="grid gap-2.5">
            {!data && <Skeleton className="h-24" />}
            {data?.myReviews.map((r) => (
              <div key={r.id} className="rounded-[20px] border border-accent/30 bg-accent/[0.05] p-4">
                <p className="text-xs text-accent">Você · {r.verdict ? VERDICT_LABEL[r.verdict] : 'não foi'} · {timeAgo(r.createdAt)}</p>
                {r.note && <p className="mt-1.5 text-[14px]">{r.note}</p>}
              </div>
            ))}
            {data?.reviews.map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5, ease }} className="rounded-[20px] bg-surface p-4">
                <div className="flex items-center gap-2">
                  <Avatar name={r.user.name} hue={r.user.hue} size={24} />
                  <span className="text-[13px]">{r.user.handle}</span>
                  <span className="ml-auto text-xs text-mute">{VERDICT_LABEL[r.verdict]} · {timeAgo(r.createdAt)}</span>
                </div>
                <p className="mt-2 text-[14px] text-ink/85">{r.note}</p>
              </motion.div>
            ))}
          </div>
        </div>

      {isEvent && <PromoteSheet open={promote} onClose={() => setPromote(false)} place={place} onStory={(link, by) => { setPromote(false); setStory({ link, by }) }} />}
      {isEvent && <StorySheet open={!!story} onClose={() => setStory(null)} card={storyCard} link={story?.link ?? ''} context="promote" />}
      <LeadSheet open={lead} onClose={() => setLead(false)} place={place} defaultName={me?.name} onDone={() => toast('Pedido enviado! A casa responde em até 2h (simulado)')} />
    </Page>
  )
}

/** "Fake door" de reserva: mede intenção real e gera o lead que a casa pagaria para receber. */
function LeadSheet({ open, onClose, place, defaultName, onDone }: { open: boolean; onClose: () => void; place: Place; defaultName?: string; onDone: () => void }) {
  const create = useCreateLead()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000)
    return { key: d.toISOString().slice(0, 10), label: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : `${DAY_SHORT[d.getDay()]} ${d.getDate()}`, dow: d.getDay() }
  }).filter((d) => isOpenAt(place.periods, d.dow, Math.max(...place.periods.map((p) => p.open))))
  const [day, setDay] = useState<string>()
  const [time, setTime] = useState('20h')
  const [people, setPeople] = useState(place.privateSpace ? 10 : 2)
  const [name, setName] = useState(defaultName ?? '')
  useEffect(() => { if (defaultName && !name) setName(defaultName) }, [defaultName]) // eslint-disable-line react-hooks/exhaustive-deps
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const sel = day ?? days[0]?.key
  const times = place.kind === 'evento' ? [place.when?.split(', ')[1] ?? '20h'] : place.periods[0].open >= 18 ? ['19h', '20h', '21h', '22h'] : ['12h', '13h', '19h', '20h']

  async function submit() {
    if (!sel || !name.trim()) return
    await create.mutateAsync({ placeId: place.id, day: sel, time, people, name: name.trim(), contact: contact.trim(), note: note.trim() })
    track('lead_submitted', { placeId: place.id, people, hasContact: !!contact.trim() })
    onClose(); onDone()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-none">{place.kind === 'evento' ? 'Garantir lugar' : 'Pedir reserva'}</p>
      <p className="mt-2 text-sm text-mute">{place.name} recebe o pedido e confirma com você. Nada é cobrado agora.</p>
      <p className="mb-2 mt-5 text-[12px] uppercase tracking-[0.14em] text-mute">Dia</p>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {days.length ? days.map((d) => <Chip key={d.key} active={sel === d.key} onClick={() => setDay(d.key)}>{d.label}</Chip>) : <span className="text-sm text-faint">Sem datas abertas nesta semana</span>}
      </div>
      <p className="mb-2 mt-4 text-[12px] uppercase tracking-[0.14em] text-mute">Horário</p>
      <div className="flex flex-wrap gap-2">{times.map((t) => <Chip key={t} active={time === t} onClick={() => setTime(t)}>{t}</Chip>)}</div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-[12px] uppercase tracking-[0.14em] text-mute">Pessoas</p>
        <div className="flex items-center gap-3">
          <button aria-label="Menos" onClick={() => setPeople((n) => Math.max(1, n - 1))} className="grid size-9 place-items-center rounded-full bg-white/[0.07]"><Minus size={14} /></button>
          <span className="w-8 text-center font-serif text-2xl">{people}</span>
          <button aria-label="Mais" onClick={() => setPeople((n) => Math.min(place.capacity, n + 1))} className="grid size-9 place-items-center rounded-full bg-white/[0.07]"><Plus size={14} /></button>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" aria-label="Seu nome" className="h-12 rounded-[16px] border border-line bg-bg px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent/50" />
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="WhatsApp (opcional)" aria-label="WhatsApp" inputMode="tel" className="h-12 rounded-[16px] border border-line bg-bg px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent/50" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (ex.: aniversário, bolo)" aria-label="Observação" className="h-12 rounded-[16px] border border-line bg-bg px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent/50" />
      </div>
      <Button size="lg" className="mt-4 w-full" disabled={!sel || !name.trim() || create.isPending} onClick={submit}>
        {create.isPending ? 'Enviando…' : 'Enviar pedido de reserva'}
      </Button>
      <p className="mt-2 text-center text-[11px] text-faint">Versão de teste: ainda não reservamos de verdade. Seu pedido ajuda a medir o interesse.</p>
    </Sheet>
  )
}
