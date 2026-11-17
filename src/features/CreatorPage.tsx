import { motion } from 'motion/react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { CalendarDays, Megaphone } from 'lucide-react'
import { Avatar, Button, Cover, Page, Skeleton } from '../ui/primitives'
import { placeIcon } from '../ui/placeIcon'
import { ease, item, list } from '../ui/motion'
import { useEvents } from '../lib/api'
import { priceLabel } from '../lib/labels'
import { track } from '../lib/track'

/** "Linktree" do divulgador: link fixo da bio com os eventos que ele indica; cada um vira votação de grupo. */
export function CreatorPage() {
  const { handle = '' } = useParams()
  const at = `@${handle}`
  const events = useEvents()
  const mine = events.data?.filter((e) => e.promoter?.toLowerCase() === at.toLowerCase()) ?? []
  const others = events.data?.filter((e) => !mine.includes(e)).slice(0, 3) ?? []
  useEffect(() => { track('creator_page_viewed', { handle: at }) }, [at])
  const hue = [...handle].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360

  const Row = ({ e, i }: { e: NonNullable<typeof events.data>[number]; i: number }) => (
    <motion.div variants={item}>
      <Link to={`/e/${e.id}?src=cr_${handle}`} className="flex items-center gap-3 rounded-[22px] bg-surface p-3 pr-4 transition-colors hover:bg-surface-2">
        <Cover hue={e.hue} icon={placeIcon(e)} iconSize={24} className="size-16 shrink-0" rounded="rounded-[16px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[22px] leading-tight">{e.name}</p>
          <p className="truncate text-xs text-mute">{e.hood} · {priceLabel(e.price)}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent"><CalendarDays size={11} />{e.when}</p>
        </div>
        <span className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink">{i === 0 ? 'Bora?' : 'Ver'}</span>
      </Link>
    </motion.div>
  )

  return (
    <Page>
      <div className="flex flex-col items-center px-5 pt-16 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
          <Avatar name={handle} hue={hue} size={84} />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.1, duration: 0.6, ease }}
          className="mt-4 font-serif text-[40px] leading-none">{at}</motion.h1>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-mute"><Megaphone size={13} className="text-accent" /><span>indica no rolê<span className="text-accent">.</span></span></p>
        <p className="mt-3 max-w-[300px] text-[13px] text-faint">Escolha um evento, mande a votação pro seu grupo e decidam juntos em 10 segundos.</p>
      </div>
      <div className="mt-8 px-5">
        {events.isLoading && <div className="grid gap-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
        {mine.length > 0 && (
          <motion.div variants={list} initial="initial" animate="animate" className="grid gap-2.5">{mine.map((e, i) => <Row key={e.id} e={e} i={i} />)}</motion.div>
        )}
        {events.data && !mine.length && (
          <>
            <p className="rounded-[18px] border border-dashed border-line px-4 py-4 text-center text-[13px] text-mute">{at} não tem evento no ar agora. Enquanto isso, essa semana tem:</p>
            <motion.div variants={list} initial="initial" animate="animate" className="mt-3 grid gap-2.5">{others.map((e, i) => <Row key={e.id} e={e} i={i + 1} />)}</motion.div>
          </>
        )}
        <div className="mt-8 grid gap-2 pb-8">
          <Link to="/divulgar"><Button variant="soft" className="w-full">Também tenho um evento</Button></Link>
          <Link to="/" className="py-2 text-center text-[12px] text-faint hover:text-ink">o que é o rolê.?</Link>
        </div>
      </div>
    </Page>
  )
}
