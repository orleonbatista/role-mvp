import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, Search, Sparkles, Users } from 'lucide-react'
import { Cover, Page, Tag, TopBar, cx } from '../ui/primitives'
import { PlacePhoto } from '../ui/PlacePhoto'
import { placeIcon } from '../ui/placeIcon'
import { fitLabel, KIND_LABEL, priceLabel } from '../lib/labels'
import { kmTo, fmtKm } from '../lib/hours'
import { useProfile } from '../lib/api'
import { track } from '../lib/track'
import type { Criteria, Ranked } from '../lib/types'

/** busca rápida: a pessoa descreve o que quer fazer e recebe uma lista (sem pedido, sem votação, nada salvo) */
export function QuickSearch() {
  const [sp] = useSearchParams()
  const [text, setText] = useState(sp.get('q') ?? '')
  const nav = useNavigate()
  const me = useProfile().data
  const run = useMutation({
    mutationFn: async (q: string) => {
      const r = await fetch('/api/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: q }) })
      return (await r.json()) as { criteria: Criteria; results: Ranked[] }
    },
  })
  const go = () => { if (text.trim().length > 3) { track('quick_search_sent', {}); run.mutate(text.trim()) } }
  return (
    <Page>
      <TopBar title="Busca rápida" />
      <div className="px-5">
        <p className="text-[14px] text-mute">Descreva o que quer fazer. A IA devolve uma lista, sem votação.</p>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); go() }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="ex.: café calmo pra trabalhar perto de mim" aria-label="O que você quer fazer"
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent" />
          <button type="submit" aria-label="Buscar" disabled={run.isPending} className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
            {run.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </form>
        {run.isPending && <p className="mt-3 text-[13px] text-faint">Entendendo e buscando lugares…</p>}
      </div>

      {run.data && (
        <section className="mt-6 grid gap-3 px-5 pb-10">
          <p className="text-[12px] text-faint">{run.data.results.length ? `${run.data.results.length} lugares${run.data.criteria.hood ? ` em ${run.data.criteria.hood}` : ''}` : 'Nada encontrado com isso. Tente descrever de outro jeito.'}</p>
          {run.data.results.map((r, i) => {
            const km = kmTo(me, r.place)
            return (
              <Link key={r.place.id} to={`/lugar/${r.place.id}`} className="flex gap-3 rounded-[22px] border border-line bg-surface/60 p-3">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-[16px]">
                  <Cover hue={r.place.hue} icon={placeIcon(r.place)} iconSize={28} className="size-full" rounded="rounded-[16px]" />
                  <PlacePhoto place={r.place} enabled={i < 4} carousel={false} rounded="rounded-[16px]" w={240} credit="bottom" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-mute">{r.place.tagline || KIND_LABEL[r.place.kind]} · {r.place.hood}</p>
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
          })}
          {run.data.results.length > 0 && (
            <button onClick={() => nav(`/novo?t=${encodeURIComponent(text)}`)} className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full border border-line text-[14px]">
              <Users size={16} />Decidir com a turma (vira votação)
            </button>
          )}
        </section>
      )}
    </Page>
  )
}
