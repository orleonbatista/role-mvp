import { Link, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarCheck, Camera, Check, MessageCircle, Star, UserPlus, Users, Vote } from 'lucide-react'
import { Page, Skeleton, TopBar, cx } from '../ui/primitives'
import { inbox, inboxRead, personAction, type InboxItem } from '../mocks/remote'
import { timeAgo } from '../lib/labels'
import { track } from '../lib/track'

/* Central de notificações: tudo que vira aviso no celular também fica guardado aqui por 60 dias,
   então quem não ligou os avisos (ou trocou de aparelho) ainda vê pedidos de amizade, votos, mensagens etc. */

const ICON: Record<string, typeof Bell> = { fr: UserPlus, fra: Check, v: Vote, s: Vote, d: CalendarCheck, close: CalendarCheck, rsvp: CalendarCheck, msg: MessageCircle, chat: MessageCircle, ph: Camera, rev: Star, gi: Users }

export const useInbox = () => useQuery({ queryKey: ['inbox'], queryFn: inbox, refetchInterval: 30_000, staleTime: 10_000 })

/** sino com contador de não lidas (vai no topo da Início) */
export function InboxBell({ className }: { className?: string }) {
  const n = useInbox().data?.unread ?? 0
  return (
    <Link to="/notificacoes" aria-label={n ? `Notificações, ${n} novas` : 'Notificações'} className={cx('relative grid size-10 place-items-center rounded-full bg-white/[0.06]', className)}>
      <Bell size={17} />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink">{n > 9 ? '9+' : n}</span>}
    </Link>
  )
}

export function InboxPage() {
  const q = useInbox()
  const qc = useQueryClient()
  const nav = useNavigate()
  const items = q.data?.items ?? []
  const refresh = () => { qc.invalidateQueries({ queryKey: ['inbox'] }); qc.invalidateQueries({ queryKey: ['social'] }) }
  const open = async (it: InboxItem) => {
    if (!it.read) await inboxRead(it.id)
    refresh()
    track('inbox_open', { kind: it.kind })
    nav('/' + it.url.replace(/^\//, ''))
  }
  const accept = async (it: InboxItem) => {
    if (!it.actor) return
    await personAction(it.actor, 'accept')
    await inboxRead(it.id)
    track('friend_accept', { from: 'inbox' })
    refresh()
  }
  return (
    <Page>
      <TopBar title="Notificações" right={q.data?.unread ? <button onClick={async () => { await inboxRead(); refresh() }} className="text-[12px] text-accent">marcar tudo como lido</button> : undefined} />
      <div className="px-5 pb-16">
        {q.isLoading && <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
        {q.isFetched && !q.data && <p className="text-[13px] text-amber-300/90">Sem conexão com o servidor agora: as notificações voltam quando ele estiver no ar.</p>}
        {q.data && !items.length && (
          <div className="mt-10 grid place-items-center gap-2 text-center">
            <Bell size={28} className="text-faint" />
            <p className="text-[14px] text-mute">Nada por aqui ainda.</p>
            <p className="max-w-[260px] text-[12px] text-faint">Pedidos de amizade, votos, mensagens da turma e convites pra avaliar aparecem aqui.</p>
          </div>
        )}
        <ul className="grid gap-2">
          {items.map((it) => {
            const Icon = ICON[it.kind] ?? Bell
            return (
              <li key={it.id} className={cx('flex items-start gap-3 rounded-[18px] p-3', it.read ? 'bg-white/[0.02]' : 'bg-surface ring-1 ring-accent/30')}>
                <span className={cx('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', it.read ? 'bg-white/[0.05] text-mute' : 'bg-accent/15 text-accent')}><Icon size={16} /></span>
                <button onClick={() => open(it)} className="min-w-0 flex-1 text-left">
                  <span className="block text-[14px] leading-snug">{it.title}</span>
                  {it.body && <span className="mt-0.5 block text-[12px] text-mute">{it.body}</span>}
                  <span className="mt-1 block text-[11px] text-faint">{timeAgo(it.at)}</span>
                </button>
                {it.kind === 'fr' && it.actor && !it.read && (
                  <button onClick={() => accept(it)} className="h-8 shrink-0 self-center rounded-full bg-accent px-3 text-[12px] font-medium text-accent-ink">Aceitar</button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Page>
  )
}
