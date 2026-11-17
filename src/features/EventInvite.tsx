import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MapPin, Megaphone, Users, Vote } from 'lucide-react'
import { Button, Cover, EmptyState, Page, Skeleton } from '../ui/primitives'
import { placeIcon } from '../ui/placeIcon'
import { ease, item, list } from '../ui/motion'
import { groupFromEvent, usePlace, useProfile } from '../lib/api'
import { placeById } from '../mocks/seeds/places'
import { isPast } from '../mocks/extraEvents'
import { priceLabel } from '../lib/labels'
import { track } from '../lib/track'

export const NEXT_KEY = 'role.next'

/** Destino do link de divulgação: o evento + "bora? monta a votação com teu grupo". */
export function EventInvite() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data, isError } = usePlace(id)
  const { data: me } = useProfile()
  const [busy, setBusy] = useState(false)
  const place = data?.place ?? placeById.get(id)
  const src = new URLSearchParams(location.search).get('src') ?? ''
  const by = src.startsWith('cr_') ? `@${src.slice(3)}` : place?.promoter
  useEffect(() => { track('event_invite_viewed', { id, by }) }, [id, by])

  if (!place && isError) return <Page><EmptyState title="Evento não encontrado" text="O link pode estar quebrado, ou o evento ainda não foi publicado." action={<Button onClick={() => nav('/')}>Ver o que tem essa semana</Button>} /></Page>
  if (!place) return <Page><Skeleton className="m-5 h-96" /></Page>
  const past = place.eventDate ? isPast({ date: place.eventDate }) : false

  async function go() {
    if (!place) return
    setBusy(true)
    const { id: rid } = await groupFromEvent(place.id)
    track('event_group_created', { id: place.id, by })
    qc.invalidateQueries({ queryKey: ['feed'] })
    if (me?.onboarded) nav(`/pedido/${rid}`)
    else { try { localStorage.setItem(NEXT_KEY, `/pedido/${rid}`) } catch { /* */ } nav('/onboarding') }
  }

  const footer = past
    ? <Button size="lg" className="w-full" onClick={() => nav('/')}>Ver outros rolês</Button>
    : <Button size="lg" className="w-full" icon={<Vote size={17} />} disabled={busy} onClick={go}>{busy ? 'Montando…' : 'Bora? Chama teu grupo'}</Button>

  return (
    <Page footer={footer}>
      <div className="relative h-[340px]">
        <Cover hue={place.hue} icon={placeIcon(place)} iconSize={110} className="h-full w-full" rounded="rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
        <p className="absolute left-5 top-[max(env(safe-area-inset-top),20px)] font-serif text-2xl italic sm:top-12">rolê<span className="text-accent">.</span></p>
      </div>
      <div className="relative -mt-24 px-5">
        {by && (
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">
            <Megaphone size={12} />{by} indica
          </motion.p>
        )}
        <motion.h1 initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.1, duration: 0.7, ease }}
          className="mt-3 font-serif text-[52px] leading-[0.9] tracking-tight">{place.name}</motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-3 text-[15px] text-ink/80">{place.tagline}</motion.p>

        <motion.div variants={list} initial="initial" animate="animate" className="mt-5 grid grid-cols-3 gap-2">
          {[
            { k: 'quando', v: place.when?.split(', ')[1] ?? '—', sub: place.when?.split(', ')[0] ?? '', icon: <CalendarDays size={13} /> },
            { k: 'onde', v: place.hood, sub: 'São Paulo', icon: <MapPin size={13} /> },
            { k: 'por pessoa', v: priceLabel(place.price).replace('~', ''), sub: `até ${place.capacity}`, icon: <Users size={13} /> },
          ].map((s) => (
            <motion.div key={s.k} variants={item} className="rounded-[20px] bg-surface p-3">
              <p className="flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-mute">{s.icon}{s.k}</p>
              <p className={`mt-1 truncate font-serif leading-none ${s.v.length > 8 ? 'text-lg' : 'text-2xl'}`}>{s.v}</p>
              <p className="mt-1 truncate text-[11px] text-faint">{s.sub}</p>
            </motion.div>
          ))}
        </motion.div>

        {past && <p className="mt-5 rounded-[16px] border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">Esse evento já passou. Dá uma olhada no que tem essa semana.</p>}

        <ul className="mt-6 grid gap-2">
          {place.highlights.map((h, i) => (
            <motion.li key={h} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.08, duration: 0.5, ease }}
              className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3 text-[14px]">
              <span className="font-serif text-xl italic text-accent">{i + 1}</span>{h}
            </motion.li>
          ))}
        </ul>

        {!past && (
          <div className="mt-6 rounded-[20px] bg-surface p-4 text-[13px] leading-relaxed text-ink/80">
            <p className="font-medium text-ink">Como funciona</p>
            Você manda a votação pro grupo com esse evento e mais 2 opções parecidas. Cada um vota em 10 segundos, sem instalar nada, e o rolê fecha sem 200 mensagens no zap.
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 pb-4 text-[13px]">
          <Link to={`/lugar/${place.id}`} className="text-mute underline-offset-4 hover:text-ink hover:underline">Mais detalhes</Link>
          <Link to="/divulgar" className="text-mute underline-offset-4 hover:text-ink hover:underline">É artista ou produtor? Divulga teu evento</Link>
        </div>
      </div>
    </Page>
  )
}
