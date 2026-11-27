import { confirmSheet } from '../ui/Confirm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Crown, Link2, MapPin, MoreHorizontal, Pencil, Plus, Shield, Sparkles, UserMinus, Users, Vote } from 'lucide-react'
import { Avatar, Button, EmptyState, Page, Skeleton, TopBar } from '../ui/primitives'
import { ease } from '../ui/motion'
import { timeAgo } from '../lib/labels'
import { track } from '../lib/track'
import { avatarUrl, chatPlace, createGroup, editOption, groupByLink, groupChat, groupLink, inviteToGroup, joinByLink, leaveGroup, manageMember, myGroups, renameGroup, sendChat, setGroupVisibility, social, type Turma } from '../mocks/remote'
import { useToast } from '../ui/Toast'
import { useProfile } from '../lib/api'
import { turmaInviteUrl } from '../lib/share'
import type { Place } from '../lib/types'
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
  const groups = q.data ?? []
  const [creating, setCreating] = useState(false)
  return (
    <Page tabbed>
      <TopBar title="Suas turmas" right={<button onClick={() => setCreating(true)} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-medium text-accent-ink"><Plus size={15} />Criar turma</button>} />
      <div className="grid gap-3 px-5 pb-16">
        <p className="text-[14px] text-mute">Crie uma turma e chame a galera pelo link, ou deixe que ela se forme sozinha: quem vota com você num rolê entra.</p>
        {q.isLoading && <><Skeleton className="h-40" /><Skeleton className="h-40" /></>}
        {q.data === null && <EmptyState title="Sem conexão" text="As turmas ficam no servidor do rolê, que está fora do ar agora. Tente daqui a pouco." />}
        {q.data && groups.length === 0 && (
          <EmptyState title="Nenhuma turma ainda" text="Crie uma turma e mande o link pra galera, ou crie um rolê: quem votar entra na turma." action={<Button onClick={() => setCreating(true)} icon={<Plus size={15} />}>Criar turma</Button>} />
        )}
        {groups.map((t, i) => <TurmaCard key={t.id} t={t} i={i} />)}
      </div>
      <CreateTurmaSheet open={creating} onClose={() => setCreating(false)} />
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
            <Avatar name={m.name} hue={m.hue ?? 200} size={20} src={avatarUrl(m.pid, m.photo)} />{m.me ? 'Você' : m.name.split(' ')[0]}
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
      <VisibilityControl t={t} />
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
          <span className="flex -space-x-2">{t.members.slice(0, 3).map((m, j) => <Avatar key={j} name={m.name} hue={m.hue ?? 200} size={22} src={avatarUrl(m.pid, m.photo)} />)}</span>
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
        ) : chatPlace(m.ref) ? (
          <PlaceMsg key={m.id} m={m} place={chatPlace(m.ref)!} t={t} onClose={onClose} />
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
                <div className="flex items-center gap-3 px-4 py-3">
                  <Link to={m.me || !m.pid ? '/perfil' : `/u/${m.pid}`} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={m.name} hue={m.hue ?? 200} size={34} src={avatarUrl(m.pid, m.photo)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[15px]">{m.me ? `${m.name} (você)` : m.name}
                        {m.owner ? <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 text-[10px] text-accent"><Crown size={10} />dono</span>
                          : m.admin ? <span className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.08] px-1.5 text-[10px] text-ink"><Shield size={10} />admin</span> : null}
                      </span>
                      <span className="block text-[12px] text-mute">{[m.handle, m.level].filter(Boolean).join(' · ') || 'sem @ ainda'}</span>
                    </span>
                  </Link>
                  {t.admin && !m.me && !m.owner && m.pid && <MemberMenu t={t} m={m as Required<Pick<typeof m, 'pid'>> & typeof m} />}
                </div>
              </li>
            ))}
          </ul>
          <InviteLink t={t} />
          {friends.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-[13px] uppercase tracking-[0.14em] text-mute">Chamar amigos</p>
              <ul className="grid gap-1">
                {friends.map((f) => (
                  <li key={f.pid} className="flex items-center gap-3 py-1.5">
                    <Avatar name={f.name} hue={f.hue} size={30} src={avatarUrl(f.pid, f.photo)} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{f.name}</span><span className="block text-[11px] text-mute">{f.handle ?? f.reputation.level}</span></span>
                    <button onClick={() => invite(f.pid)} className="h-8 rounded-full bg-accent px-3 text-[12px] font-medium text-accent-ink">Chamar</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {s.data && !friends.length && <p className="mt-4 text-[12px] text-faint">Pra chamar alguém pelo @, adicione como amigo na aba Amigos. Ou mande o link acima.</p>}
        </div>
      </Sheet>
    </>
  )
}

/** criar turma sem votação: nome e pronto; depois é chamar a galera pelo link */
function CreateTurmaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-none">Nova turma</p>
      <p className="mt-1 text-[13px] text-mute">Você vira o dono (admin). Depois é só mandar o link pra galera entrar.</p>
      <form className="mt-4 grid gap-3" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const r = await createGroup(name.trim())
        setBusy(false)
        if (!r?.ok) { toast('Não deu pra criar agora (precisa de cadastro e conexão)'); return }
        track('turma_create', {})
        setName(''); onClose()
        await qc.invalidateQueries({ queryKey: ['turmas'] })
        const token = await groupLink(r.id)
        if (token) await shareInvite(name.trim() || 'a turma', token, toast)
      }}>
        <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Firma, Faculdade, Futebol)" aria-label="Nome da turma"
          className="h-12 rounded-full border border-line bg-white/[0.03] px-4 text-[15px] outline-none focus:border-accent" />
        <Button size="lg" disabled={busy}>{busy ? 'Criando…' : 'Criar e chamar a galera'}</Button>
      </form>
    </Sheet>
  )
}

async function shareInvite(name: string, token: string, toast: (m: string) => void) {
  const url = turmaInviteUrl(token)
  const text = `Entra na turma ${name} no rolê.: ${url}`
  try {
    if (navigator.share) { await navigator.share({ title: 'rolê.', text: `Entra na turma ${name} no rolê.`, url }); return }
  } catch { return /* cancelou */ }
  try { await navigator.clipboard.writeText(text); toast('Link da turma copiado') } catch { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
}

/** link de convite da turma (qualquer membro manda; admin pode trocar o link) */
function InviteLink({ t }: { t: Turma }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const go = async (reset = false) => {
    if (reset && !(await confirmSheet({ title: 'Trocar o link da turma?', text: 'O link antigo para de funcionar. Quem já entrou continua na turma.', ok: 'Trocar' }))) return
    setBusy(true)
    const token = await groupLink(t.id, reset)
    setBusy(false)
    if (!token) { toast('Sem conexão agora'); return }
    track('turma_link', { reset })
    await shareInvite(turmaName(t), token, toast)
  }
  return (
    <div className="mt-4">
      <button onClick={() => go()} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-medium text-accent-ink"><Link2 size={16} />{busy ? 'Gerando…' : 'Convidar pelo link'}</button>
      {t.admin && <button onClick={() => go(true)} className="hit mt-2 w-full text-center text-[12px] text-faint">trocar o link (o antigo para de funcionar)</button>}
    </div>
  )
}

/** ações do admin sobre um membro */
function MemberMenu({ t, m }: { t: Turma; m: Turma['members'][number] & { pid: string } }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const act = async (a: 'admin' | 'membro' | 'remove') => {
    setOpen(false)
    if (a === 'remove' && !(await confirmSheet({ title: `Tirar ${m.name.split(' ')[0]} da turma?`, text: 'A pessoa deixa de ver o chat e os rolês da turma. Dá pra chamar de novo depois.', ok: 'Tirar', danger: true }))) return
    const ok = await manageMember(t.id, m.pid, a)
    track('turma_member', { a, ok })
    toast(ok ? ({ admin: `${m.name.split(' ')[0]} agora é admin`, membro: 'Não é mais admin', remove: 'Removido da turma' } as const)[a] : 'Não deu agora')
    qc.invalidateQueries({ queryKey: ['turmas'] })
  }
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Opções de ${m.name}`} className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-mute"><MoreHorizontal size={16} /></button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <p className="mb-3 font-serif text-[24px] leading-none">{m.name}</p>
        <div className="grid gap-2">
          {m.admin
            ? <Button variant="soft" icon={<Shield size={15} />} onClick={() => act('membro')}>Tirar de admin</Button>
            : <Button variant="soft" icon={<Shield size={15} />} onClick={() => act('admin')}>Tornar admin</Button>}
          <Button variant="soft" className="text-red-300" icon={<UserMinus size={15} />} onClick={() => act('remove')}>Tirar da turma</Button>
        </div>
      </Sheet>
    </>
  )
}

/** lugar mandado no chat: abre a página; quem criou uma votação aberta põe nela; ou cria uma votação a partir dele */
function PlaceMsg({ m, place, t, onClose }: { m: { id: string; name: string; mine: boolean; pid: string | null }; place: Place; t?: Turma; onClose: () => void }) {
  const toast = useToast()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const mineOpen = (t?.requests ?? []).filter((r) => !r.decided && r.mine)
  const addTo = async (rid: string) => {
    setBusy(true)
    const ok = await editOption(rid, 'add', place)
    setBusy(false)
    track('chat_place_to_vote', { ok })
    toast(ok ? `${place.name} entrou na votação` : 'Não deu pra pôr na votação (ela tem até 6 lugares)')
  }
  return (
    <div className={m.mine ? 'flex justify-end' : 'flex'}>
      <div className="w-[85%] rounded-2xl border border-line bg-white/[0.04] p-3 text-[13px]">
        {!m.mine && m.pid && <Link to={`/u/${m.pid}`} onClick={onClose} className="mb-1 block text-[12px] font-medium text-accent">{m.name}</Link>}
        <Link to={`/lugar/${place.id}`} onClick={onClose} className="flex items-center gap-2">
          <MapPin size={16} className="shrink-0 text-accent" />
          <span className="min-w-0"><span className="block truncate text-[15px]">{place.name}</span><span className="block truncate text-[12px] text-mute">{[place.tagline, place.hood].filter(Boolean).join(' · ')}</span></span>
        </Link>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {mineOpen.map((r) => (
            <button key={r.id} disabled={busy} onClick={() => addTo(r.id)} className="inline-flex h-8 max-w-full items-center gap-1 rounded-full bg-accent/15 px-3 text-[12px] text-accent">
              <Vote size={13} /><span className="truncate">Pôr em “{r.text.slice(0, 22)}{r.text.length > 22 ? '…' : ''}”</span>
            </button>
          ))}
          {t && (
            <button onClick={() => { onClose(); nav(`/novo?turma=${t.id}&lugar=${encodeURIComponent(place.id)}`) }} className="inline-flex h-8 items-center gap-1 rounded-full bg-white/[0.07] px-3 text-[12px]">
              <Sparkles size={13} />Nova votação com ele
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** "Mandar pra turma" na página do lugar */
export function ShareToTurmaSheet({ place, open, onClose }: { place: Place; open: boolean; onClose: () => void }) {
  const q = useTurmas()
  const toast = useToast()
  const qc = useQueryClient()
  const [chat, setChat] = useState<string | null>(null)
  const send = async (gid: string) => {
    const ok = await sendChat(gid, `📍 ${place.name}`, place)
    track('place_to_turma', { ok })
    if (!ok) { toast('Sem conexão agora'); return }
    qc.invalidateQueries({ queryKey: ['chat', gid] })
    onClose(); setChat(gid)
  }
  return (
    <>
      <Sheet open={open} onClose={onClose}>
        <p className="font-serif text-[26px] leading-none">Mandar {place.name} pra turma</p>
        <p className="mt-1 text-[13px] text-mute">Vai pro chat com botão pra pôr na votação ou criar uma votação com ele.</p>
        <div className="mt-4 grid gap-2">
          {q.data?.length === 0 && <p className="text-[13px] text-faint">Você ainda não tem turma. Crie uma na aba Turmas.</p>}
          {q.data === null && <p className="text-[13px] text-faint">Sem conexão agora.</p>}
          {q.data?.map((t) => (
            <button key={t.id} onClick={() => send(t.id)} className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3 text-left">
              <span className="flex -space-x-2">{t.members.slice(0, 3).map((m, j) => <Avatar key={j} name={m.name} hue={m.hue ?? 200} size={24} src={avatarUrl(m.pid, m.photo)} />)}</span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{turmaName(t)}</span>
              <Send size={15} className="text-accent" />
            </button>
          ))}
        </div>
      </Sheet>
      {chat && <TurmaChatSheet gid={chat} open onClose={() => setChat(null)} />}
    </>
  )
}

/** /t/:token — convite da turma: mostra quem está e entra */
export function JoinTurmaPage() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const me = useProfile().data
  const q = useQuery({ queryKey: ['turma-link', token], queryFn: () => groupByLink(token) })
  const [busy, setBusy] = useState(false)
  const join = async () => {
    if (!me?.onboarded) { try { localStorage.setItem('role.next', `/t/${token}`) } catch { /* */ } nav('/onboarding'); return }
    setBusy(true)
    const r = await joinByLink(token)
    setBusy(false)
    track('turma_join_link', { ok: !!r?.ok })
    if (!r?.ok) { toast('Não deu pra entrar agora'); return }
    await qc.invalidateQueries({ queryKey: ['turmas'] })
    nav('/turmas', { replace: true })
  }
  const g = q.data
  return (
    <Page>
      <TopBar title="Convite" />
      <div className="px-5 pb-10">
        {q.isLoading && <><Skeleton className="h-10 w-2/3" /><Skeleton className="mt-4 h-24" /></>}
        {q.isFetched && !g && <EmptyState title="Link inválido" text="Esse convite não existe mais. Peça um link novo pra quem te chamou." />}
        {g && (
          <>
            <p className="text-[13px] uppercase tracking-[0.14em] text-mute">Você foi chamado pra turma</p>
            <h1 className="mt-2 font-serif text-[44px] leading-[0.95]">{g.name ?? g.members.map((m) => m.name.split(' ')[0]).slice(0, 3).join(', ')}</h1>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {g.members.map((m) => (
                <span key={m.pid} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pl-1 pr-2.5 text-xs"><Avatar name={m.name} hue={m.hue} size={20} src={avatarUrl(m.pid, m.photo)} />{m.name.split(' ')[0]}</span>
              ))}
              {g.count > g.members.length && <span className="px-2 py-1 text-xs text-mute">+{g.count - g.members.length}</span>}
            </div>
            <p className="mt-5 text-[14px] text-mute">Na turma vocês têm um chat, combinam rolês e votam juntos.</p>
            <div className="mt-6">
              {g.member
                ? <Link to="/turmas"><Button size="lg" className="w-full">Você já está · abrir turmas</Button></Link>
                : <Button size="lg" className="w-full" disabled={busy} onClick={join}>{busy ? 'Entrando…' : me?.onboarded ? 'Entrar na turma' : 'Criar perfil e entrar'}</Button>}
            </div>
          </>
        )}
      </div>
    </Page>
  )
}

/** privacidade da turma: controle explícito (antes era um texto clicável que ninguém percebia) */
function VisibilityControl({ t }: { t: Turma }) {
  const qc = useQueryClient()
  const toast = useToast()
  const pub = t.visibility === 'publica'
  const can = !!(t.admin ?? t.mine)
  const set = async (v: 'privada' | 'publica') => {
    if (!can || v === t.visibility) return
    const ok = await setGroupVisibility(t.id, v)
    track('turma_visibility', { v, ok })
    toast(ok ? (v === 'publica' ? 'Turma agora é pública' : 'Turma agora é privada') : 'Não deu agora')
    qc.invalidateQueries({ queryKey: ['turmas'] })
  }
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-mute">Privacidade</span>
        <div className="ml-auto flex rounded-full bg-white/[0.05] p-0.5 text-[12px]" role="radiogroup" aria-label="Privacidade da turma">
          {(['privada', 'publica'] as const).map((v) => (
            <button key={v} role="radio" aria-checked={(t.visibility ?? 'privada') === v} disabled={!can} onClick={() => set(v)}
              className={(t.visibility ?? 'privada') === v ? 'h-7 rounded-full bg-surface-2 px-3 text-ink' : 'h-7 rounded-full px-3 text-mute disabled:opacity-50'}>
              {v === 'privada' ? 'Privada' : 'Pública'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">
        {pub ? 'Aparece no perfil dos membros e qualquer um pode entrar.' : 'Só entra quem recebe o link da turma ou de uma votação.'}
        {!can && ' Só admin muda.'}
      </p>
    </div>
  )
}
