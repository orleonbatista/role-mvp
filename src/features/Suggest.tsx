import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { AlertTriangle, Check, Copy, MapPin, Search, Send, Sparkles, X } from 'lucide-react'
import { Avatar, Button, Chip, Cover, EmptyState, Page, Skeleton, Tag, cx } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'
import { ease } from '../ui/motion'
import { placeIcon } from '../ui/placeIcon'
import { addSuggestion, analyzePlace, confirmCommunityPlace, importRequest, searchPlaces, useProfile, useRequest } from '../lib/api'
import { currentVoteLink, readPayload, returnUrl } from '../lib/share'
import { KIND_LABEL, NICHES, OCCASIONS, VIBES, nicheLabel, occasionLabel, priceLabel, vibeLabel } from '../lib/labels'
import { track } from '../lib/track'
import type { Niche, Occasion, Ranked, Vibe } from '../lib/types'
import { placesEnabled, searchGoogle, searchesLeftToday } from '../lib/places'
import { rank } from '../mocks/ranker'
import { isCommunity, placeById } from '../mocks/seeds/places'

const PRICES = [{ v: 40, l: 'até R$ 50' }, { v: 75, l: 'R$ 50–100' }, { v: 130, l: 'R$ 100+' }]
const toggle = <T,>(a: T[], v: T, max: number) => (a.includes(v) ? a.filter((x) => x !== v) : a.length >= max ? [...a.slice(1), v] : [...a, v])
interface Confirm { name: string; niches: Niche[]; vibes: Vibe[]; occasions: Occasion[]; price: number }

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

  // lugar novo do Google → vira lugar do catálogo comunitário: a pessoa confirma nome/estilo/vibe/ocasião/preço,
  // pré-preenchidos pela IA a partir do comentário (ou por regras, com o PC desligado)
  // lugar real ainda não curado (base OSM ou resultado do Google) → quem sugere confirma e ele vira curado
  const isNew = !!picked?.place.source && !isCommunity(placeById.get(picked.place.id) ?? picked.place)
  const [conf, setConf] = useState<Confirm | null>(null)
  const [ai, setAi] = useState<{ engine: string; flag: string | null; busy: boolean }>({ engine: '', flag: null, busy: false })
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!picked || !isNew) { setConf(null); return }
    const p = picked.place
    setConf({ name: p.name, niches: p.niches, vibes: p.vibes, occasions: p.occasions.slice(0, 2), price: PRICES.reduce((a, b) => (Math.abs(b.v - p.price) < Math.abs(a.v - p.price) ? b : a)).v })
  }, [picked?.place.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!picked || !isNew) return
    const t = setTimeout(async () => {
      setAi((a) => ({ ...a, busy: true }))
      const r = await analyzePlace({ comment: comment.trim(), name: conf?.name ?? picked.place.name, niches: picked.place.niches, occasions: picked.place.occasions.slice(0, 2) }).catch(() => null)
      if (r) setConf((c) => c && { ...c, niches: r.niches.length ? r.niches : c.niches, vibes: r.vibes.length ? r.vibes : c.vibes, occasions: r.occasions.length ? r.occasions : c.occasions })
      setAi({ engine: r?.engine ?? '', flag: r?.flag ?? null, busy: false })
    }, comment.trim() ? 900 : 0)
    return () => clearTimeout(t)
  }, [comment, picked?.place.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [review, setReview] = useState<string | null>(null)
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
    setReview(null)
    if (isNew && conf) {
      const final = { ...picked.place, name: conf.name.trim() || picked.place.name, niches: conf.niches, vibes: conf.vibes, occasions: conf.occasions, price: conf.price, tagline: 'Sugerido pela comunidade', curation: undefined }
      const r = await confirmCommunityPlace(final, comment.trim()).catch(() => null)
      track('community_place', { status: r?.status, engine: ai.engine, existing: r?.existing })
      if (r?.status === 'revisao') setReview(r.motivo ?? 'conteúdo a revisar')
    }
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
          <p className="truncate text-[15px]">{r.place.name}
            {!google && isCommunity(r.place) && <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 align-middle text-[10px] text-accent">comunidade</span>}
            {!google && r.place.curation === 'base' && <span className="ml-1.5 rounded-full bg-white/[0.06] px-1.5 py-0.5 align-middle text-[10px] text-mute">sem curadoria</span>}
          </p>
          <p className="truncate text-xs text-mute">
            {google || r.place.curation === 'base' ? `${r.place.tagline} · ${r.place.hood}` : `${KIND_LABEL[r.place.kind]} · ${r.place.hood} · ${priceLabel(r.place.price)}`}
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
        {isNew && conf && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2 text-left">
            <Sparkles size={13} className={cx('shrink-0 text-accent', ai.busy && 'animate-pulse')} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink/85">
              <span className="text-mute">Entendi: </span>
              {[...conf.niches.map(nicheLabel), ...conf.vibes.map(vibeLabel), ...conf.occasions.map(occasionLabel)].join(' · ') || 'toque pra marcar o estilo'}
            </span>
            <span className="shrink-0 text-[12px] text-accent">Ajustar</span>
          </button>
        )}
        {isNew && ai.flag && <p className="text-[11px] text-amber-300">Esse texto vai pra revisão da curadoria ({ai.flag}).</p>}
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
              {results?.some((r) => r.place.curation === 'base') && <p key="osm" className="text-right text-[11px] text-faint">“sem curadoria”: lugares reais © colaboradores do OpenStreetMap</p>}
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
            {review && <p className="mt-2 text-[12px] text-amber-300">O lugar entrou na votação, mas só vai pro catálogo do rolê depois de uma revisão rápida ({review}).</p>}
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
      <Sheet open={editing && !!conf} onClose={() => setEditing(false)}>
        {conf && (
          <>
            <p className="font-serif text-[26px] leading-none">Como é esse lugar?</p>
            <p className="mt-2 text-[13px] text-mute">Isso entra no catálogo do rolê e ajuda os próximos pedidos. {ai.engine === 'llm' ? 'A IA pré-marcou pelo seu comentário.' : 'Pré-marcado pelo tipo do lugar.'}</p>
            <input value={conf.name} onChange={(e) => setConf({ ...conf, name: e.target.value })} maxLength={80} aria-label="Nome do lugar"
              className="mt-4 h-11 w-full rounded-[14px] border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent/50" />
            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-mute">Estilo (até 3)</p>
            <div className="flex flex-wrap gap-1.5">{NICHES.map((n) => <Chip key={n.id} active={conf.niches.includes(n.id)} onClick={() => setConf({ ...conf, niches: toggle(conf.niches, n.id, 3) })}>{n.label}</Chip>)}</div>
            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-mute">Vibe (até 2)</p>
            <div className="flex flex-wrap gap-1.5">{VIBES.map((v) => <Chip key={v.id} active={conf.vibes.includes(v.id)} onClick={() => setConf({ ...conf, vibes: toggle(conf.vibes, v.id, 2) })}>{v.label}</Chip>)}</div>
            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-mute">Bom para (até 3)</p>
            <div className="flex flex-wrap gap-1.5">{OCCASIONS.map((o) => <Chip key={o.id} active={conf.occasions.includes(o.id)} onClick={() => setConf({ ...conf, occasions: toggle(conf.occasions, o.id, 3) })}>{o.label}</Chip>)}</div>
            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-mute">Quanto se gasta por pessoa</p>
            <div className="flex flex-wrap gap-1.5">{PRICES.map((p) => <Chip key={p.v} active={conf.price === p.v} onClick={() => setConf({ ...conf, price: p.v })}>{p.l}</Chip>)}</div>
            <Button size="lg" className="mt-5 w-full" onClick={() => setEditing(false)}>Pronto</Button>
          </>
        )}
      </Sheet>
    </Page>
  )
}
