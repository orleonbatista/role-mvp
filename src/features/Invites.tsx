import { Link } from 'react-router'
import { Check, ChevronRight, Vote as VoteIcon } from 'lucide-react'
import { useInvites } from '../lib/api'
import { Avatar, SectionTitle } from '../ui/primitives'

/** votações de outras pessoas que chegaram por link: pendentes primeiro, depois as já fechadas */
export function InvitesList({ exclude, compact }: { exclude?: string; compact?: boolean }) {
  const { data } = useInvites()
  const list = (data ?? []).filter((i) => i.id !== exclude)
  if (!list.length) return null
  const pending = list.filter((i) => i.status !== 'decidido' && !i.voted).length
  return (
    <section className={compact ? 'mt-8' : 'mt-9'}>
      <SectionTitle aside={pending ? <span className="text-xs text-accent">{pending} sem seu voto</span> : undefined}>{compact ? 'Suas outras votações' : 'Votações que te mandaram'}</SectionTitle>
      <div className="mx-5 divide-y divide-line overflow-hidden rounded-[20px] border border-line">
        {list.slice(0, compact ? 5 : 8).map((i) => (
          <Link key={i.id} to={`/r/${i.id}`} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={i.author} hue={i.hue} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px]">“{i.text}”</p>
              <p className="truncate text-[11px] text-faint">de {i.author.split(' ')[0]} · {i.decided ? `fechado: ${i.decided}` : `${i.votes} ${i.votes === 1 ? 'voto' : 'votos'}`}</p>
            </div>
            {i.status === 'decidido' ? <span className="text-[11px] text-mute">fechado</span>
              : i.voted ? <span className="flex items-center gap-1 text-[11px] text-accent"><Check size={12} />votei</span>
              : <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-ink"><VoteIcon size={11} />votar</span>}
            <ChevronRight size={14} className="text-mute" />
          </Link>
        ))}
      </div>
    </section>
  )
}
