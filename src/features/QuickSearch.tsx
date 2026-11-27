import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { History, LoaderCircle, RotateCcw, Send, Sparkles, Users, X } from 'lucide-react'
import { Cover, Page, Tag, TopBar, cx } from '../ui/primitives'
import { PlacePhoto } from '../ui/PlacePhoto'
import { placeIcon } from '../ui/placeIcon'
import { fitLabel, KIND_LABEL, nicheLabel, priceLabel } from '../lib/labels'
import { kmTo, fmtKm } from '../lib/hours'
import { useProfile } from '../lib/api'
import { track } from '../lib/track'
import { GUARD_REPLY, screen } from '../lib/guard'
import type { Criteria, Ranked } from '../lib/types'

/* Busca rápida em conversa: a pessoa descreve, a IA devolve lugares dentro da própria conversa e cada mensagem nova
   refina a anterior ("mais barato", "perto do metrô"). Protegida contra prompt injection por desenho: a IA só
   transforma o texto em critérios (JSON) e escolhe entre lugares conhecidos; a fala da "IA" aqui é montada pelo app,
   nunca texto livre do modelo. Filtro de entrada antes de qualquer chamada (app e servidor).
   Histórico: a conversa fica nesta sessão (voltar de um lugar não apaga nada) e as buscas ficam no aparelho. */

type Msg = { id: number; role: 'user'; text: string } | { id: number; role: 'ai'; text: string; results?: Ranked[]; query?: string }
const CONV_KEY = 'role.quick.conv'
const HIST_KEY = 'role.quick.hist'
const MAX_TURNS = 8
const load = <T,>(k: string, store: Storage, fb: T): T => { try { return JSON.parse(store.getItem(k) ?? '') as T } catch { return fb } }

function describe(c: Criteria, n: number): string {
  if (!n) return 'Não achei nada com isso. Tenta outro bairro, outro estilo ou um orçamento maior.'
  const what = c.niches.length ? c.niches.slice(0, 2).map((x) => nicheLabel(x).toLowerCase()).join(' e ') : 'lugares'
  const bits = [c.hood && `em ${c.hood}`, c.budget && `até R$ ${c.budget}`, c.groupSize > 1 && `pra ${c.groupSize}`, c.when?.label].filter(Boolean)
  return `Achei ${n} ${n === 1 ? 'opção' : 'opções'} de ${what}${bits.length ? ` ${bits.join(', ')}` : ''}. Quer refinar? Ex.: “mais barato”, “com área externa”, “perto do metrô”.`
}

export function QuickSearch() {
  const [sp] = useSearchParams()
  const [text, setText] = useState(sp.get('q') ?? '')
  const [msgs, setMsgs] = useState<Msg[]>(() => load<Msg[]>(CONV_KEY, sessionStorage, []))
  const [hist, setHist] = useState<string[]>(() => load<string[]>(HIST_KEY, localStorage, []))
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const me = useProfile().data
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { try { sessionStorage.setItem(CONV_KEY, JSON.stringify(msgs.slice(-16))) } catch { /* cheio */ } }, [msgs])
  useEffect(() => { if (msgs.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length])

  const userTurns = msgs.filter((m) => m.role === 'user') as Extract<Msg, { role: 'user' }>[]
  const lastQuery = [...msgs].reverse().find((m): m is Extract<Msg, { role: 'ai' }> => m.role === 'ai' && !!m.query)?.query ?? ''

  async function send(raw: string) {
    if (busy) return
    const g = screen(raw)
    const id = Date.now()
    setText('')
    if (!g.ok) {
      setMsgs((m) => [...m, { id, role: 'user', text: raw.slice(0, 300) }, { id: id + 1, role: 'ai', text: GUARD_REPLY[g.reason] }])
      track('quick_guard', { reason: g.reason })
      return
    }
    if (userTurns.length >= MAX_TURNS) {
      setMsgs((m) => [...m, { id, role: 'user', text: g.text }, { id: id + 1, role: 'ai', text: 'Essa conversa ficou longa. Toque em “Nova conversa” pra começar outra busca.' }])
      return
    }
    // a mensagem nova refina a conversa: junta as últimas falas (até 3) numa busca só
    const query = [...userTurns.slice(-2).map((m) => m.text), g.text].join('. ').slice(0, 300)
    setMsgs((m) => [...m, { id, role: 'user', text: g.text }])
    setBusy(true)
    track('quick_search_sent', { turn: userTurns.length + 1 })
    try {
      const r = await fetch('/api/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: query }) })
      const d = (await r.json()) as { criteria: Criteria; results: Ranked[] }
      setMsgs((m) => [...m, { id: id + 1, role: 'ai', text: describe(d.criteria, d.results.length), results: d.results.slice(0, 6), query }])
      const h = [g.text, ...hist.filter((x) => x !== g.text)].slice(0, 12)
      setHist(h); try { localStorage.setItem(HIST_KEY, JSON.stringify(h)) } catch { /* */ }
    } catch {
      setMsgs((m) => [...m, { id: id + 1, role: 'ai', text: 'Deu ruim na busca agora. Tenta de novo em instantes.' }])
    } finally { setBusy(false) }
  }
  const reset = () => { setMsgs([]); try { sessionStorage.removeItem(CONV_KEY) } catch { /* */ } }

  const footer = (
      <form className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text) }}>
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} maxLength={300} enterKeyHint="send"
          placeholder={lastQuery ? 'Refinar: “mais barato”, “com área externa”…' : 'ex.: café calmo pra trabalhar perto de mim'} aria-label="Mensagem pra busca"
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent" />
        <button type="submit" aria-label="Enviar" disabled={busy || !text.trim()} className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
  )
  return (
    <Page className="pb-6" footer={footer}>
      <TopBar title="Busca rápida" right={msgs.length ? <button onClick={reset} className="flex items-center gap-1 text-[12px] text-accent"><RotateCcw size={13} />Nova conversa</button> : undefined} />
      <div className="px-5">
        {!msgs.length && (
          <div className="mt-2">
            <p className="text-[15px]">Conta o que você quer fazer e eu acho os lugares. Depois é só ir refinando na conversa.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['café calmo pra trabalhar perto de mim', 'bar com samba hoje até R$ 60', 'japonês bom pra date em Pinheiros'].map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-[13px] text-mute hover:text-ink">{s}</button>
              ))}
            </div>
            {hist.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em] text-faint"><History size={12} />Suas buscas</p>
                <div className="flex flex-wrap gap-2">
                  {hist.map((h) => <button key={h} onClick={() => send(h)} className="rounded-full bg-white/[0.05] px-3 py-1.5 text-[13px]">{h}</button>)}
                  <button onClick={() => { setHist([]); try { localStorage.removeItem(HIST_KEY) } catch { /* */ } }} aria-label="Apagar histórico" className="grid size-8 place-items-center rounded-full text-faint"><X size={14} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-2 grid gap-3" role="log" aria-live="polite">
          {msgs.map((m) => m.role === 'user' ? (
            <p key={m.id} className="ml-auto max-w-[85%] rounded-[18px] rounded-br-md bg-accent px-3.5 py-2 text-[14px] text-accent-ink">{m.text}</p>
          ) : (
            <div key={m.id} className="grid gap-2">
              <p className="max-w-[92%] rounded-[18px] rounded-bl-md bg-surface px-3.5 py-2.5 text-[14px]"><Sparkles size={12} className="mr-1.5 inline text-accent" />{m.text}</p>
              {m.results?.map((r, i) => <ResultCard key={r.place.id} r={r} photo={i < 3} km={kmTo(me, r.place)} />)}
              {!!m.results?.length && m.query && (
                <button onClick={() => nav(`/novo?t=${encodeURIComponent(m.query!)}`)} className="flex h-11 items-center justify-center gap-2 rounded-full border border-line text-[13px]">
                  <Users size={15} />Decidir com a turma (vira votação)
                </button>
              )}
            </div>
          ))}
          {busy && <p className="flex items-center gap-2 text-[13px] text-mute"><LoaderCircle size={14} className="animate-spin text-accent" />Procurando lugares abertos que combinam…</p>}
          <div ref={end} />
        </div>
      </div>

    </Page>
  )
}

function ResultCard({ r, photo, km }: { r: Ranked; photo: boolean; km?: number | null }) {
  return (
    <Link to={`/lugar/${r.place.id}`} className="flex gap-3 rounded-[22px] border border-line bg-surface/60 p-3">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-[16px]">
        <Cover hue={r.place.hue} icon={placeIcon(r.place)} iconSize={26} className="size-full" rounded="rounded-[16px]" />
        <PlacePhoto place={r.place} enabled={photo} carousel={false} rounded="rounded-[16px]" credit="bottom" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] uppercase tracking-[0.1em] text-mute">{r.place.tagline || KIND_LABEL[r.place.kind]} · {r.place.hood}</p>
        <p className="mt-0.5 truncate text-[16px]">{r.place.name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Tag tone="accent">{fitLabel(r.match)}</Tag>
          <Tag>{priceLabel(r.place.price)}</Tag>
          {km != null && <Tag>{fmtKm(km)}</Tag>}
        </div>
        <p className={cx('mt-1.5 line-clamp-2 text-[12px]', r.aiNote ? 'text-accent/90' : 'text-ink/70')}>
          {r.aiNote ? <><Sparkles size={11} className="mr-1 inline" />{r.aiNote}</> : r.reasons.slice(0, 2).join(' · ')}
        </p>
      </div>
    </Link>
  )
}
