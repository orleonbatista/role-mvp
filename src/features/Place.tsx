import { motion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarCheck, ChevronLeft, Clock, MapPin, Star, Users } from 'lucide-react'
import { Avatar, Button, Cover, Page, Skeleton, Tag } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { ease, item, list } from '../ui/motion'
import { usePlace } from '../lib/api'
import { placeById } from '../mocks/seeds/places'
import { KIND_LABEL, VERDICT_LABEL, nicheLabel, occasionLabel, priceLabel, timeAgo, vibeLabel } from '../lib/labels'

export function PlacePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { data } = usePlace(id)
  // usa o seed já carregado para a capa aparecer no mesmo frame (transição compartilhada sem "pulo")
  const place = data?.place ?? placeById.get(id)
  const scroller = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scroller })
  const coverScale = useTransform(scrollY, [-100, 0, 300], [1.15, 1, 1.05])
  const coverY = useTransform(scrollY, [0, 300], [0, 90])
  const titleOpacity = useTransform(scrollY, [140, 220], [0, 1])

  if (!place) return <Page><Skeleton className="m-5 h-80" /></Page>

  return (
    <Page className="!overflow-hidden">
      <div ref={scroller} className="no-scrollbar absolute inset-0 overflow-y-auto pb-32">
        <motion.div style={{ scale: coverScale, y: coverY }} className="relative h-[380px] origin-top">
          <Cover hue={place.hue} layoutId={`cover-${place.id}`} className="h-full w-full" rounded="rounded-none" label={place.name[0]} />
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

          <motion.div variants={list} initial="initial" animate="animate" className="mt-6 grid grid-cols-3 gap-2">
            {[
              { k: 'nota', v: place.rating.toFixed(1), icon: <Star size={13} className="fill-accent text-accent" />, sub: `${place.ratingCount} avaliações` },
              { k: 'por pessoa', v: place.price === 0 ? 'Grátis' : `R$ ${place.price}`, icon: null, sub: 'média' },
              { k: 'grupo', v: `${place.capacity}`, icon: <Users size={13} />, sub: 'pessoas' },
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
          </div>

          <h2 className="mb-3 mt-8 text-[13px] uppercase tracking-[0.14em] text-mute">Por que ir</h2>
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

          <div className="mt-8 grid gap-2 text-sm text-ink/80">
            <p className="flex items-center gap-2"><MapPin size={14} className="text-mute" />{place.address}</p>
            <p className="flex items-center gap-2"><Clock size={14} className="text-mute" />{place.hours}</p>
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
      </div>

      {/* barra superior que ganha título ao rolar */}
      <div className="absolute inset-x-0 top-0 z-20 flex h-24 items-end gap-3 px-4 pb-3">
        <motion.div style={{ opacity: titleOpacity }} className="absolute inset-0 border-b border-line bg-bg/80 backdrop-blur-xl" />
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => nav(-1)} className="relative grid size-10 place-items-center rounded-full bg-black/40 backdrop-blur-md" aria-label="Voltar">
          <ChevronLeft size={18} />
        </motion.button>
        <motion.p style={{ opacity: titleOpacity }} className="relative pb-2 font-serif text-xl">{place.name}</motion.p>
      </div>

      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 30 }} className="bottom-bar absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pb-7 pt-10">
        <Button size="lg" className="w-full" icon={<CalendarCheck size={16} />} onClick={() => toast(`Reserva simulada no ${place.name}`)}>
          {place.kind === 'evento' ? `Garantir ingresso · ${priceLabel(place.price)}` : 'Reservar mesa'}
        </Button>
      </motion.div>
    </Page>
  )
}
