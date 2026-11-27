import { SaveToList } from './Social'
import { PlacePhoto } from '../ui/PlacePhoto'
import { motion, useScroll, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { StoryCard } from '../lib/storyCard'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { GoogleLive } from './GoogleLive'
import { ReportButton } from './Report'
import { VenueSection } from './Venue'
import { useQuery } from '@tanstack/react-query'
import { placeReviews } from '../mocks/remote'
import { ChevronLeft, Clock, MapPin, Megaphone, MessageCircle, Phone, Share2, Star, Ticket, Users } from 'lucide-react'
import { Link } from 'react-router'
import { PromoteSheet } from './PromoteSheet'
import { StorySheet } from './StorySheet'
import { Avatar, Button, Cover, EmptyState, Page, Skeleton, Tag, cx } from '../ui/primitives'
import { placeIcon } from '../ui/placeIcon'
import { fmtKm, kmTo, openStatus } from '../lib/hours'
import { liveInfo } from '../lib/gplaceLive'
import { track } from '../lib/track'
import { useProfile } from '../lib/api'
import type { Place } from '../lib/types'
import { ease, item, list } from '../ui/motion'
import { usePlace } from '../lib/api'
import { placeById } from '../mocks/seeds/places'
import { KIND_LABEL, VERDICT_LABEL, nicheLabel, occasionLabel, priceLabel, timeAgo, vibeLabel } from '../lib/labels'

export function PlacePage() {
  const { id = '' } = useParams()
  const [sp] = useSearchParams()
  const groupN = Number(sp.get('n')) || undefined
  const community = useQuery({ queryKey: ['place-reviews', id], queryFn: () => placeReviews(id), staleTime: 30_000 })
  const cr = community.data
  const nav = useNavigate()
  const { data, isError } = usePlace(id)
  const { data: me } = useProfile()
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
  const google = !!place.source // lugar real (Google/OSM): horário e capacidade não são nossos
  const base = place.curation === 'base'
  const noHours = google
  const km = kmTo(me, place)

  const isEvent = place.kind === 'evento'
  const footer = place.ticketUrl
    ? <a href={place.ticketUrl} target="_blank" rel="noreferrer" onClick={() => track('ticket_click', { id: place.id })}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-ink shadow-[0_8px_30px_-8px_rgba(198,255,61,0.55)] active:scale-[0.98]">
        <Ticket size={16} />Ingresso · {priceLabel(place.price)}
      </a>
    : <ContactCasa place={place} group={groupN} />
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
          <PlacePhoto place={place} enabled rounded="rounded-none" w={800} credit="top" className="top-16" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
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
              cr && cr.count > 0 && cr.score !== null
                ? { k: 'nota', v: cr.score.toFixed(1), icon: <Star size={13} className="fill-accent text-accent" />, sub: `${cr.count} da comunidade` }
                : place.source
                ? { k: 'nota', v: 'novo', icon: null, sub: 'ninguém avaliou' }
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

          {google && <GoogleLive place={place} group={sp.get('grupo') === '1'} />}

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
            {google && (
              <>
                {place.mapsUrl && (
                  <a href={place.mapsUrl} target="_blank" rel="noreferrer" onClick={() => track('maps_open', { id: place.id })}
                    className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-[13px] text-ink hover:bg-white/[0.1]">
                    <MapPin size={14} className="text-accent" />Abrir no Google Maps
                  </a>
                )}
                {base ? (
                  <div className="mt-3 rounded-[18px] border border-dashed border-accent/40 bg-accent/[0.04] p-3">
                    <p className="text-[13px] text-ink/90">Ainda <b className="font-medium">sem curadoria</b>: é um lugar real, mas ninguém da comunidade indicou. Estilo e preço são estimados.</p>
                    <Link to={`/indicar?id=${encodeURIComponent(place.id)}`} className="mt-2 inline-flex text-[13px] font-medium text-accent">Conhece? Indicar pro rolê →</Link>
                    <p className="mt-2 text-[11px] text-faint">Dados de lugares: Google Maps</p>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-faint">Lugar do catálogo da comunidade: nome, estilo e faixa de preço vêm de quem sugeriu. Nota, endereço completo e horário: <span className="text-mute">Google Maps</span>.</p>
                )}
              </>
            )}
          </div>

          <div className="mt-6"><SaveToList place={place} /></div>
          {place.kind !== 'evento' && <VenueSection place={place} />}

          <h2 className="mb-3 mt-9 text-[13px] uppercase tracking-[0.14em] text-mute">Quem foi</h2>
          <div className="grid gap-2.5">
            {!data && <Skeleton className="h-24" />}
            {data?.myReviews.map((r) => (
              <div key={r.id} className="rounded-[20px] border border-accent/30 bg-accent/[0.05] p-4">
                <p className="text-xs text-accent">Você · {r.verdict ? VERDICT_LABEL[r.verdict] : 'não foi'} · {timeAgo(r.createdAt)}</p>
                {r.note && <p className="mt-1.5 text-[14px]">{r.note}</p>}
              </div>
            ))}
            {cr?.items.filter((r) => !r.mine).map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5, ease }} className="rounded-[20px] bg-surface p-4">
                <div className="flex items-center gap-2">
                  <Link to={`/u/${r.pid}`} className="flex items-center gap-2"><Avatar name={r.name} hue={r.hue ?? 200} size={24} />
                  <span className="text-[13px]">{r.name}</span></Link>
                  <span className="ml-auto text-xs text-mute">{VERDICT_LABEL[r.verdict]} · {timeAgo(r.at)}</span>
                  {r.note && <ReportButton kind="review" id={r.id} />}
                </div>
                {r.note && <p className="mt-2 text-[14px] text-ink/85">{r.note}</p>}
              </motion.div>
            ))}
            {data && !data.myReviews.length && !data.reviews.length && !cr?.items.length && (
              <p className="rounded-[20px] border border-dashed border-line px-4 py-4 text-center text-[13px] text-faint">Ninguém avaliou ainda. Foi lá? Conta como foi depois do rolê.</p>
            )}
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
    </Page>
  )
}


/** contato direto com a casa (sem reserva simulada): WhatsApp com mensagem pronta quando o número é celular,
 *  senão ligação; sem telefone, rota no Maps. Telefone vem ao vivo do Google (não é guardado). */
function ContactCasa({ place, group }: { place: Place; group?: number }) {
  const q = useQuery({ queryKey: ['glive', place.id, false], queryFn: () => liveInfo(place), enabled: !!place.source, staleTime: Infinity, gcTime: 30 * 60_000, retry: false })
  const phone = q.data?.ok ? q.data.info.phone : undefined
  const digits = phone?.replace(/\D/g, '') ?? ''
  const mobile = digits.length === 11 && digits[2] === '9'
  const msg = `Oi! Achei vocês pelo rolê. Vocês reservam mesa${group ? ` pra ${group} pessoas` : ' pra grupo'}? Qual horário tem disponível?`
  const cls = 'inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-ink shadow-[0_8px_30px_-8px_rgba(198,255,61,0.55)] active:scale-[0.98]'
  if (mobile) return (
    <a href={`https://wa.me/55${digits}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className={cls}
      onClick={() => track('contact_casa', { id: place.id, via: 'whatsapp' })}><MessageCircle size={16} />Chamar a casa no WhatsApp</a>
  )
  if (digits) return (
    <a href={`tel:+55${digits}`} className={cls} onClick={() => track('contact_casa', { id: place.id, via: 'tel' })}><Phone size={16} />Ligar pra casa · {phone}</a>
  )
  const gid = place.id.startsWith('g-') ? place.id.slice(2) : ''
  const maps = gid ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${encodeURIComponent(gid)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address || place.hood}`)}`
  return (
    <a href={maps} target="_blank" rel="noreferrer" className={cls} onClick={() => track('contact_casa', { id: place.id, via: 'maps' })}><MapPin size={16} />Como chegar</a>
  )
}
