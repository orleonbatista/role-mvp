import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { AlertTriangle, Check, Copy, MapPin, Search, Send, Sparkles, X } from 'lucide-react'
import { Avatar, Button, Cover, EmptyState, Page, Skeleton, Tag, cx } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'
import { ease } from '../ui/motion'
import { placeIcon } from '../ui/placeIcon'
import { addSuggestion, importRequest, searchPlaces, useProfile, useRequest } from '../lib/api'
import { currentVoteLink, readPayload, returnUrl } from '../lib/share'
import { KIND_LABEL, nicheLabel, occasionLabel, priceLabel } from '../lib/labels'
import { track } from '../lib/track'
import type { Ranked } from '../lib/types'
import { placesEnabled, searchGoogle, searchesLeftToday } from '../lib/places'
import { rank } from '../mocks/ranker'
import { rememberPlace } from '../mocks/gplaces'

const G_MSG: Record<string, string> = {
  limite_aparelho: 'Você já usou as buscas no Google de hoje neste celular. Escolha do catálogo ou tente amanhã.',
  limite_dia: 'A cota de buscas do Google de hoje acabou (mantém o app grátis). Escolha do catálogo ou tente amanhã.',
  erro: 'Não consegui buscar no Google agora. Tente de novo em instantes.',
  off: '',
}

const hueOf = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360

/** Página que o link "me indica um lugar" abre: quem recebeu sugere um lugar e vê se encaixa nos critérios. */
export function SuggestPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    ;(async () => {
      const payload = await readPayload(location.hash)
      if (payload && payload.id === id) {
        await importRequest(payload)
        await qc.invalidateQueries({ queryKey: ['request', id] })
      }
      setReady(true)
      track('suggest_page_opened', { id, viaLink: !!payload })
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isError } = useRequest(ready ? id : '')
  const { data: me } = useProfile()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Ranked[] | null>(null)
  const [picked, setPicked] = useState<Ranked | null>(null)
  const [name, setName] = useState(() => localStorage.getItem('role.voter') ?? '')
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [gq, setGq] = useState('')
  const [gres, setGres] = useState<Ranked[] | null>(null)
  const [gstate, setGstate] = useState<'idle' | 'loading' | keyof typeof G_MSG>('idle')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (!name && me?.name) setName(me.name.split(' ')[0]) }, [me, name])
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => searchPlaces(q, id).then(setResults), 180)
    return () => clearTimeout(t)
  }, [q, id, ready])

  if (isError) return <Page><EmptyState title="Pedido não encontrado" text="Esse link está incompleto. Peça para reenviarem." action={<Button onClick={() => nav('/')}>Conhecer o rolê.</Button>} /></Page>

  const author = data?.author.name.split(' ')[0] ?? ''
  const c = data?.request.criteria
  const inPoll = new Set(data?.options.map((o) => o.id) ?? [])

  async function searchG() {
    if (!data || q.trim().length < 3) return
    setGstate('loading'); setGq(q.trim())
    const r = await searchGoogle(q.trim())
    track('places_search', { ok: r.ok, reason: r.ok ? undefined : r.reason, n: r.ok ? r.places.length : 0 })
    if (!r.ok) { setGres(null); setGstate(r.reason); return }
    setGres(rank(r.places, data.request.criteria))
    setGstate('idle')
  }

  async function send() {
    if (!picked || !name.trim() || !data || sending) return
    setSending(true)
    if (picked.place.source === 'google') await rememberPlace(picked.place)
    localStorage.setItem('role.voter', name.trim())
    // entra na votação deste aparelho e, com o backend no ar, na de todo mundo
    const r = await addSuggestion(id, { placeId: picked.place.id, by: name.trim(), comment: comment.trim(), hue: hueOf(name.trim()) }).catch(() => null)
    await qc.invalidateQueries({ queryKey: ['request', id] })
    setLive(!!r?.synced)
    setSent(r?.synced ? currentVoteLink() : returnUrl(currentVoteLink(), picked.place.id, name.trim(), comment.trim(), hueOf(name.trim())))
    setSending(false)
    track('suggestion_sent', { id, placeId: picked.place.id, match: picked.match, live: !!r?.synced })
  }
  const msg = picked && sent
    ? live
      ? `Sugeri ${picked.place.name} pro rolê${comment.trim() ? `: “${comment.trim()}”` : ''}. Já tá na votação 👇\n${sent}`
      : `Sugeri ${picked.place.name} pro teu rolê${comment.trim() ? `: “${comment.trim()}”` : ''} 👉 Toca pra adicionar na votação:\n${sent}`
    : ''

  function row(r: Ranked, google = false) {
    const on = picked?.place.id === r.place.id
    const already = inPoll.has(r.place.id)
    return (
      <motion.button key={r.place.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }}
        whileTap={{ scale: 0.98 }} disabled={already} onClick={() => setPicked(on ? null : r)}
        className={cx('flex items-center gap-3 rounded-[20px] border p-2.5 pr-3 text-left transition-colors', on ? 'border-accent bg-accent/[0.07]' : 'border-line bg-surface/60', already && 'opacity-50')}>
        <Cover hue={r.place.hue} icon={placeIcon(r.place)} iconSize={20} className="size-14 shrink-0" rounded="rounded-[14px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{r.place.name}</p>
          <p className="truncate text-xs text-mute">
            {google ? `${r.place.tagline} · ${r.place.hood}` : `${KIND_LABEL[r.place.kind]} · ${r.place.hood} · ${priceLabel(r.place.price)}`}
            {google && r.place.ratingCount > 0 ? ` · ★ ${(r.place.rating / 2).toFixed(1)} (${r.place.ratingCount})` : ''}
          </p>
          {r.warnings[0]
            ? <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-amber-300/90"><AlertTriangle size={10} />{r.warnings[0]}</p>
            : <p className="mt-0.5 truncate text-[11px] text-accent/90">{r.reasons[0]}</p>}
        </div>
        <span className={cx('shrink-0 rounded-full px-2 py-1 text-[11px]', already ? 'bg-white/10 text-mute' : r.match >= 70 ? 'bg-accent/15 text-accent' : 'bg-amber-400/15 text-amber-300')}>
          {already ? 'já na lista' : `${r.match}%`}
        </span>
      </motion.button>
    )
  }

  return (
    <Page footer={picked && data ? (
      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <Cover hue={picked.place.hue} icon={placeIcon(picked.place)} iconSize={18} className="size-11 shrink-0" rounded="rounded-[12px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px]">{picked.place.name}</p>
            <p className={cx('text-xs', picked.match >= 70 ? 'text-accent' : 'text-amber-300')}>{picked.match}% de encaixe{picked.warnings[0] ? ` · ${picked.warnings[0].toLowerCase()}` : ''}</p>
          </div>
          <button onClick={() => setPicked(null)} aria-label="Trocar" className="grid size-8 place-items-center rounded-full bg-white/[0.06]"><X size={14} /></button>
        </div>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" aria-label="Seu nome" maxLength={30}
            className={cx('h-11 w-[38%] rounded-[14px] border bg-bg px-3 text-[14px] outline-none placeholder:text-faint', name.trim() ? 'border-line' : 'border-accent/60')} />
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Por quê? (opcional)" aria-label="Comentário" maxLength={140}
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-line bg-bg px-3 text-[14px] outline-none placeholder:text-faint" />
        </div>
        <Button size="lg" className="w-full" icon={<Send size={16} />} disabled={!name.trim() || sending} onClick={send}>{sending ? "Enviando…" : `Sugerir pro rolê do ${author}`}</Button>
      </div>
    ) : null}>
      <div className="flex items-center justify-between px-5 pt-14">
        <span className="font-serif text-xl italic">rolê<span className="text-accent">.</span></span>
        <button onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} className="grid size-9 place-items-center rounded-full bg-white/[0.06]" aria-label="Fechar"><X size={16} /></button>
      </div>

      {!data || !c ? (
        <div className="grid gap-3 px-5 pt-8"><Skeleton className="h-28" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : (
        <>
          <header className="px-5 pt-6">
            <div className="flex items-center gap-2 text-sm text-mute"><Avatar name={data.author.name} hue={data.author.hue} size={24} />{author} quer indicações</div>
            <h1 className="mt-3 font-serif text-[38px] leading-[0.95] tracking-tight">Me indica<br /><em className="text-accent">um lugar?</em></h1>
            <p className="mt-3 text-[15px] text-ink/85">“{data.request.text}”</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.occasion && <Tag tone="accent">{occasionLabel(c.occasion)}</Tag>}
              {c.groupSize > 1 && <Tag tone="accent">{c.groupSize} pessoas</Tag>}
              {c.when && <Tag tone="accent">{c.when.label}</Tag>}
              {c.hood && <Tag tone="accent">{c.hood}</Tag>}
              {c.budget && <Tag tone="accent">até R$ {c.budget}</Tag>}
              {c.niches.map((n) => <Tag key={n} tone="accent">{nicheLabel(n)}</Tag>)}
            </div>
            {data.options.length > 0 && <p className="mt-4 text-xs text-mute">Já na lista: {data.options.map((o) => o.name).join(' · ')}</p>}
          </header>

          <div className="sticky top-0 z-10 mt-5 bg-bg/85 px-5 py-2 backdrop-blur-xl">
            <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-4">
              <Search size={15} className="text-mute" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque pelo nome, bairro ou estilo" aria-label="Buscar lugar"
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
            </label>
            {!q && <p className="mt-2 px-1 text-[11px] text-faint"><Sparkles size={10} className="mr-1 inline text-accent" />ordenados pelo que mais encaixa no pedido</p>}
          </div>

          <div className="grid gap-2 px-5 pt-2">
            {!results && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
            {results?.length === 0 && <p className="py-4 text-center text-sm text-mute">Não achei no catálogo do rolê.{placesEnabled() ? ' Busca no Google Maps aqui embaixo ↓' : ''}</p>}
            <AnimatePresence initial={false}>
              {results?.map((r) => row(r))}
            </AnimatePresence>
          </div>

          {placesEnabled() && (
            <section className="mt-5 px-5">
              {q.trim().length >= 3 && gq !== q.trim() && gstate !== 'loading' && (
                <button onClick={searchG}
                  className="flex w-full items-center gap-3 rounded-[20px] border border-dashed border-white/15 px-4 py-3 text-left transition-colors hover:border-accent/40">
                  <MapPin size={18} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">Buscar “{q.trim()}” no Google Maps</span>
                    <span className="block text-[11px] text-mute">Qualquer lugar de SP · {searchesLeftToday()} buscas hoje neste celular</span>
                  </span>
                </button>
              )}
              {q.trim().length < 3 && !gres && <p className="text-center text-[12px] text-faint">Não achou? Digite o nome e busque no Google Maps.</p>}
              {gstate === 'loading' && <div className="grid gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
              {gstate !== 'idle' && gstate !== 'loading' && G_MSG[gstate] && <p className="rounded-[16px] bg-white/[0.04] p-3 text-[13px] text-mute">{G_MSG[gstate]}</p>}
              {gres && gstate === 'idle' && (
                <>
                  <p className="mb-2 mt-1 flex items-center justify-between text-[12px] uppercase tracking-[0.14em] text-mute">
                    <span>No Google Maps</span><span className="normal-case tracking-normal text-faint">“{gq}”</span>
                  </p>
                  {gres.length === 0 && <p className="py-3 text-center text-sm text-mute">Nada encontrado com esse nome em SP.</p>}
                  <div className="grid gap-2">
                    <AnimatePresence initial={false}>{gres.map((r) => row(r, true))}</AnimatePresence>
                  </div>
                  {/* atribuição exigida pelos termos do Google Maps Platform */}
                  <p className="mt-2 text-right text-[11px] text-faint">Dados de lugares: <span className="font-medium text-mute">Google Maps</span></p>
                </>
              )}
            </section>
          )}
        </>
      )}

      <Sheet open={!!sent} onClose={() => setSent(null)}>
        {live ? (
          <>
            <p className="font-serif text-[28px] leading-none">Tá na votação ✓</p>
            <p className="mt-2 text-sm text-mute">{picked?.place.name} já aparece pra todo mundo com o seu nome. Avisa o grupo pra votarem.</p>
            <Button size="lg" className="mt-5 w-full" onClick={() => nav(`/r/${id}${location.search.replace(/[?&]to=s/, '')}${location.hash}`)}>Ver a votação</Button>
          </>
        ) : (
          <>
            <p className="font-serif text-[28px] leading-none">Manda pro {author}</p>
            <p className="mt-2 text-sm text-mute">Quando {author} tocar no link, {picked?.place.name} entra na votação com o seu nome.</p>
          </>
        )}
        <div className="mt-5 grid gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" onClick={() => track('suggestion_shared', { via: 'whatsapp' })}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#25d366] text-[15px] font-medium text-[#062b14] transition-transform active:scale-[0.98]">
            <Send size={16} /> {live ? 'Avisar no grupo' : 'Enviar no WhatsApp'}
          </a>
          <Button size="lg" variant="soft" icon={copied ? <Check size={16} /> : <Copy size={16} />}
            onClick={async () => { try { await navigator.clipboard.writeText(msg) } catch { /* sem clipboard */ } setCopied(true); track('suggestion_shared', { via: 'copy' }); setTimeout(() => setCopied(false), 2000) }}>
            {copied ? 'Copiado: cola no direct do Instagram' : 'Copiar (pra mandar no direct)'}
          </Button>
          <button onClick={() => { track('cta_new_request', { from: 'suggest' }); nav(me?.onboarded ? '/novo' : '/onboarding') }} className="mt-2 text-sm text-mute underline decoration-white/20 underline-offset-4">
            Também tenho um rolê pra decidir
          </button>
        </div>
      </Sheet>
    </Page>
  )
}
