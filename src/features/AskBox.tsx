import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Sparkles } from 'lucide-react'
import { StreamText, Typing, cx } from '../ui/primitives'
import { ease } from '../ui/motion'
import { askPoll, type PollAnswer } from '../lib/askPoll'
import { track } from '../lib/track'
import type { Criteria, Place, VoteTally } from '../lib/types'

const SUGGESTIONS = ['Qual é mais barato?', 'Qual cabe todo mundo?', 'Qual é mais perto?', 'Qual você recomenda?', 'Tem música ao vivo?', 'Dá pra conversar?']

interface Msg { id: number; q: string; a?: PollAnswer }

/** Perguntas sobre as opções da votação. A resposta usa só os dados das opções (LLM se no ar, senão regras). */
export function AskBox({ pedido, options, criteria, tally, hood, onHighlight }: {
  pedido: string; options: Place[]; criteria: Criteria; tally: VoteTally[]; hood?: string; onHighlight: (ids: string[]) => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [msgs])

  async function ask(q: string) {
    const question = q.trim().slice(0, 200)
    if (!question || busy) return
    const id = Date.now()
    setMsgs((m) => [...m, { id, q: question }])
    setText('')
    setBusy(true)
    const a = await askPoll(question, pedido, options, criteria, tally, hood)
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a } : x)))
    onHighlight(a.highlight)
    setBusy(false)
    track('ask_asked', { engine: a.engine, ms: a.ms, highlighted: a.highlight.length })
  }

  return (
    <section className="mt-8 px-5">
      <p className="mb-2.5 flex items-center gap-2 text-[13px] uppercase tracking-[0.14em] text-mute"><Sparkles size={13} className="text-accent" /> Pergunte à IA</p>
      <div className="rounded-[24px] border border-line bg-surface/60 p-3">
        <div className="grid gap-2.5">
          <AnimatePresence initial={false}>
            {msgs.map((m) => (
              <motion.div key={m.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className="grid gap-2">
                <p className="ml-auto max-w-[85%] rounded-[18px] rounded-br-md bg-accent px-3.5 py-2 text-[14px] text-accent-ink">{m.q}</p>
                {m.a ? (
                  <div className="max-w-[92%] rounded-[18px] rounded-bl-md bg-white/[0.06] px-3.5 py-2.5">
                    <StreamText text={m.a.text} className="text-[14px] leading-relaxed text-ink/90" speed={22} />
                    {m.a.highlight.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.a.highlight.map((id) => {
                          const p = options.find((o) => o.id === id)
                          return p ? (
                            <button key={id} type="button" onClick={() => { onHighlight([id]); document.querySelector(`[data-opt="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
                              className="rounded-full bg-accent/15 px-2.5 py-1 text-[12px] text-accent">ver {p.name} ↑</button>
                          ) : null
                        })}
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] text-faint">{m.a.engine === 'llm' ? `${m.a.model} · ${m.a.via} · ${((m.a.ms ?? 0) / 1000).toFixed(1)}s` : 'respondido pelos dados do catálogo'}</p>
                  </div>
                ) : (
                  <div className="w-fit rounded-[18px] rounded-bl-md bg-white/[0.06] px-3.5 py-3"><Typing /></div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>

        {!msgs.length && (
          <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {SUGGESTIONS.map((s) => (
              <motion.button key={s} whileTap={{ scale: 0.95 }} onClick={() => ask(s)} className="h-9 shrink-0 rounded-full bg-white/[0.06] px-3.5 text-[13px] text-ink/85 hover:bg-white/[0.09]">
                {s}
              </motion.button>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); ask(text) }} className={cx('flex items-center gap-2 rounded-full border border-line bg-bg pl-4 pr-1.5', msgs.length ? 'mt-3' : 'mt-2')}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Ex.: qual tem área externa?" aria-label="Pergunta sobre as opções"
            className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
          <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={!text.trim() || busy} aria-label="Perguntar"
            className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
            <ArrowUp size={16} />
          </motion.button>
        </form>
      </div>
    </section>
  )
}
