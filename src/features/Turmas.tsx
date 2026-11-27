import { confirmSheet } from '../ui/Confirm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Pencil, Sparkles, Users } from 'lucide-react'
import { Avatar, Button, EmptyState, Page, Skeleton, TopBar } from '../ui/primitives'
import { ease } from '../ui/motion'
import { timeAgo } from '../lib/labels'
import { track } from '../lib/track'
import { groupChat, leaveGroup, myGroups, renameGroup, sendChat, type Turma } from '../mocks/remote'
import { Sheet } from '../ui/Sheet'
import { ReportButton } from './Report'
import { MessagesSquare, Send } from 'lucide-react'

export const turmaName = (t: Turma) => {
  if (t.name) return t.name
  const others = t.members.filter((m) => !m.me).map((m) => m.name.split(' ')[0])
  if (!others.length) return 'Só você por enquanto'
  return `Você, ${others.slice(0, 3).join(', ')}${others.length > 3 ? ` +${others.length - 3}` : ''}`
}
export const useTurmas = () => useQuery({ queryKey: ['turmas'], queryFn: myGroups, staleTime: 30_000 })

/** Turmas: cada votação vira uma turma com quem votou. Dá pra renomear e chamar a mesma turma pro próximo rolê. */
export function TurmasPage() {
  const q = useTurmas()
  const groups = (q.data ?? []).filter((t) => t.members.length >= 2 || t.requests.length > 0)
  return (
    <Page>
      <TopBar title="Suas turmas" />
      <div className="grid gap-3 px-5 pb-16">
        <p className="text-[14px] text-mute">Quem vota com você num rolê entra na turma. Na próxima, é só chamar a mesma galera.</p>
        {q.isLoading && <><Skeleton className="h-40" /><Skeleton className="h-40" /></>}
        {q.data === null && <EmptyState title="Sem conexão" text="As turmas ficam no servidor do rolê, que está fora do ar agora. Tente daqui a pouco." />}
        {q.data && groups.length === 0 && (
          <EmptyState title="Nenhuma turma ainda" text="Crie um rolê e mande a votação pro grupo: quem votar entra na turma." action={<Link to="/novo"><Button>Criar um rolê</Button></Link>} />
        )}
        {groups.map((t, i) => <TurmaCard key={t.id} t={t} i={i} />)}
      </div>
    </Page>
  )
}

function TurmaCard({ t, i }: { t: Turma; i: number }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(t.name ?? '')
  const save = useMutation({ mutationFn: () => renameGroup(t.id, name), onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ['turmas'] }) } })
  const leave = useMutation({ mutationFn: () => leaveGroup(t.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }) })
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.45, ease }} className="rounded-[24px] border border-line bg-surface p-4">
      {editing ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Nome da turma (ex.: Firma, Faculdade)"
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 text-[14px] outline-none focus:border-accent" />
          <Button disabled={save.isPending}>Salvar</Button>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 font-serif text-[24px] leading-tight">{turmaName(t)}</p>
          <button onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full bg-white/[0.06] text-mute" aria-label="Renomear turma"><Pencil size={14} /></button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {t.members.map((m, j) => (
          <Link key={j} to={m.me || !m.pid ? '/perfil' : `/u/${m.pid}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pl-1 pr-2.5 text-xs">
            <Avatar name={m.name} hue={m.hue ?? 200} size={20} />{m.me ? 'Você' : m.name}
          </Link>
        ))}
      </div>
      {t.requests.length > 0 && (
        <ul className="mt-3 grid gap-1">
          {t.requests.slice(0, 3).map((r) => (
            <li key={r.id}>
              <Link to={`/pedido/${r.id}`} className="flex items-center gap-2 text-[13px] text-ink/80 hover:text-ink">
                <span className="truncate">“{r.text}”</span>
                <span className="ml-auto shrink-0 text-[11px] text-faint">{r.decided ? 'fechou · ' : ''}{timeAgo(r.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <TurmaChat gid={t.id} />
      <div className="mt-4 flex items-center gap-2">
        <Link to={`/novo?turma=${t.id}`} onClick={() => track('turma_novo_role', { members: t.members.length })} className="flex-1">
          <Button variant="soft" className="w-full" icon={<Sparkles size={15} />}>Novo rolê com essa turma</Button>
        </Link>
        <button onClick={async () => { if (await confirmSheet({ title: 'Sair dessa turma?', text: 'Você deixa de ver os rolês dela. Se alguém te chamar de novo, você volta.', ok: 'Sair', danger: true })) leave.mutate() }} className="min-h-11 px-2 text-[12px] text-faint hover:text-mute">sair</button>
      </div>
    </motion.div>
  )
}

/** faixa compacta pra Home */
export function TurmasStrip() {
  const q = useTurmas()
  const groups = (q.data ?? []).filter((t) => t.members.length >= 2)
  if (!groups.length) return null
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1">
      {groups.slice(0, 6).map((t) => (
        <Link key={t.id} to={`/novo?turma=${t.id}`} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 text-[13px]">
          <span className="flex -space-x-2">{t.members.slice(0, 3).map((m, j) => <Avatar key={j} name={m.name} hue={m.hue ?? 200} size={22} />)}</span>
          {turmaName(t)}
        </Link>
      ))}
      <Link to="/turmas" className="flex shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-mute"><Users size={14} />todas</Link>
    </div>
  )
}

/** chat contínuo da turma (atualiza a cada 4 s com o chat aberto; quem não está no app recebe aviso no celular) */
function TurmaChat({ gid }: { gid: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['chat', gid], queryFn: () => groupChat(gid), enabled: open, refetchInterval: open ? 4000 : false })
  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-line text-[13px]"><MessagesSquare size={15} />Chat da turma</button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <p className="font-serif text-[26px] leading-tight">Chat da turma</p>
        <div className="mt-3 grid max-h-[50vh] gap-1.5 overflow-y-auto">
          {q.data?.length === 0 && <p className="text-[13px] text-faint">Nenhuma mensagem ainda.</p>}
          {q.data === null && <p className="text-[13px] text-faint">Sem conexão agora.</p>}
          {q.data?.map((m) => (
            <div key={m.id} className={m.mine ? 'flex justify-end' : 'flex items-center gap-1'}>
              <p className={m.mine ? 'max-w-[85%] rounded-2xl bg-accent/15 px-3 py-2 text-[13px]' : 'max-w-[85%] rounded-2xl bg-white/[0.05] px-3 py-2 text-[13px]'}>
                {!m.mine && <Link to={`/u/${m.pid}`} className="mr-1 font-medium text-accent">{m.name}</Link>}{m.text}
              </p>
              {!m.mine && <ReportButton kind="chat" id={m.id} />}
            </div>
          ))}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={async (e) => {
          e.preventDefault()
          if (!text.trim()) return
          if (await sendChat(gid, text.trim())) { setText(''); qc.invalidateQueries({ queryKey: ['chat', gid] }) }
        }}>
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="Mensagem" aria-label="Mensagem pra turma" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 text-[14px] outline-none focus:border-accent" />
          <button type="submit" aria-label="Enviar" className="grid size-11 place-items-center rounded-full bg-accent text-accent-ink"><Send size={16} /></button>
        </form>
      </Sheet>
    </>
  )
}
