import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AlertTriangle, Clock, Phone, Star } from 'lucide-react'
import type { Place } from '../lib/types'
import { embedUrl, fmtCount, liveInfo, mapsEmbedOn } from '../lib/gplaceLive'
import { track } from '../lib/track'
import { Skeleton, cx } from '../ui/primitives'
import { ease } from '../ui/motion'

/** Bloco "ao vivo do Google" na ficha: foto (com crédito), aberto agora, horário de hoje, nota discreta,
 *  telefone, mapa embutido e, em pedido de grupo, os atributos de grupo. Nada disso é salvo. */
export function GoogleLive({ place, group }: { place: Place; group?: boolean }) {
  const q = useQuery({ queryKey: ['glive', place.id, !!group], queryFn: () => liveInfo(place, { group }), staleTime: Infinity, gcTime: 30 * 60_000, retry: false })
  if (q.isLoading) return <Skeleton className="mt-6 h-52 rounded-[24px]" />
  const r = q.data
  if (!r || !r.ok) return null
  const g = r.info
  const closed = g.status === 'CLOSED_PERMANENTLY'
  const temp = g.status === 'CLOSED_TEMPORARILY'
  const flags = g.group ? ([
    g.group.goodForGroups && 'bom pra grupo', g.group.reservable && 'aceita reserva', g.group.liveMusic && 'música ao vivo', g.group.outdoorSeating && 'área externa',
  ].filter(Boolean) as string[]) : []

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="mt-6 overflow-hidden rounded-[24px] border border-line bg-surface">
      {(closed || temp) && (
        <p className="flex items-center gap-2 bg-[#ff5c5c]/15 px-4 py-2.5 text-[13px] text-[#ffb3b3]">
          <AlertTriangle size={14} />{closed ? 'O Google indica que este lugar fechou definitivamente.' : 'O Google indica que está fechado temporariamente.'}
        </p>
      )}
      <div className="grid gap-2 p-4 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          {!closed && g.openNow !== undefined && (
            <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs', g.openNow ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-mute')}>
              <span className={cx('size-1.5 rounded-full', g.openNow ? 'bg-accent' : 'bg-faint')} />{g.openNow ? 'Aberto agora' : 'Fechado agora'}
            </span>
          )}
          {g.rating !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-mute">
              <Star size={11} />Google {g.rating.toFixed(1).replace('.', ',')}{g.ratings ? ` (${fmtCount(g.ratings)})` : ''}
            </span>
          )}
          {flags.map((f) => <span key={f} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">{f}</span>)}
        </div>
        {g.today && <p className="flex items-center gap-2 text-ink/80"><Clock size={13} className="text-mute" />Hoje: {g.today}</p>}
        {g.week && (
          <details className="text-mute">
            <summary className="cursor-pointer text-xs">horário da semana</summary>
            <ul className="mt-1 grid gap-0.5 text-xs">{g.week.map((d) => <li key={d}>{d}</li>)}</ul>
          </details>
        )}
        {g.phone && (
          <a href={`tel:${g.phone.replace(/[^\d+]/g, '')}`} onClick={() => track('place_call', { id: place.id })}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-ink hover:bg-white/[0.1]">
            <Phone size={13} className="text-accent" />{group ? 'Ligar pra reservar' : 'Ligar'} · {g.phone}
          </a>
        )}
      </div>
      {mapsEmbedOn && (
        <iframe title={`Mapa de ${place.name}`} src={embedUrl(g.placeId)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
          className="block h-44 w-full border-0 grayscale-[30%]" allowFullScreen />
      )}
      <p className="px-4 pb-3 pt-2 text-[10px] text-faint">Ao vivo do Google Maps · não é avaliação da comunidade</p>
    </motion.section>
  )
}
