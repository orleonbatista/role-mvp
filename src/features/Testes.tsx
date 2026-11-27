import { apiBase } from '../mocks/remote'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Cpu, Database, Download, MessageSquareHeart, Store } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { actClaim, adminClaims, adminUsers, openReports, resolveReport, checkAdmin, getAdminKey, setAdminKey, setUserRole } from '../mocks/remote'
import { useToast } from '../ui/Toast'
import { cx } from '../ui/primitives'
import { getLLMOverride, llmStatus, setLLMOverride } from '../mocks/llm'
import { AnimatedNumber, Button, Page, SectionTitle, Skeleton, Tag, TopBar } from '../ui/primitives'
import { ease } from '../ui/motion'
import { exportTestes, useProfile, useSaveProfile, useGlobalStats, usePlacesReview, useReviewPlace, useSubmissions, useSync, useTestes, type TestesData } from '../lib/api'
import { mapsUrlOf } from '../lib/places'
import { SubmissionReview } from './SubmissionReview'
import { Link } from 'react-router'
import { FUNNEL } from '../lib/track'
import { timeAgo } from '../lib/labels'

const FACES = ['', '😖', '😕', '😐', '🙂', '🤩']

/** Painel do testador: funil do loop principal, feedback, leads (fake door) e export. */
function LLMCard() {
  const [st, setSt] = useState<Awaited<ReturnType<typeof llmStatus>> | null>(null)
  const [url, setUrl] = useState(getLLMOverride() ?? '')
  const check = () => { setSt(null); llmStatus().then(setSt) }
  useEffect(check, [])
  return (
    <section className="mt-7">
      <SectionTitle>IA (LLM)</SectionTitle>
      <div className="mx-5 rounded-[20px] border border-line p-4">
        <p className="flex items-center gap-2 text-[14px]">
          <Cpu size={15} className="text-mute" />
          <span className={`size-2 rounded-full ${st === null ? 'bg-faint animate-pulse' : st.ok ? 'bg-accent' : 'bg-amber-400'}`} />
          {st === null ? 'verificando…' : st.ok ? 'LLM no ar' : st.mode === 'off' ? 'Só regras' : 'LLM fora do ar'}
        </p>
        {st && <p className="mt-1 break-all text-xs text-mute">{st.detail}</p>}
        <div className="mt-3 flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL do gateway (opcional, só neste aparelho)" aria-label="URL do gateway"
            className="h-10 min-w-0 flex-1 rounded-[12px] border border-line bg-bg px-3 text-xs outline-none placeholder:text-faint focus:border-accent/50" />
          <Button variant="soft" className="h-10 px-3 text-xs" onClick={() => { setLLMOverride(url.trim() || null); check() }}>Salvar</Button>
        </div>
      </div>
    </section>
  )
}

/** backend do PC: status + chave da curadoria (habilita fila global, publicar e métricas de todos) */
function BackendCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const sync = useSync()
  const [key, setKey] = useState(getAdminKey())
  async function save() {
    setAdminKey(key.trim() || null)
    if (key.trim() && !(await checkAdmin())) { toast('Chave não confere'); setAdminKey(null) }
    else toast(key.trim() ? 'Curadoria liberada neste aparelho' : 'Chave removida')
    for (const k of ['sync', 'submissions', 'testes-global']) qc.invalidateQueries({ queryKey: [k] })
  }
  const st = sync.data
  return (
    <section className="mt-7">
      <SectionTitle>Backend (dados compartilhados)</SectionTitle>
      <div className="mx-5 rounded-[20px] border border-line p-4">
        <p className="flex items-center gap-2 text-[14px]">
          <Database size={15} className="text-mute" />
          <span className={`size-2 rounded-full ${!st ? 'bg-faint animate-pulse' : st.online ? 'bg-accent' : 'bg-amber-400'}`} />
          {!st ? 'verificando…' : st.online ? 'No ar: votos, sugestões e curadoria sincronizam entre aparelhos' : 'Fora do ar: cada aparelho guarda o seu (modo link)'}
        </p>
        <div className="mt-3 flex gap-2">
          <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" placeholder="Chave da curadoria (só pra quem cura)" aria-label="Chave da curadoria"
            className="h-10 min-w-0 flex-1 rounded-[12px] border border-line bg-bg px-3 text-xs outline-none placeholder:text-faint focus:border-accent/50" />
          <Button variant="soft" className="h-10 px-3 text-xs" onClick={save}>Salvar</Button>
        </div>
        {st?.admin && <p className="mt-2 text-[12px] text-accent">Curadoria ativa neste aparelho: aprovar publica pra todo mundo.</p>}
      </div>
    </section>
  )
}

/** modo demo: lugares/pedidos/curadores fictícios, só pra apresentar o app (recarrega pra trocar o catálogo) */
function DemoCard() {
  const { data: me } = useProfile()
  const save = useSaveProfile()
  if (!me) return null
  return (
    <section className="mt-7">
      <SectionTitle>Modo demonstração</SectionTitle>
      <button onClick={async () => { await save.mutateAsync({ demoMode: !me.demoMode }); location.reload() }}
        className="mx-5 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-[20px] border border-line p-4 text-left">
        <span className="flex-1">
          <span className="block text-[14px]">{me.demoMode ? 'Ligado: conteúdo fictício visível' : 'Desligado: só conteúdo real'}</span>
          <span className="block text-xs text-mute">Lugares, pedidos e curadores fictícios para apresentar o app. Deixe desligado nos testes com amigos.</span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${me.demoMode ? 'bg-accent' : 'bg-white/15'}`}>
          <span className={`absolute top-1 size-5 rounded-full bg-bg ${me.demoMode ? 'right-1' : 'left-1'}`} />
        </span>
      </button>
    </section>
  )
}

/** catálogo comunitário: lugares que as regras/LLM marcaram (spam, link, ofensa) esperam a curadoria */
function PlacesReview({ enabled }: { enabled: boolean }) {
  const { data } = usePlacesReview(enabled)
  const act = useReviewPlace()
  const pending = (data ?? []).filter((r) => r.status === 'revisao')
  if (!enabled) return null
  return (
    <section className="mt-8">
      <SectionTitle aside={<span className="text-xs text-faint">catálogo da comunidade</span>}>Lugares em revisão{pending.length ? ` · ${pending.length}` : ''}</SectionTitle>
      <div className="grid gap-2.5 px-5">
        {!pending.length && <p className="rounded-[18px] border border-dashed border-line px-4 py-4 text-center text-[13px] text-faint">Nada pra revisar. Lugares sugeridos sem sinal de spam entram direto.</p>}
        {pending.map((r) => {
          const [id, name, , hood] = r.place as [string, string, string, string]
          return (
            <div key={id} className="rounded-[20px] border border-amber-400/30 bg-surface p-4">
              <p className="font-serif text-[20px] leading-tight">{name} <span className="text-[13px] text-mute">· {hood}</span></p>
              {r.comment && <p className="mt-1 text-[13px] text-ink/80">“{r.comment}”</p>}
              <p className="mt-1 text-[12px] text-amber-300">{r.motivo ?? 'marcado pela moderação'}</p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="soft" className="h-10 px-4 text-xs" disabled={act.isPending} onClick={() => act.mutate({ id, status: 'recusado' })}>Recusar</Button>
                <Button className="h-10 px-4 text-xs" disabled={act.isPending} onClick={() => act.mutate({ id, status: 'ok' })}>Liberar</Button>
                <a href={mapsUrlOf(id)} target="_blank" rel="noreferrer" className="ml-auto text-[12px] text-mute underline-offset-4 hover:underline">ver no Maps</a>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function TestesPage() {
  const local = useTestes().data
  const sync = useSync().data
  const canGlobal = !!(sync?.online && sync.admin)
  const global = useGlobalStats(canGlobal).data
  const [scope, setScope] = useState<'todos' | 'aqui'>('todos')
  const data: TestesData | undefined = local && (scope === 'todos' && canGlobal && global
    ? { ...local, counts: global.counts, total: global.total, firstAt: global.firstAt, lastAt: global.lastAt, bySrc: global.bySrc as TestesData['bySrc'],
        feedback: global.feedback, leads: global.leads.map((l) => ({ ...l, id: `${l.at}`, placeName: l.placeName ?? l.placeId })),
        recent: global.recent.map((e) => ({ ...e, id: `${e.device}-${e.at}` })) }
    : local)
  const subs = useSubmissions()
  const queue = [...(subs.data ?? [])].sort((a, b) => Number(b.status === 'pendente') - Number(a.status === 'pendente') || b.at - a.at)
  useEffect(() => { if (location.hash === '#fila' && subs.data) setTimeout(() => document.getElementById('fila')?.scrollIntoView({ behavior: 'smooth' }), 300) }, [subs.data])

  async function download() {
    const json = await exportTestes()
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `role-testes-${new Date().toISOString().slice(0, 16).replace(':', 'h')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // RBAC: só admin (tudo) e curador (filas de revisão); usuário vê o aviso — a chave da curadoria fica como acesso de emergência
  if (sync && !sync.curator) return (
    <Page>
      <TopBar title="Área restrita" />
      <div className="px-5">
        <p className="font-serif text-[32px] leading-tight">Só pra admins e curadores<span className="text-accent">.</span></p>
        <p className="mt-3 text-[14px] text-mute">Entre com a conta Google de admin (Perfil → Conta e dados) neste aparelho. {sync.online ? '' : 'O servidor do rolê está fora do ar agora.'}</p>
        <details className="mt-8 text-[13px] text-faint"><summary className="cursor-pointer">Tenho a chave da curadoria</summary><BackendCard /></details>
      </div>
    </Page>
  )
  if (!data) return <Page><TopBar title="Painel de testes" /><div className="grid gap-3 px-5"><Skeleton className="h-60" /><Skeleton className="h-32" /></div></Page>
  const top = Math.max(1, ...FUNNEL.map((f) => data.counts[f.name] ?? 0))
  const avg = data.feedback.length ? data.feedback.reduce((a, f) => a + f.score, 0) / data.feedback.length : 0

  return (
    <Page>
      <TopBar title={sync?.admin ? 'Painel do admin' : 'Painel da curadoria'} right={<Button variant="soft" className="h-9 px-3 text-xs" icon={<Download size={13} />} onClick={download}>Exportar</Button>} />
      {canGlobal && global && (
        <div className="mx-5 mb-3 grid grid-cols-2 rounded-full bg-white/[0.05] p-1 text-[13px]">
          {(['todos', 'aqui'] as const).map((k) => (
            <button key={k} onClick={() => setScope(k)} className={cx('rounded-full py-2 transition-colors', scope === k ? 'bg-accent text-accent-ink' : 'text-mute')}>
              {k === 'todos' ? `Todos (${global.devices} aparelhos)` : 'Este aparelho'}
            </button>
          ))}
        </div>
      )}
      <p className="px-5 text-sm text-mute">
        {scope === 'todos' && canGlobal && global
          ? <>Todos os aparelhos · {data.total} eventos · {global.totals.requests} pedidos, {global.totals.votes} votos, {global.totals.suggestions} sugestões, {global.totals.decided} fechados.
              {global.people && <> Pessoas: {global.people.users} com perfil ({global.people.withGoogle} com Google) · {global.people.reviews} avaliações · {global.people.activeGroups} turmas ativas de {global.people.groups}.
                {' '}Regiões: {Object.entries(global.people.byHood).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h, n]) => `${h} ${n}`).join(', ') || '—'}.
                {' '}Gostos: {Object.entries(global.people.byNiche).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h, n]) => `${h} ${n}`).join(', ') || '—'}.
                {' '}IA aprendendo: {global.people.examples ?? 0} exemplos ({global.people.corrected ?? 0} corrigidos por gente).
                {' '}Pedem e o app não cobre: {global.people.unmet?.map(([t, n]) => `${t} ${n}`).join(', ') || '—'}.</>}
              {global.base && <> Base regional: {global.base.places} lugares em {global.base.areas} regiões.</>}</>
          : <>Dados deste aparelho{data.firstAt ? ` desde ${new Date(data.firstAt).toLocaleDateString('pt-BR')}` : ''} · {data.total} eventos.{!canGlobal && ' Com o backend no ar e a chave da curadoria, aqui aparecem todos os aparelhos.'}</>}
      </p>

      {canGlobal && <UsersCard />}
      {sync?.curator && <ReportsCard />}
      {canGlobal && <ClaimsCard />}
      {canGlobal && global?.funnel && <FunnelCard f={global.funnel} />}
      {canGlobal && global?.apis && <ApisCard apis={global.apis} />}
      <BackendCard />
      <LLMCard />
      <DemoCard />

      <section className="mt-7">
        <SectionTitle>Funil do loop</SectionTitle>
        <div className="grid gap-2.5 px-5">
          {FUNNEL.map((f, i) => {
            const n = data.counts[f.name] ?? 0
            const prev = i ? data.counts[FUNNEL[i - 1].name] ?? 0 : 0
            const conv = i && prev && n <= prev ? Math.round((n / prev) * 100) : null
            return (
              <div key={f.name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{f.label}</span>
                  <span className="text-mute"><AnimatedNumber value={n} />{conv !== null && <span className="ml-2 text-faint">{conv}%</span>}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(n / top) * 100}%` }} transition={{ duration: 0.9, ease, delay: i * 0.05 }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mx-5 mt-4 grid grid-cols-2 gap-2">
          {(() => {
            const a = data.counts.request_curated ?? 0, b = data.counts.request_uncurated ?? 0
            return (
              <>
                <div className="rounded-[18px] bg-surface p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-mute">pedidos com curado</p>
                  <p className="mt-1 font-serif text-[28px] leading-none text-accent">{a + b ? Math.round((a / (a + b)) * 100) : 0}%</p>
                  <p className="mt-1 text-[11px] text-faint">{a} de {a + b} pedidos</p>
                </div>
                <div className="rounded-[18px] bg-surface p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-mute">lugares curados</p>
                  <p className="mt-1 font-serif text-[28px] leading-none">{data.counts.community_place ?? 0}</p>
                  <p className="mt-1 text-[11px] text-faint">indicações confirmadas</p>
                </div>
              </>
            )
          })()}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5 px-5">
          {['clarify_shown', 'curation_invite_shown', 'curation_invite_click', 'fundador_invite', 'indicar_opened', 'reserve_intent', 'lead_submitted', 'story_shared', 'cta_new_request', 'vote_page_opened', 'feedback_sent'].map((k) => (
            <Tag key={k}>{k}: {data.counts[k] ?? 0}</Tag>
          ))}
        </div>
      </section>

      <PlacesReview enabled={canGlobal} />

      <section className="mt-8" id="fila">
        <SectionTitle aside={<Link to="/divulgar" className="text-xs text-faint hover:text-ink">+ enviar</Link>}>
          Fila de eventos{queue.some((q) => q.status === 'pendente') ? ` · ${queue.filter((q) => q.status === 'pendente').length} pendente(s)` : ''}
        </SectionTitle>
        <div className="grid gap-2.5 px-5">
          {queue.length ? queue.map((q) => <SubmissionReview key={q.id} s={q} compact />)
            : <p className="rounded-[18px] border border-dashed border-line px-4 py-5 text-center text-[13px] text-faint">Nenhum envio ainda. Os links de curadoria que chegarem por WhatsApp aparecem aqui.</p>}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle aside={<span className="text-xs text-faint">primeiro acesso</span>}>Por origem</SectionTitle>
        <div className="mx-5 overflow-hidden rounded-[18px] border border-line text-[12px]">
          <div className="grid grid-cols-7 gap-1 bg-white/[0.04] px-3 py-2 text-mute">
            <span className="col-span-2">origem</span><span>abriu</span><span>votou</span><span>cadastro</span><span>story</span><span>grupos</span>
          </div>
          {Object.entries(data.bySrc).sort((a, b) => b[1].app_open - a[1].app_open).map(([src, r]) => (
            <div key={src} className="grid grid-cols-7 gap-1 border-t border-line px-3 py-2">
              <span className="col-span-2 truncate">{({ ig: 'Instagram', wa: 'WhatsApp', direto: 'direto', evt: 'evento (sem @)' } as Record<string, string>)[src] ?? (src.startsWith('cr_') ? `@${src.slice(3)}` : src)}</span>
              <span>{r.app_open}</span><span>{r.vote_cast}</span><span>{r.onboarding_done}</span><span>{r.story_shared}</span><span>{r.event_group_created ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      {(Object.keys(data.niches).length > 0 || Object.keys(data.unmet).length > 0) && (
        <section className="mt-8">
          <SectionTitle>O que estão pedindo</SectionTitle>
          <div className="flex flex-wrap gap-1.5 px-5">
            {Object.entries(data.niches).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Tag key={k} tone="accent">{k} · {v}</Tag>)}
            {Object.entries(data.unmet).map(([k, v]) => <Tag key={k}>sem catálogo: {k} · {v}</Tag>)}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle aside={data.feedback.length ? <span className="text-xs text-faint">média {avg.toFixed(1)} {FACES[Math.round(avg)]}</span> : null}>
          Feedback
        </SectionTitle>
        <div className="grid gap-2 px-5">
          {!data.feedback.length && <p className="flex items-center gap-2 text-sm text-faint"><MessageSquareHeart size={14} /> Nenhum ainda — botão no canto superior das telas.</p>}
          {data.feedback.map((f) => (
            <div key={f.id} className="rounded-[18px] bg-surface p-3.5">
              <p className="text-xs text-mute">{FACES[f.score]} · {f.path} · {timeAgo(f.at)}</p>
              {f.text && <p className="mt-1.5 text-[14px]">{f.text}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle aside={<span className="text-xs text-faint">fake door</span>}>Pedidos de reserva</SectionTitle>
        <div className="grid gap-2 px-5">
          {!data.leads.length && <p className="flex items-center gap-2 text-sm text-faint"><Store size={14} /> Nenhum lead ainda.</p>}
          {data.leads.map((l) => (
            <div key={l.id} className="rounded-[18px] border border-line p-3.5">
              <p className="text-[14px]">{l.placeName} · {l.people} pessoas</p>
              <p className="mt-0.5 text-xs text-mute">{l.day} {l.time} · {l.name}{l.contact ? ` · ${l.contact}` : ''} · {timeAgo(l.at)}</p>
              {l.note && <p className="mt-1 text-xs text-ink/70">“{l.note}”</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle>Últimos eventos</SectionTitle>
        <div className="mx-5 divide-y divide-line rounded-[18px] border border-line font-mono text-[11px]">
          {data.recent.map((e) => (
            <div key={e.id} className="flex justify-between gap-3 px-3 py-2">
              <span className="text-ink/85">{e.name}</span>
              <span className="truncate text-faint">{e.path} · {timeAgo(e.at)}</span>
            </div>
          ))}
        </div>
      </section>
    </Page>
  )
}

/* uso das APIs no mês (soma de todos os aparelhos) contra a franquia grátis do Google, e a fila de IA */
const SKUS: [string, string, number][] = [
  ['text_pro', 'Busca (Text Search Pro)', 5000], ['text_ent_atm', 'Busca com confirmação (Enterprise+Atmosphere)', 1000],
  ['details_ent', 'Ficha ao vivo (Details Enterprise)', 1000], ['details_ent_atm', 'Ficha de grupo (Details Ent.+Atmosphere)', 1000],
  ['photo', 'Fotos', 1000], ['static_map', 'Mapa das opções (Static Maps)', 10000],
]
function ApisCard({ apis }: { apis: { month: Record<string, number>; today: Record<string, number> } }) {
  const [llm, setLlm] = useState<{ provider: string; configured: boolean; model: string; coolingDown: boolean; ok: number; fail: number }[] | null>(null)
  useEffect(() => {
    apiBase().then((b) => { if (b) fetch(`${b}/health`).then((r) => r.json()).then((j) => setLlm(j.providers ?? null)).catch(() => {}) })
  }, [])
  const day = new Date().getUTCDate(), days = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate()
  return (
    <section className="mt-7">
      <SectionTitle aside={<span className="text-xs text-faint">mês atual · todos os aparelhos</span>}>APIs e limites</SectionTitle>
      <div className="mx-5 grid gap-3 rounded-[20px] border border-line p-4">
        {SKUS.map(([k, label, cap]) => {
          const n = apis.month[k] ?? 0
          const proj = Math.round((n / Math.max(1, day)) * days) // ritmo atual projetado pro mês
          const pct = Math.min(100, (n / cap) * 100)
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-ink/85">{label}</span>
                <span className={proj > cap ? 'text-amber-300' : 'text-mute'}>{n} / {cap.toLocaleString('pt-BR')}{apis.today[k] ? ` · hoje ${apis.today[k]}` : ''}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full ${pct > 80 ? 'bg-amber-300' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></div>
              {proj > cap && <p className="mt-1 text-[11px] text-amber-300">No ritmo atual passa da franquia grátis (~{proj} no mês).</p>}
            </div>
          )
        })}
        <p className="text-[11px] text-faint">Conta pelo que os aparelhos registram (pode faltar quem abriu sem o servidor no ar). O número oficial e as cotas diárias ficam no Google Cloud → APIs e serviços → Métricas/Cotas.</p>
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-[13px] text-ink/85">IA — fila de provedores (desde o último reinício do gateway)</p>
          {!llm && <p className="text-[12px] text-faint">carregando…</p>}
          {llm?.map((p) => (
            <p key={p.provider} className="flex items-center gap-2 text-[12px]">
              <span className={`size-2 rounded-full ${!p.configured ? 'bg-white/20' : p.coolingDown ? 'bg-amber-300' : 'bg-accent'}`} />
              <span className="w-24 text-ink/85">{p.provider}</span>
              <span className="flex-1 truncate text-mute">{p.configured ? p.model : 'sem chave'}</span>
              <span className="text-mute">{p.ok} ok · {p.fail} falha</span>
            </p>
          ))}
          <p className="mt-2 text-[11px] text-faint">Limites grátis: Gemini por minuto/dia no AI Studio (aistudio.google.com → Uso); Groq e OpenRouter nos painéis deles.</p>
        </div>
      </div>
    </section>
  )
}

/* admin: pessoas e papéis (curador aprova lugares e eventos; admin só pela lista de e-mails no servidor) */
function UsersCard() {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['admin-users'], queryFn: adminUsers, staleTime: 15_000 })
  const toast = useToast()
  return (
    <section className="mt-7">
      <SectionTitle aside={<span className="text-xs text-faint">{users.data?.length ?? 0} perfis</span>}>Pessoas e papéis</SectionTitle>
      <div className="mx-5 divide-y divide-line overflow-hidden rounded-[20px] border border-line">
        {users.data?.length === 0 && <p className="p-4 text-[13px] text-faint">Ninguém cadastrado ainda.</p>}
        {users.data?.map((u) => (
          <div key={u.device} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px]">{u.name || '—'} <span className="text-faint">· {u.hood ?? '—'}</span></p>
              <p className="truncate text-[11px] text-faint">{u.email ?? 'sem conta Google'}</p>
            </div>
            {u.role === 'admin' ? <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] text-accent">admin</span>
              : u.google ? (
                <select aria-label={`Papel de ${u.name}`} value={u.role} className="h-9 rounded-full border border-line bg-bg px-3 text-[12px]"
                  onChange={async (e) => {
                    const ok = await setUserRole(u.device, e.target.value as 'usuario' | 'curador')
                    toast(ok ? 'Papel atualizado' : 'Não deu pra mudar o papel'); qc.invalidateQueries({ queryKey: ['admin-users'] })
                  }}>
                  <option value="usuario">usuário</option><option value="curador">curador</option>
                </select>
              ) : <span className="text-[11px] text-faint">usuário</span>}
          </div>
        ))}
      </div>
      <p className="mx-5 mt-2 text-[11px] text-faint">Papel só pra quem entrou com Google. Pra adicionar outro admin, inclua o e-mail em llm-gateway/data/admins.json no PC.</p>
    </section>
  )
}

/* admin: funil dos últimos 30 dias — onde as pessoas e os pedidos param */
function FunnelCard({ f }: { f: { people: { label: string; n: number }[]; requests: { label: string; n: number }[] } }) {
  const block = (title: string, rows: { label: string; n: number }[]) => {
    const top = Math.max(1, rows[0]?.n ?? 1)
    return (
      <div className="mt-3">
        <p className="mb-1.5 text-[12px] text-faint">{title}</p>
        {rows.map((r, i) => (
          <div key={r.label} className="mb-1.5">
            <div className="flex justify-between text-[12px]"><span>{r.label}</span><span className="text-mute">{r.n}{i > 0 && rows[i - 1].n ? ` · ${Math.round((r.n / rows[i - 1].n) * 100)}%` : ''}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.n / top) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <section className="mt-7">
      <SectionTitle aside={<span className="text-xs text-faint">30 dias</span>}>Funil</SectionTitle>
      <div className="mx-5 rounded-[20px] border border-line p-4">
        {block('Pessoas (aparelhos) por etapa · % sobre a etapa anterior', f.people)}
        {block('Pedidos', f.requests)}
      </div>
    </section>
  )
}

/* curadoria: fila de denúncias (avaliações, recados, sugestões) */
function ReportsCard() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['reports'], queryFn: openReports, staleTime: 15_000 })
  const KIND = { review: 'avaliação', message: 'recado', suggestion: 'sugestão', photo: 'foto' } as const
  return (
    <section className="mt-7">
      <SectionTitle aside={<span className="text-xs text-faint">{q.data?.length ?? 0} abertas</span>}>Denúncias</SectionTitle>
      <div className="mx-5 grid gap-2">
        {q.data?.length === 0 && <p className="rounded-[20px] border border-dashed border-line p-4 text-[13px] text-faint">Nenhuma denúncia aberta.</p>}
        {q.data?.map((r) => (
          <div key={r.kind + r.id} className="rounded-[20px] border border-line p-4">
            <p className="text-[11px] text-faint">{KIND[r.kind]} de {r.who} · {r.count} {r.count === 1 ? 'denúncia' : 'denúncias'} · {r.reasons.join(', ')}</p>
            <p className="mt-1.5 text-[14px]">{r.text}</p>
            <div className="mt-3 flex gap-2">
              <button className="h-9 rounded-full bg-[#ff6b6b] px-4 text-[12px] font-medium text-black" onClick={async () => { await resolveReport(r.kind, r.id, 'remove'); qc.invalidateQueries({ queryKey: ['reports'] }) }}>Remover</button>
              <button className="h-9 rounded-full border border-line px-4 text-[12px]" onClick={async () => { await resolveReport(r.kind, r.id, 'keep'); qc.invalidateQueries({ queryKey: ['reports'] }) }}>Manter</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* admin: casas que pediram a página (confirmar ligando no telefone do Google) e destaque pago */
function ClaimsCard() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['claims'], queryFn: adminClaims, staleTime: 15_000 })
  const act = async (pid: string, a: 'approve' | 'reject' | 'sponsor', days?: number) => { await actClaim(pid, a, days); qc.invalidateQueries({ queryKey: ['claims'] }) }
  return (
    <section className="mt-7">
      <SectionTitle aside={<span className="text-xs text-faint">{q.data?.filter((c) => c.status === 'pendente').length ?? 0} pendentes</span>}>Casas</SectionTitle>
      <div className="mx-5 grid gap-2">
        {q.data?.length === 0 && <p className="rounded-[20px] border border-dashed border-line p-4 text-[13px] text-faint">Nenhuma casa pediu a página ainda.</p>}
        {q.data?.map((c) => (
          <div key={c.placeId} className="rounded-[20px] border border-line p-4">
            <p className="text-[14px]">{c.claim?.placeName ?? c.placeId} <span className="text-[11px] text-faint">· {c.status}{c.sponsoredUntil && c.sponsoredUntil > Date.now() ? ` · patrocinado até ${new Date(c.sponsoredUntil).toLocaleDateString('pt-BR')}` : ''}</span></p>
            <p className="mt-1 text-[12px] text-mute">{c.claim?.name} · {c.claim?.role} · {c.claim?.contact}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
              {c.status === 'pendente' && <button className="h-9 rounded-full bg-accent px-4 font-medium text-accent-ink" onClick={() => act(c.placeId, 'approve')}>Verificar</button>}
              {c.status === 'pendente' && <button className="h-9 rounded-full border border-line px-4" onClick={() => act(c.placeId, 'reject')}>Recusar</button>}
              {c.status === 'verificada' && <button className="h-9 rounded-full border border-line px-4" onClick={() => act(c.placeId, 'sponsor', 30)}>Destacar 30 dias</button>}
              {c.status === 'verificada' && !!c.sponsoredUntil && <button className="h-9 rounded-full border border-line px-4" onClick={() => act(c.placeId, 'sponsor', 0)}>Tirar destaque</button>}
              <a className="flex h-9 items-center rounded-full border border-line px-4" href={`${import.meta.env.BASE_URL}lugar/${c.placeId}`}>Ver página</a>
            </div>
          </div>
        ))}
      </div>
      <p className="mx-5 mt-2 text-[11px] text-faint">Verifique ligando no telefone da ficha do Google antes de aprovar. O destaque aparece marcado como patrocinado, no máximo 1 por votação e só quando encaixa no pedido.</p>
    </section>
  )
}
