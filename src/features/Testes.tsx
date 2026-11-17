import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Cpu, Download, MessageSquareHeart, Store } from 'lucide-react'
import { getLLMOverride, llmStatus, setLLMOverride } from '../mocks/llm'
import { AnimatedNumber, Button, Page, SectionTitle, Skeleton, Tag, TopBar } from '../ui/primitives'
import { ease } from '../ui/motion'
import { exportTestes, useSubmissions, useTestes } from '../lib/api'
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

export function TestesPage() {
  const { data } = useTestes()
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

  if (!data) return <Page><TopBar title="Painel de testes" /><div className="grid gap-3 px-5"><Skeleton className="h-60" /><Skeleton className="h-32" /></div></Page>
  const top = Math.max(1, ...FUNNEL.map((f) => data.counts[f.name] ?? 0))
  const avg = data.feedback.length ? data.feedback.reduce((a, f) => a + f.score, 0) / data.feedback.length : 0

  return (
    <Page>
      <TopBar title="Painel de testes" right={<Button variant="soft" className="h-9 px-3 text-xs" icon={<Download size={13} />} onClick={download}>Exportar</Button>} />
      <p className="px-5 text-sm text-mute">
        Dados deste aparelho{data.firstAt ? ` desde ${new Date(data.firstAt).toLocaleDateString('pt-BR')}` : ''} · {data.total} eventos.
        Exporte o JSON de cada testador para consolidar.
      </p>

      <LLMCard />

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
        <div className="mt-4 flex flex-wrap gap-1.5 px-5">
          {['clarify_shown', 'reserve_intent', 'lead_submitted', 'story_opened', 'story_shared', 'cta_new_request', 'vote_page_opened', 'feedback_sent'].map((k) => (
            <Tag key={k}>{k}: {data.counts[k] ?? 0}</Tag>
          ))}
        </div>
      </section>

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
