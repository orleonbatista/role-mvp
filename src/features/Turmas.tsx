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
import { groupChat, inviteToGroup, leaveGroup, myGroups, renameGroup, sendChat, setGroupVisibility, social, type Turma } from '../mocks/remote'
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
    <Page tabbed>
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
        {t.members.slice(0, 5).map((m, j) => (
          <Link key={j} to={m.me || !m.pid ? '/perfil' : `/u/${m.pid}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pl-1 pr-2.5 text-xs">
            <Avatar name={m.name} hue={m.hue ?? 200} size={20} />{m.me ? 'Você' : m.name.split(' ')[0]}
          </Link>
        ))}
        <MembersButton t={t} />
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
      {t.mine && (
        <button onClick={async () => { const v = t.visibility === 'publica' ? 'privada' : 'publica'; if (await setGroupVisibility(t.id, v)) { track('turma_visibility', { v }); qc.invalidateQueries({ queryKey: ['turmas'] }) } }}
          className="mt-2 w-full text-left text-[12px] text-mute">
          {t.visibility === 'publica' ? <>Turma <b className="text-accent">pública</b>: aparece no perfil de vocês e qualquer um entra. Tornar privada</> : <>Turma <b className="text-ink">privada</b>: só entra quem recebe o link de uma votação. Tornar pública</>}
        </button>
      )}
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
  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-line text-[13px]"><MessagesSquare size={15} />Chat da turma</button>
      <TurmaChatSheet gid={gid} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** chat da turma ligado às votações: votações abertas no topo, recados automáticos (nova votação, rolê fechado) com link */
export function TurmaChatSheet({ gid, open, onClose, from }: { gid: string; open: boolean; onClose: () => void; from?: string }) {
  const [text, setText] = useState('')
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['chat', gid], queryFn: () => groupChat(gid), enabled: open, refetchInterval: open ? 4000 : false })
  const t = useTurmas().data?.find((x) => x.id === gid)
  const openVotes = (t?.requests ?? []).filter((r) => !r.decided && r.id !== from)
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[26px] leading-tight">{t ? turmaName(t) : 'Chat da turma'}</p>
      {openVotes.length > 0 && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
          {openVotes.map((r) => (
            <Link key={r.id} to={`/r/${r.id}`} onClick={onClose} className="shrink-0 rounded-full border border-accent/40 bg-accent/[0.06] px-3 py-1.5 text-[12px]">
              <span className="text-accent">votação aberta · </span>{r.text.slice(0, 32)}{r.text.length > 32 ? '…' : ''}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-3 grid max-h-[50vh] gap-1.5 overflow-y-auto">
        {q.data?.length === 0 && <p className="text-[13px] text-faint">Nenhuma mensagem ainda.</p>}
        {q.data === null && <p className="text-[13px] text-faint">Sem conexão agora.</p>}
        {q.data?.map((m) => m.system ? (
          <p key={m.id} className="my-1 text-center text-[12px] text-mute">
            {m.text}{m.ref && <> · <Link to={`/r/${m.ref}`} onClick={onClose} className="text-accent">abrir votação</Link></>}
          </p>
        ) : (
          <div key={m.id} className={m.mine ? 'flex justify-end' : 'flex items-center gap-1'}>
            <p className={m.mine ? 'max-w-[85%] rounded-2xl bg-accent/15 px-3 py-2 text-[13px]' : 'max-w-[85%] rounded-2xl bg-white/[0.05] px-3 py-2 text-[13px]'}>
              {!m.mine && m.pid && <Link to={`/u/${m.pid}`} className="mr-1 font-medium text-accent">{m.name}</Link>}{m.text}
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
  )
}

/** lista completa de quem está na turma, com @ e nível; cada linha abre o perfil */
function MembersButton({ t }: { t: Turma }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const s = useQuery({ queryKey: ['social'], queryFn: social, enabled: open })
  const inGroup = new Set(t.members.map((m) => m.pid))
  const friends = (s.data?.friends ?? []).filter((f) => !inGroup.has(f.pid))
  const invite = async (pid: string) => { if (await inviteToGroup(t.id, pid)) { track('turma_invite', {}); qc.invalidateQueries({ queryKey: ['turmas'] }) } }
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-xs text-mute">
        {t.members.length > 5 ? `+${t.members.length - 5} · ` : ''}ver membros
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="pt-2">
          <p className="mb-3 font-serif text-[24px] leading-none">{turmaName(t)} · {t.members.length}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-[18px] border border-line">
            {t.members.map((m, j) => (
              <li key={j}>
                <Link to={m.me || !m.pid ? '/perfil' : `/u/${m.pid}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.name} hue={m.hue ?? 200} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{m.me ? `${m.name} (você)` : m.name}</span>
                    <span className="block text-[12px] text-mute">{[m.handle, m.level].filter(Boolean).join(' · ') || 'sem @ ainda'}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {friends.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-[13px] uppercase tracking-[0.14em] text-mute">Chamar amigos</p>
              <ul className="grid gap-1">
                {friends.map((f) => (
                  <li key={f.pid} className="flex items-center gap-3 py-1.5">
                    <Avatar name={f.name} hue={f.hue} size={30} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{f.name}</span><span className="block text-[11px] text-mute">{f.handle ?? f.reputation.level}</span></span>
                    <button onClick={() => invite(f.pid)} className="h-8 rounded-full bg-accent px-3 text-[12px] font-medium text-accent-ink">Chamar</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {s.data && !friends.length && <p className="mt-4 text-[12px] text-faint">Pra chamar alguém pelo @, adicione como amigo na aba Amigos.</p>}
        </div>
      </Sheet>
    </>
  )
}
