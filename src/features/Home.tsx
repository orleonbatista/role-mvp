import { limits as googleLimits } from '../lib/gdiscover'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowUpRight, CalendarDays, MessageCircle, Sparkles, Users } from 'lucide-react'
import { InvitesList } from './Invites'
import { Avatar, Cover, Page, SectionTitle, Skeleton, Tag } from '../ui/primitives'
import { ease, item, list } from '../ui/motion'
import { useEvents, useFeed, useForYou, useProfile } from '../lib/api'
import { KIND_LABEL, fitLabel, OCCASIONS, occasionLabel, priceLabel, timeAgo } from '../lib/labels'
import { distanceKm, fmtKm, kmTo, openStatus } from '../lib/hours'
import { placeIcon } from '../ui/placeIcon'
import { places } from '../mocks/seeds/places'
import { TurmasStrip } from './Turmas'
import { PlacePhoto } from '../ui/PlacePhoto'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'boa madrugada' : h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite'
}

export function Home() {
  const nav = useNavigate()
  const { data: me } = useProfile()
  const waiting = me ? places.filter((p) => p.curation === 'base' && (kmTo(me, p) ?? 99) <= 5).length : 0
  const forYou = useForYou()
  const events = useEvents()
  const feed = useFeed()
  const [allReqs, setAllReqs] = useState(false)
  // pedidos repetidos (mesmo texto) viram um card só, com a contagem; a lista mostra 4 e abre o resto sob demanda
  const reqGroups = (() => {
    const m = new Map<string, { item: NonNullable<typeof feed.data>[number]; n: number }>()
    for (const it of feed.data ?? []) {
      const k = it.request.text.trim().toLowerCase()
      const g = m.get(k)
      if (g) g.n++
      else m.set(k, { item: it, n: 1 })
    }
    return [...m.values()]
  })()

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
        <Link to="/buscar" className="mt-2 inline-flex min-h-9 items-center gap-1.5 px-1 text-[13px] text-mute hover:text-ink">Só quer uma lista rápida, sem votação? <span className="text-accent">Busca rápida →</span></Link>
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
        <SectionTitle aside={<span className="text-xs text-faint">seu gosto · até 5 km</span>}>Pra você</SectionTitle>
        {forYou.isLoading && <p className="mb-3 px-5 text-[12px] text-faint">Buscando lugares abertos perto de você que combinam com seu gosto…</p>}
        {!forYou.isLoading && googleLimits.basic && <p className="mb-3 px-5 text-[12px] text-amber-300/90">Este celular chegou ao limite de buscas de hoje no Google. Mostrando o que já conhecemos; amanhã volta ao normal.</p>}
        {forYou.data?.length === 0 && (
          <Link to="/fundador" className="mx-5 block rounded-[24px] border border-dashed border-accent/40 bg-accent/[0.05] p-5">
            <p className="font-serif text-[26px] leading-none">O rolê está começando<span className="text-accent">.</span></p>
            <p className="mt-2 text-[14px] text-ink/80">Aqui só entra lugar que alguém da comunidade conhece e indicou. Seja um dos primeiros curadores: indique 3 lugares que você ama{me?.hood ? ` perto de ${me.hood}` : ''}.</p>
            {waiting > 0 && <p className="mt-2 text-[13px] text-mute">{waiting} lugares reais perto de você esperando curadoria.</p>}
            <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent">Virar curador fundador →</span>
          </Link>
        )}
        {forYou.data?.some((r) => r.place.curation === 'base') && (
          <p className="mb-3 px-5 text-[12px] text-faint">Lugares reais perto de você que combinam com seu gosto. Os marcados “sem curadoria” ninguém da comunidade avaliou ainda — <Link to="/fundador" className="text-accent">conhece algum? indique</Link>.</p>
        )}
        <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
          {forYou.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[260px] w-[220px] shrink-0 rounded-[28px]" />)}
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
                  <PlacePhoto place={r.place} enabled={i < 3} carousel={false} />
                  <div className="absolute inset-x-3 top-3 flex flex-wrap gap-1.5">
                    <Tag tone="accent">{fitLabel(r.match)}</Tag>
                    {r.place.curation === 'base' && <span className="inline-flex h-6 items-center rounded-full bg-black/45 px-2.5 text-[11px] text-white/85 backdrop-blur-md">sem curadoria</span>}
                    {openStatus(r.place).open && !r.place.source && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-black/40 px-2.5 text-[11px] text-white/90 backdrop-blur-md"><span className="size-1.5 rounded-full bg-accent" />aberto</span>}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 rounded-b-[28px] bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-12">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">{KIND_LABEL[r.place.kind]} · {r.place.hood}</p>
                    <p className="mt-1 font-serif text-[26px] leading-none">{r.place.name}</p>
                  </div>
                </div>
                <p className="mt-2.5 line-clamp-2 px-1 text-[13px] leading-snug text-mute">{r.place.tagline}</p>
                <p className="mt-1 px-1 text-[11px] text-faint">{priceLabel(r.place.price)}{me ? ` · ${fmtKm(kmTo(me, r.place))}` : ''}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <SectionTitle aside={<Link to="/divulgar" className="text-xs text-faint transition-colors hover:text-accent">+ divulgar evento</Link>}>Essa semana</SectionTitle>
        <motion.div variants={list} initial="initial" animate="animate" className="grid gap-2 px-5">
          {events.data?.length === 0 && (
            <p className="rounded-[20px] border border-dashed border-line px-4 py-4 text-center text-[13px] text-faint">
              Nenhum evento divulgado ainda. É artista, produtor ou casa? <Link to="/divulgar" className="text-accent">Divulgue o seu</Link>.
            </p>
          )}
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

      <InvitesList />

      <section className="mt-9">
        <div className="mb-5"><TurmasStrip /></div>
        <SectionTitle aside={me?.demoMode ? <span className="text-xs text-faint">demo</span> : undefined}>{me?.demoMode ? "A comunidade pede" : "Seus pedidos"}</SectionTitle>
        <motion.div variants={list} initial="initial" animate="animate" className="grid gap-3 px-5">
          {feed.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
          {feed.data?.length === 0 && <p className="rounded-[20px] border border-dashed border-line px-4 py-4 text-center text-[13px] text-faint">Seus pedidos e as votações que você abrir aparecem aqui.</p>}
          {(allReqs ? reqGroups : reqGroups.slice(0, 4)).map(({ item: { request, author, answers, votes, topPlace }, n: reps }) => (
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
                  {reps > 1 && <Tag>pedido {reps}×</Tag>}
                </div>
                {(answers > 0 || votes > 0 || topPlace) && (
                  <div className="mt-3.5 flex items-center gap-4 border-t border-line pt-3 text-xs text-mute">
                    {answers > 0 && <span className="flex items-center gap-1.5"><MessageCircle size={13} />{answers}</span>}
                    {votes > 0 && <span className="flex items-center gap-1.5"><Users size={13} />{votes} {votes === 1 ? 'voto' : 'votos'}</span>}
                    {topPlace && <span className="ml-auto flex items-center gap-1 truncate text-ink/80">top: {topPlace.name}<ArrowUpRight size={12} /></span>}
                  </div>
                )}
              </Link>
            </motion.div>
          ))}
          {!allReqs && reqGroups.length > 4 && (
            <button onClick={() => setAllReqs(true)} className="rounded-full py-2.5 text-[13px] text-mute hover:text-ink">Ver mais {reqGroups.length - 4} pedidos</button>
          )}
        </motion.div>
      </section>
    </Page>
  )
}
