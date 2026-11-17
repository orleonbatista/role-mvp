import { motion } from 'motion/react'
import { Link, useNavigate } from 'react-router'
import { ArrowUpRight, CalendarDays, MessageCircle, Sparkles, Users } from 'lucide-react'
import { Avatar, Cover, Page, SectionTitle, Skeleton, Tag } from '../ui/primitives'
import { ease, item, list } from '../ui/motion'
import { useEvents, useFeed, useForYou, useProfile } from '../lib/api'
import { KIND_LABEL, OCCASIONS, occasionLabel, priceLabel, timeAgo } from '../lib/labels'
import { distanceKm, fmtKm, openStatus } from '../lib/hours'
import { placeIcon } from '../ui/placeIcon'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'boa madrugada' : h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite'
}

export function Home() {
  const nav = useNavigate()
  const { data: me } = useProfile()
  const forYou = useForYou()
  const events = useEvents()
  const feed = useFeed()

  return (
    <Page tabbed>
      <header className="px-5 pt-14">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-mute">
          {greeting()}, {me?.name.split(' ')[0]}
        </motion.p>
        <h1 className="mt-1 font-serif text-[40px] leading-[0.95] tracking-tight">
          Pra onde<br /><em className="text-accent">hoje?</em>
        </h1>
      </header>

      {/* composer: elemento compartilhado com /novo */}
      <div className="px-5 pt-6">
        <motion.button
          layoutId="composer"
          transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          onClick={() => nav('/novo')}
          className="flex w-full items-center gap-3 rounded-[24px] border border-line bg-surface px-4 py-4 text-left"
        >
          <span className="grid size-9 place-items-center rounded-full bg-accent/15 text-accent"><Sparkles size={16} /></span>
          <span className="flex-1 text-[15px] text-mute">Descreve o rolê que você quer…</span>
        </motion.button>
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {OCCASIONS.map((o, i) => (
            <motion.button
              key={o.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0, transition: { delay: 0.15 + i * 0.04, duration: 0.5, ease } }}
              whileTap={{ scale: 0.94 }}
              onClick={() => nav(`/novo?o=${o.id}`)}
              className="h-9 shrink-0 rounded-full bg-white/[0.05] px-3.5 text-[13px] text-ink/80 hover:bg-white/[0.08]"
            >
              {o.label}
            </motion.button>
          ))}
        </div>
      </div>

      <section className="mt-9">
        <SectionTitle>Pra você</SectionTitle>
        <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
          {forYou.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-[260px] w-[220px] shrink-0 rounded-[28px]" />)}
          {forYou.data?.map((r, i) => (
            <motion.div
              key={r.place.id}
              initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { delay: i * 0.06, duration: 0.6, ease } }}
              className="snap-start"
            >
              <Link to={`/lugar/${r.place.id}`} className="group block w-[220px] shrink-0">
                <div className="relative">
                  <Cover hue={r.place.hue} icon={placeIcon(r.place)} iconSize={72} layoutId={`cover-${r.place.id}`} className="h-[260px] w-full transition-transform duration-500 group-active:scale-[0.98]" />
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    <Tag tone="accent">{r.match}% seu gosto</Tag>
                    {openStatus(r.place).open && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-black/40 px-2.5 text-[11px] text-white/90 backdrop-blur-md"><span className="size-1.5 rounded-full bg-accent" />aberto</span>}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 rounded-b-[28px] bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-12">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">{KIND_LABEL[r.place.kind]} · {r.place.hood}</p>
                    <p className="mt-1 font-serif text-[26px] leading-none">{r.place.name}</p>
                  </div>
                </div>
                <p className="mt-2.5 line-clamp-2 px-1 text-[13px] leading-snug text-mute">{r.place.tagline}</p>
                <p className="mt-1 px-1 text-[11px] text-faint">{priceLabel(r.place.price)}{me?.hood ? ` · ${fmtKm(distanceKm(me.hood, r.place.hood))}` : ''}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <SectionTitle aside={<Link to="/divulgar" className="text-xs text-faint transition-colors hover:text-accent">+ divulgar evento</Link>}>Essa semana</SectionTitle>
        <motion.div variants={list} initial="initial" animate="animate" className="grid gap-2 px-5">
          {events.data?.map((e) => (
            <motion.div key={e.id} variants={item}>
              <Link to={`/lugar/${e.id}`} className="flex items-center gap-3 rounded-[20px] bg-surface p-2.5 pr-4 transition-colors hover:bg-surface-2">
                <Cover hue={e.hue} icon={placeIcon(e)} iconSize={22} className="size-14 shrink-0" rounded="rounded-[14px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{e.name}</p>
                  <p className="truncate text-xs text-mute">{e.hood} · {priceLabel(e.price)}{me?.hood ? ` · ${fmtKm(distanceKm(me.hood, e.hood))}` : ''}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-ink/80"><CalendarDays size={11} />{e.when}</span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mt-9">
        <SectionTitle aside={<span className="text-xs text-faint">ao vivo</span>}>A comunidade pede</SectionTitle>
        <motion.div variants={list} initial="initial" animate="animate" className="grid gap-3 px-5">
          {feed.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
          {feed.data?.map(({ request, author, answers, votes, topPlace }) => (
            <motion.div key={request.id} variants={item} layout>
              <Link to={`/pedido/${request.id}`} className="block rounded-[24px] border border-line bg-surface/60 p-4 transition-colors hover:bg-surface">
                <div className="flex items-center gap-2.5">
                  <Avatar name={author.name} hue={author.hue} size={28} />
                  <span className="text-[13px] text-ink/90">{author.id === 'me' ? 'Você' : author.handle}</span>
                  <span className="text-xs text-faint">· {timeAgo(request.createdAt)}</span>
                  {request.status === 'decidido' && <span className="ml-auto"><Tag tone="accent">decidido</Tag></span>}
                </div>
                <p className="mt-3 text-[15px] leading-snug text-balance">“{request.text}”</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {request.criteria.occasion && <Tag>{occasionLabel(request.criteria.occasion)}</Tag>}
                  {request.criteria.groupSize > 2 && <Tag>{request.criteria.groupSize} pessoas</Tag>}
                  {request.criteria.hood && <Tag>{request.criteria.hood}</Tag>}
                </div>
                <div className="mt-3.5 flex items-center gap-4 border-t border-line pt-3 text-xs text-mute">
                  <span className="flex items-center gap-1.5"><MessageCircle size={13} />{answers}</span>
                  <span className="flex items-center gap-1.5"><Users size={13} />{votes} votos</span>
                  {topPlace && <span className="ml-auto flex items-center gap-1 truncate text-ink/80">top: {topPlace.name}<ArrowUpRight size={12} /></span>}
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </Page>
  )
}
