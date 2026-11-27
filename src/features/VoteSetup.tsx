import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Lock, MapPinPlus, MessagesSquare, Unlock, X } from 'lucide-react'
import { editOption, setVoters } from '../mocks/remote'
import { useToast } from '../ui/Toast'
import { confirmSheet } from '../ui/Confirm'
import { cx } from '../ui/primitives'
import { track } from '../lib/track'
import type { RequestDetail } from '../lib/types'
import { TurmaChatSheet } from './Turmas'

/* Montar a votação (só o autor): tirar opção, pôr lugar que a IA/Google não trouxe e escolher quem pode votar.
   Tudo passa pelo servidor, então todo mundo que abre o link vê a mesma lista. */

export function VoteSetup({ d }: { d: RequestDetail }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const online = !!d.extra?.online
  const voters = d.extra?.voters ?? 'link'
  if (d.request.authorId !== 'me' || d.request.status === 'decidido') return null
  const refresh = () => qc.invalidateQueries({ queryKey: ['request', d.request.id] })

  async function remove(placeId: string, name: string) {
    const votes = d.tally.find((t) => t.placeId === placeId)?.count ?? 0
    if (votes && !(await confirmSheet({ title: `Tirar ${name}?`, text: `${votes} ${votes === 1 ? 'voto vai' : 'votos vão'} junto. Quem votou nele escolhe de novo.`, ok: 'Tirar', danger: true }))) return
    setBusy(placeId)
    const ok = await editOption(d.request.id, 'remove', d.options.find((o) => o.id === placeId)!)
    setBusy('')
    track('vote_option_removed', { votes })
    if (!ok) toast(online ? 'Não deu pra tirar agora: a votação precisa de pelo menos 2 lugares.' : 'Sem conexão: tirar opção precisa do servidor no ar.')
    refresh()
  }
  async function toggleVoters() {
    const next = voters === 'link' ? 'amigos' : 'link'
    if (await setVoters(d.request.id, next)) { track('vote_voters', { v: next }); toast(next === 'amigos' ? 'Só seus amigos e a turma votam agora' : 'Qualquer um com o link vota'); refresh() }
    else toast('Sem conexão com o servidor agora.')
  }

  return (
    <section className="mx-5 mt-5 rounded-[24px] border border-line bg-surface p-4">
      <p className="text-[13px] uppercase tracking-[0.14em] text-mute">Montar a votação</p>
      <ul className="mt-2 grid gap-1">
        {d.options.map((o) => (
          <li key={o.id} className="flex items-center gap-2 text-[14px]">
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            <span className="text-[11px] text-faint">{d.tally.find((t) => t.placeId === o.id)?.count || ''}</span>
            <button onClick={() => remove(o.id, o.name)} disabled={d.options.length <= 2 || !!busy} aria-label={`Tirar ${o.name} da votação`}
              className="grid size-9 place-items-center rounded-full text-mute hover:text-ink disabled:opacity-30"><X size={15} /></button>
          </li>
        ))}
      </ul>
      <button onClick={() => { track('vote_option_add_click', {}); nav(`/s/${d.request.id}`) }} disabled={d.options.length >= 6}
        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-dashed border-accent/50 text-[13px] text-accent disabled:opacity-40">
        <MapPinPlus size={15} />{d.options.length >= 6 ? 'Máximo de 6 lugares (tire um pra pôr outro)' : 'Pôr outro lugar (busca no catálogo e no Google)'}
      </button>
      <button onClick={toggleVoters} className={cx('mt-3 flex w-full items-center gap-3 rounded-[16px] p-3 text-left', voters === 'amigos' ? 'bg-accent/[0.08]' : 'bg-white/[0.03]')}>
        {voters === 'amigos' ? <Lock size={16} className="shrink-0 text-accent" /> : <Unlock size={16} className="shrink-0 text-mute" />}
        <span className="flex-1">
          <span className="block text-[14px]">{voters === 'amigos' ? 'Só amigos e a turma votam' : 'Qualquer um com o link vota'}</span>
          <span className="block text-[12px] text-mute">Toque pra {voters === 'amigos' ? 'abrir pra qualquer um com o link' : 'restringir aos seus amigos no rolê e a quem já está na turma'}</span>
        </span>
      </button>
    </section>
  )
}

/** atalho da votação pro chat da turma (e o chat mostra as votações abertas) */
export function GroupChatLink({ d }: { d: RequestDetail }) {
  const [open, setOpen] = useState(false)
  const gid = d.extra?.groupId
  const inGroup = d.request.authorId === 'me' || !!d.extra?.participants.some((p) => p.me)
  if (!gid || !d.extra?.online || !inGroup || (d.extra.participants.length < 2 && d.request.authorId === 'me')) return null
  return (
    <>
      <button onClick={() => { setOpen(true); track('vote_group_chat', {}) }} className="mx-5 mt-3 flex h-11 w-[calc(100%-2.5rem)] items-center justify-center gap-2 rounded-full border border-line text-[13px]">
        <MessagesSquare size={15} />Conversar com a turma
      </button>
      <TurmaChatSheet gid={gid} open={open} onClose={() => setOpen(false)} from={d.request.id} />
    </>
  )
}

/** aviso pra quem abriu o link mas não pode votar */
export function VoteLocked({ d }: { d: RequestDetail }) {
  if (d.extra?.canVote !== false) return null
  return (
    <p className="mx-5 mt-5 flex items-start gap-2 rounded-[18px] bg-amber-300/10 p-3 text-[13px] text-amber-100/90">
      <Lock size={15} className="mt-0.5 shrink-0" />
      Nesta votação só votam os amigos de {d.author.name.split(' ')[0]} no rolê e quem já está na turma. Peça pra te adicionar como amigo (pelo seu @) e volte aqui.
    </p>
  )
}
