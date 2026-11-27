import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Ban, Bookmark, Check, ListPlus, Send, UserPlus } from 'lucide-react'
import { Avatar, Button, EmptyState, Page, SectionTitle, Skeleton, Tag, TopBar, cx } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { confirmSheet } from '../ui/Confirm'
import { acceptInvite, avatarUrl, inviteInfo, joinGroup, myInvite, searchPeople, createList, listAction, listOf, myLists, person, personAction, ranking, social, type FeedItem, type PersonCard, type Rep } from '../mocks/remote'
import { fromSnap } from '../lib/places'
import { VERDICT_LABEL, nicheLabel, timeAgo } from '../lib/labels'
import { useProfile, useSync } from '../lib/api'
import { track } from '../lib/track'
import type { Place } from '../lib/types'
import { appInviteUrl } from '../lib/share'
import { useEffect } from 'react'

/* Rede social do rolê: amigos (pedido → aceite), feed com o que os amigos avaliaram/fecharam/listaram,
   perfil público, listas de curadoria e ranking de curadores. Tudo no servidor; sem conexão, a tela avisa. */

const levelTone = (r: Rep) => (r.level.startsWith('curador') ? 'accent' : 'default') as 'accent' | 'default'
const PersonRow = ({ p, right }: { p: PersonCard; right?: React.ReactNode }) => (
  <div className="flex items-center gap-3 px-4 py-3">
    <Link to={`/u/${p.pid}`} className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar name={p.name} hue={p.hue} size={36} src={avatarUrl(p.pid, p.photo)} />
      <span className="min-w-0"><span className="block truncate text-[15px]">{p.name}</span><span className="text-[11px] text-mute">{p.handle ? `${p.handle} · ` : ''}{p.reputation.level} · {p.reputation.points} pts</span></span>
    </Link>
    {right}
  </div>
)

export function SocialPage() {
  const [tab, setTab] = useState<'feed' | 'amigos' | 'ranking'>('feed')
  const qc = useQueryClient()
  const online = useSync().data?.online
  const s = useQuery({ queryKey: ['social'], queryFn: social, refetchInterval: 20_000 })
  const me = useProfile().data
  const [hoodOnly, setHoodOnly] = useState(false)
  const [scope, setScope] = useState<'amigos' | 'geral'>('amigos')
  const rk = useQuery({ queryKey: ['ranking', scope, hoodOnly ? me?.hood : ''], queryFn: () => ranking(hoodOnly ? me?.hood : undefined, scope), enabled: tab === 'ranking' })
  const accept = async (pid: string) => { await personAction(pid, 'accept'); track('friend_accept', {}); qc.invalidateQueries({ queryKey: ['social'] }) }
  return (
    <Page tabbed>
      <TopBar title="Amigos" back={false} />
      {online === false && <p className="mx-5 mb-3 text-[13px] text-amber-300/90">Sem conexão com o servidor agora: amigos e feed voltam quando ele estiver no ar.</p>}
      {!!s.data?.incoming.length && (
        <section className="mx-5 mb-4 overflow-hidden rounded-[20px] border border-accent/40">
          <p className="px-4 pt-3 text-[12px] text-accent">Pedidos de amizade</p>
          {s.data.incoming.map((p) => (
            <PersonRow key={p.pid} p={p} right={<button onClick={() => accept(p.pid)} className="h-9 rounded-full bg-accent px-4 text-[12px] font-medium text-accent-ink">Aceitar</button>} />
          ))}
        </section>
      )}
      <InviteButton />
      <div className="mx-5 mb-4 flex gap-1 rounded-full bg-white/[0.05] p-1" role="tablist">
        {(['feed', 'amigos', 'ranking'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('h-9 flex-1 rounded-full text-[13px] capitalize', tab === t ? 'bg-surface text-ink' : 'text-mute')}>{t}</button>
        ))}
      </div>

      {tab === 'feed' && (
        <section className="grid gap-2 px-5 pb-28">
          {s.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
          {s.data && !s.data.feed.length && (
            <p className="rounded-[20px] border border-dashed border-line p-5 text-center text-[13px] text-faint">
              {s.data.friends.length ? 'Seus amigos ainda não criaram, votaram, avaliaram nem fecharam rolês.' : 'Ache amigos pelo @ na aba Amigos (ou pelo ranking) pra ver as curadorias e os rolês deles aqui.'}
            </p>
          )}
          {s.data?.feed.map((f, i) => <FeedCard key={i} f={f} />)}
        </section>
      )}

      {tab === 'amigos' && <FindPeople />}
      {tab === 'amigos' && (
        <section className="mx-5 mb-28 divide-y divide-line overflow-hidden rounded-[20px] border border-line">
          {s.data && !s.data.friends.length && !s.data.sent.length && <p className="p-4 text-[13px] text-faint">Nenhum amigo ainda.</p>}
          {s.data?.friends.map((p) => <PersonRow key={p.pid} p={p} right={<Check size={16} className="text-accent" />} />)}
          {s.data?.sent.map((p) => <PersonRow key={p.pid} p={p} right={<span className="text-[11px] text-faint">pedido enviado</span>} />)}
        </section>
      )}

      {tab === 'ranking' && (
        <section className="px-5 pb-28">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1 rounded-full bg-white/[0.05] p-0.5 text-[12px]">
              {(['amigos', 'geral'] as const).map((x) => (
                <button key={x} onClick={() => setScope(x)} className={cx('h-7 rounded-full px-3', scope === x ? 'bg-surface-2 text-ink' : 'text-mute')}>{x === 'amigos' ? 'Você e amigos' : 'Geral'}</button>
              ))}
            </div>
            {me?.hood && <button onClick={() => setHoodOnly((x) => !x)} className="hit text-[12px] text-accent">{hoodOnly ? 'todos os bairros' : `só ${me.hood}`}</button>}
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-[20px] border border-line">
            {rk.data?.length === 0 && <p className="p-4 text-[13px] text-faint">{scope === 'amigos' ? 'Adicione amigos pra comparar pontos.' : 'Ninguém por aqui ainda.'}</p>}
            {rk.data?.map((p, i) => (
              <PersonRow key={p.pid} p={p} right={<span className={cx('w-8 text-right font-serif text-[22px]', i < 3 ? 'text-accent' : 'text-mute')}>{i + 1}</span>} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-faint">Pontos: avaliação aprovada 10 (+5 se foi de um rolê combinado no app), foto aprovada 3, rolê fechado 4, rolê criado 2, votação em rolê de outra pessoa 1.</p>
        </section>
      )}
    </Page>
  )
}

function FeedCard({ f }: { f: FeedItem }) {
  return (
    <div className="rounded-[20px] bg-surface p-4">
      <Link to={`/u/${f.who.pid}`} className="flex items-center gap-2"><Avatar name={f.who.name} hue={f.who.hue} size={24} src={avatarUrl(f.who.pid, f.who.photo)} /><span className="text-[13px]">{f.who.name}</span><span className="ml-auto text-[11px] text-faint">{timeAgo(f.at)}</span></Link>
      {f.kind === 'review' && <p className="mt-2 text-[14px]">{VERDICT_LABEL[f.verdict as keyof typeof VERDICT_LABEL] ?? f.verdict} <Link to={`/lugar/${f.placeId}`} className="text-accent">{f.placeName ?? 'um lugar'}</Link>{f.note ? `: ${f.note}` : ''}</p>}
      {f.kind === 'decided' && <p className="mt-2 text-[14px]">Fechou rolê no <Link to={`/lugar/${f.placeId}`} className="text-accent">{f.placeName ?? 'lugar'}</Link></p>}
      {f.kind === 'request' && <p className="mt-2 text-[14px]">Criou um rolê: <Link to={`/r/${f.requestId}`} className="text-accent">“{f.text}”</Link></p>}
      {f.kind === 'voted' && <p className="mt-2 text-[14px]">Votou em <Link to={`/r/${f.requestId}`} className="text-accent">“{f.text}”</Link></p>}
      {f.kind === 'list' && <p className="mt-2 text-[14px]">Atualizou a lista <Link to={`/lista/${f.listId}`} className="text-accent">{f.title}</Link> · {f.count} lugares</p>}
    </div>
  )
}

/** perfil público: reputação, avaliações, listas e a amizade */
export function PersonPage() {
  const { pid = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['person', pid], queryFn: () => person(pid) })
  const p = q.data
  const act = async (a: 'add' | 'accept' | 'remove' | 'block') => {
    if (a === 'block' && !(await confirmSheet({ title: `Bloquear ${p?.name}?`, text: 'Vocês deixam de se ver no rolê e a amizade é desfeita. Dá pra desbloquear depois.', ok: 'Bloquear', danger: true }))) return
    if (a === 'remove' && !(await confirmSheet({ title: 'Desfazer amizade?', ok: 'Desfazer' }))) return
    const ok = await personAction(pid, a)
    track('friend_' + a, {})
    toast(ok ? ({ add: 'Pedido de amizade enviado', accept: 'Agora vocês são amigos', remove: 'Amizade desfeita', block: 'Pessoa bloqueada' } as const)[a] : 'Entre no app com cadastro pra fazer amizades')
    qc.invalidateQueries({ queryKey: ['person', pid] }); qc.invalidateQueries({ queryKey: ['social'] })
  }
  if (q.isFetched && !p) return <Page><TopBar /><p className="px-5 text-[14px] text-mute">Perfil não encontrado.</p></Page>
  if (!p) return <Page><TopBar /><div className="grid gap-3 px-5"><Skeleton className="h-20" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div></Page>
  return (
    <Page>
      <TopBar />
      {p && (
        <div className="px-5 pb-16">
          <div className="flex items-center gap-4">
            <Avatar name={p.name} hue={p.hue} size={68} src={avatarUrl(p.pid, p.photo)} />
            <div className="min-w-0">
              <h1 className="font-serif text-[36px] leading-none">{p.name}</h1>
              {p.handle && <p className="mt-1 text-[14px] text-accent">{p.handle}</p>}
              <p className="mt-0.5 text-[13px] text-mute">{p.hood ?? ''}{p.friendsCount ? ` · ${p.friendsCount} amigos` : ''}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Tag tone={levelTone(p.reputation)}><Award size={11} className="mr-1" />{p.reputation.level} · {p.reputation.points} pts</Tag>
            {p.niches.slice(0, 3).map((n) => <Tag key={n}>{nicheLabel(n as never)}</Tag>)}
          </div>
          {!p.me && (
            <div className="mt-5 flex gap-2">
              {p.relation === 'nenhuma' && <button onClick={() => act('add')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-medium text-accent-ink"><UserPlus size={16} />Adicionar amigo</button>}
              {p.relation === 'enviado' && <span className="flex h-11 flex-1 items-center justify-center rounded-full border border-line text-[13px] text-mute">Pedido enviado</span>}
              {p.relation === 'recebido' && <button onClick={() => act('accept')} className="flex h-11 flex-1 items-center justify-center rounded-full bg-accent text-[14px] font-medium text-accent-ink">Aceitar amizade</button>}
              {p.relation === 'amigos' && <button onClick={() => act('remove')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line text-[13px]"><Check size={15} className="text-accent" />Amigos</button>}
              <button onClick={() => act('block')} aria-label="Bloquear" className="grid size-11 place-items-center rounded-full border border-line text-mute"><Ban size={16} /></button>
            </div>
          )}

          {!!p.lists.length && (
            <section className="mt-8">
              <SectionTitle>Listas</SectionTitle>
              <div className="grid gap-2">
                {p.lists.map((l) => <Link key={l.id} to={`/lista/${l.id}`} className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3"><Bookmark size={15} className="text-accent" /><span className="flex-1 text-[14px]">{l.title}</span><span className="text-[12px] text-faint">{l.places.length}</span></Link>)}
              </div>
            </section>
          )}
          {!!p.requests?.length && (
            <section className="mt-8">
              <SectionTitle>{p.me ? 'Seus pedidos' : `Pedidos de ${p.name.split(' ')[0]}`}</SectionTitle>
              <div className="grid gap-2">
                {p.requests.map((r) => (
                  <Link key={r.id} to={`/r/${r.id}`} className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">“{r.text}”</span>
                      <span className={cx('block text-[12px]', r.decided ? 'text-accent' : 'text-mute')}>{r.decided ? `fechado${r.place ? ` no ${r.place}` : ''}${r.time ? ` · ${r.time}` : ''}` : 'votação aberta · toque pra ver e votar'}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {p.relation !== 'amigos' && !p.me && (
            <p className="mt-6 text-[12px] text-faint">Os pedidos e rolês de {p.name.split(' ')[0]} aparecem aqui quando vocês forem amigos.</p>
          )}
          {!!p.groups?.length && (
            <section className="mt-8">
              <SectionTitle>Turmas públicas</SectionTitle>
              <div className="grid gap-2">
                {p.groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3">
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{g.name}</span><span className="text-[12px] text-faint">{g.members} pessoas</span></span>
                    {g.member
                      ? <Link to="/turmas" className="text-[12px] text-accent">você está</Link>
                      : <button onClick={async () => { const ok = await joinGroup(g.id); track('turma_join', { ok }); toast(ok ? 'Você entrou na turma' : 'Entre no app com cadastro pra participar'); qc.invalidateQueries({ queryKey: ['person', pid] }); qc.invalidateQueries({ queryKey: ['turmas'] }) }}
                          className="h-8 rounded-full bg-accent px-3 text-[12px] font-medium text-accent-ink">Entrar</button>}
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="mt-8">
            <SectionTitle>Avaliações</SectionTitle>
            <div className="grid gap-2">
              {!p.reviews.length && <p className="text-[13px] text-faint">Nenhuma avaliação ainda.</p>}
              {p.reviews.map((r, i) => (
                <div key={i} className="rounded-[18px] bg-surface p-4 text-[14px]">
                  <span className="text-accent">{VERDICT_LABEL[r.verdict as keyof typeof VERDICT_LABEL] ?? r.verdict}</span> · <Link to={`/lugar/${r.placeId}`} className="underline-offset-4 hover:underline">{r.name ?? 'lugar'}</Link>
                  {r.note && <p className="mt-1 text-ink/80">{r.note}</p>}
                  <p className="mt-1 text-[11px] text-faint">{timeAgo(r.at)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Page>
  )
}

/** lista de curadoria (pública, ou só pra amigos) */
export function ListPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['list', id], queryFn: () => listOf(id) })
  const l = q.data
  const places = (l?.places ?? []).map((x) => (Array.isArray(x) ? fromSnap(x) : null)).filter((x): x is Place => !!x)
  if (q.isFetched && !l) return <Page><TopBar /><p className="px-5 text-[14px] text-mute">Lista não encontrada.</p></Page>
  if (!l) return <Page><TopBar /><div className="grid gap-3 px-5"><Skeleton className="h-12" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div></Page>
  return (
    <Page>
      <TopBar title={l?.title ?? 'Lista'} />
      {l && (
        <div className="px-5 pb-16">
          <Link to={`/u/${l.owner.pid}`} className="flex items-center gap-2 text-[13px] text-mute"><Avatar name={l.owner.name} hue={l.owner.hue} size={22} />Curadoria de {l.owner.name}</Link>
          <div className="mt-4 grid gap-2">
            {!places.length && <p className="text-[13px] text-faint">Lista vazia. Salve lugares pela ficha de cada um.</p>}
            {places.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3">
                <Link to={`/lugar/${p.id}`} className="min-w-0 flex-1"><span className="block truncate text-[15px]">{p.name}</span><span className="text-[12px] text-mute">{p.tagline} · {p.hood}</span></Link>
                {l.mine && <button className="text-[12px] text-faint" onClick={async () => { await listAction(id, 'remove', p); qc.invalidateQueries({ queryKey: ['list', id] }) }}>tirar</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  )
}

/** salvar o lugar numa lista minha (ou criar uma) — usado na ficha do lugar */
export function SaveToList({ place }: { place: Place }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const toast = useToast()
  const qc = useQueryClient()
  // sempre carregado: o botão mostra se o lugar já está salvo (antes só abria a folha e não dava sinal nenhum)
  const lists = useQuery({ queryKey: ['my-lists'], queryFn: myLists, staleTime: 60_000 })
  const savedIn = (lists.data ?? []).filter((l) => l.places.some((x) => (Array.isArray(x) ? x[0] : x) === place.id))
  const has = (l: { places: unknown[] }) => l.places.some((x) => (Array.isArray(x) ? x[0] : x) === place.id)
  return (
    <>
      <button onClick={() => setOpen(true)} className={cx('hit flex items-center gap-2 text-[13px] underline-offset-4 hover:underline', savedIn.length ? 'text-accent' : 'text-mute')}>
        {savedIn.length ? <><Bookmark size={15} className="fill-accent" />Salvo em {savedIn.length === 1 ? savedIn[0].title : `${savedIn.length} listas`}</> : <><ListPlus size={15} />Salvar em lista</>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <p className="font-serif text-[28px] leading-tight">Salvar {place.name}</p>
        <div className="mt-4 grid gap-2">
          {lists.data === null && <p className="text-[13px] text-faint">Sem conexão agora.</p>}
          {lists.data?.map((l) => (
            <button key={l.id} onClick={async () => {
              const on = has(l)
              const ok = await listAction(l.id, on ? 'remove' : 'add', place); track('list_' + (on ? 'remove' : 'add'), {})
              if (!ok) { toast('Não deu pra salvar agora (sem conexão)'); return }
              await qc.invalidateQueries({ queryKey: ['my-lists'] }); toast(on ? `Tirado de ${l.title}` : `Salvo em ${l.title} · veja no Perfil`)
            }} className="flex h-12 items-center gap-3 rounded-full border border-line px-5 text-left text-[14px]">
              <Bookmark size={15} className={has(l) ? 'fill-accent text-accent' : 'text-mute'} /><span className="flex-1">{l.title}</span><span className="text-[11px] text-faint">{l.places.length}</span>
            </button>
          ))}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={async (e) => {
          e.preventDefault()
          if (!title.trim()) return
          const r = await createList(title.trim())
          if (!r) { toast('Precisa de cadastro e conexão pra criar listas'); return }
          await listAction(r.id, 'add', place); setTitle(''); await qc.invalidateQueries({ queryKey: ['my-lists'] }); toast(`Salvo na lista nova “${title.trim()}” · veja no Perfil`)
        }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova lista (ex.: botecos pra levar gringo)" className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 text-[14px] outline-none focus:border-accent" />
          <button type="submit" className="h-12 rounded-full bg-accent px-4 text-[13px] font-medium text-accent-ink">Criar</button>
        </form>
      </Sheet>
    </>
  )
}

/** buscar pessoas pelo nome e adicionar */
function FindPeople() {
  const [q, setQ] = useState('')
  const qc = useQueryClient()
  const r = useQuery({ queryKey: ['people', q.trim()], queryFn: () => searchPeople(q.trim()), enabled: q.trim().length >= 2, staleTime: 30_000 })
  return (
    <div className="mx-5 mb-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por @ ou nome" aria-label="Buscar amigos por @ ou nome" autoCapitalize="none" autoCorrect="off"
        className="h-11 w-full rounded-full border border-line bg-white/[0.03] px-4 text-[14px] outline-none placeholder:text-faint focus:border-accent" />
      {q.trim().length >= 2 && (
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-[20px] border border-line">
          {r.isFetching && !r.data && <p className="p-4 text-[13px] text-faint">Buscando…</p>}
          {r.data?.length === 0 && <p className="p-4 text-[13px] text-faint">{q.trim().startsWith('@') ? 'Ninguém com esse @ no rolê. Confira a grafia ou mande o convite do app pra pessoa.' : 'Ninguém com esse nome no rolê ainda.'}</p>}
          {r.data?.map((p) => (
            <PersonRow key={p.pid} p={p} right={p.relation === 'nenhuma'
              ? <button onClick={async () => { await personAction(p.pid, 'add'); qc.invalidateQueries({ queryKey: ['people'] }); qc.invalidateQueries({ queryKey: ['social'] }) }} aria-label={`Adicionar ${p.name}`} className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink"><UserPlus size={15} /></button>
              : <span className="text-[11px] text-faint">{p.relation === 'amigos' ? 'amigos' : p.relation === 'enviado' ? 'pedido enviado' : 'te pediu'}</span>} />
          ))}
        </div>
      )}
    </div>
  )
}

/** listas de quem está logado (vai no Perfil): era impossível achar uma lista depois de salvar */
export function MyLists() {
  const lists = useQuery({ queryKey: ['my-lists'], queryFn: myLists, staleTime: 60_000 })
  if (!lists.data?.length) return lists.isLoading ? <Skeleton className="mx-5 h-14" /> : <p className="px-5 text-[13px] text-faint">Nenhuma lista ainda. Na página de um lugar, toque em “Salvar em lista”.</p>
  return (
    <div className="mx-5 divide-y divide-line overflow-hidden rounded-[22px] border border-line">
      {lists.data.map((l) => (
        <Link key={l.id} to={`/lista/${l.id}`} className="flex items-center gap-3 px-4 py-3.5">
          <Bookmark size={16} className="text-accent" />
          <span className="flex-1 text-[14px]">{l.title}</span>
          <span className="text-[12px] text-faint">{l.places.length} {l.places.length === 1 ? 'lugar' : 'lugares'}</span>
        </Link>
      ))}
    </div>
  )
}

/** convidar alguém pro app (sem precisar já estar no rolê): link pessoal; quem entra vira seu amigo */
function InviteButton() {
  const toast = useToast()
  const me = useProfile().data
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    const token = await myInvite()
    setBusy(false)
    if (!token) { toast('Sem conexão agora'); return }
    const url = appInviteUrl(token)
    const text = `${me?.name?.split(' ')[0] ?? 'Eu'} te chamou pro rolê., o app pra decidir o rolê com a galera sem 200 mensagens no zap. Entra por aqui que a gente já vira amigo: ${url}`
    track('app_invite', {})
    try { if (navigator.share) { await navigator.share({ title: 'rolê.', text, url }); return } } catch { return }
    try { await navigator.clipboard.writeText(text); toast('Convite copiado') } catch { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
  }
  return (
    <button onClick={go} disabled={busy} className="mx-5 mb-4 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-[20px] border border-dashed border-accent/40 px-4 py-3 text-left">
      <Send size={17} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1"><span className="block text-[14px]">{busy ? 'Gerando convite…' : 'Convidar alguém pro rolê'}</span><span className="block text-[12px] text-mute">Quem entrar pelo seu link já vira seu amigo</span></span>
    </button>
  )
}

/** /a/:token — convite pessoal: mostra quem chamou; sem cadastro → cadastro e volta; com cadastro → vira amigo */
export function AppInvitePage() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const me = useProfile().data
  const q = useQuery({ queryKey: ['invite', token], queryFn: () => inviteInfo(token) })
  const [busy, setBusy] = useState(false)
  const auto = new URLSearchParams(location.search).get('auto') === '1'
  const accept = async () => {
    setBusy(true)
    // logo depois do cadastro o perfil ainda pode estar subindo: tenta algumas vezes
    let ok = false
    for (let i = 0; i < 5 && !ok; i++) { ok = !!(await acceptInvite(token))?.ok; if (!ok) await new Promise((r) => setTimeout(r, 1500)) }
    setBusy(false)
    track('app_invite_accept', { ok })
    if (!ok) { toast('Não deu agora; tente de novo daqui a pouco'); return }
    toast(`Agora você e ${q.data?.name.split(' ')[0] ?? 'quem te chamou'} são amigos`)
    qc.invalidateQueries({ queryKey: ['social'] })
    nav('/amigos', { replace: true })
  }
  useEffect(() => { if (auto && me?.onboarded && q.data && !q.data.me && q.data.relation !== 'amigos') void accept() }, [auto, me?.onboarded, q.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = q.data
  return (
    <Page>
      <TopBar title="Convite" />
      <div className="px-5 pb-10">
        {q.isLoading && <><Skeleton className="h-16 w-16 rounded-full" /><Skeleton className="mt-4 h-12 w-2/3" /></>}
        {q.isFetched && !p && <EmptyState title="Convite inválido" text="Esse link não existe mais. Peça outro pra quem te chamou." />}
        {p && (
          <>
            <Avatar name={p.name} hue={p.hue} size={72} src={avatarUrl(p.pid, p.photo)} />
            <h1 className="mt-4 font-serif text-[42px] leading-[0.95]">{p.name.split(' ')[0]} te chamou<br /><em className="text-accent">pro rolê.</em></h1>
            <p className="mt-3 text-[15px] text-mute">Aqui a galera descreve o rolê, a IA acha os lugares e todo mundo vota pelo link. Entrando, vocês já viram amigos e veem os rolês um do outro.</p>
            <div className="mt-6">
              {p.me ? <p className="text-[13px] text-faint">Esse é o seu próprio convite. Mande pra alguém!</p>
                : p.relation === 'amigos' ? <Link to="/amigos"><Button size="lg" className="w-full">Vocês já são amigos · abrir</Button></Link>
                : me?.onboarded ? <Button size="lg" className="w-full" disabled={busy} onClick={accept}>{busy ? 'Entrando…' : `Virar amigo de ${p.name.split(' ')[0]}`}</Button>
                : <Button size="lg" className="w-full" onClick={() => { try { localStorage.setItem('role.next', `/a/${token}?auto=1`) } catch { /* */ } nav('/onboarding') }}>Criar meu perfil</Button>}
            </div>
          </>
        )}
      </div>
    </Page>
  )
}
