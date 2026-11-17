import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, MapPin, Search, Sparkles, X } from 'lucide-react'
import { Button, Chip, Cover, Page, TopBar, cx } from '../ui/primitives'
import { ease } from '../ui/motion'
import { placeIcon } from '../ui/placeIcon'
import { analyzePlace, confirmCommunityPlace } from '../lib/api'
import { NICHES, OCCASIONS, VIBES, nicheLabel, occasionLabel, priceLabel, vibeLabel } from '../lib/labels'
import { placesEnabled, searchGoogle, searchesLeftToday } from '../lib/places'
import { isCommunity, placeById, places } from '../mocks/seeds/places'
import { track } from '../lib/track'
import type { Niche, Occasion, Place, Vibe } from '../lib/types'

const PRICES = [{ v: 40, l: 'até R$ 50' }, { v: 75, l: 'R$ 50–100' }, { v: 130, l: 'R$ 100+' }]
const toggle = <T,>(a: T[], v: T, max: number) => (a.includes(v) ? a.filter((x) => x !== v) : a.length >= max ? [...a.slice(1), v] : [...a, v])
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Curadoria sem pedido: quem conhece um lugar indica, confirma estilo/vibe/ocasião (IA pré-marca) e ele
 *  entra no catálogo da comunidade. Usado pelos curadores fundadores e pelo "Conhece? Indicar" da base. */
export function IndicarPage() {
  const nav = useNavigate()
  const qs = new URLSearchParams(location.search)
  const presetId = qs.get('id')
  const fNiche = qs.get('n') as Niche | null
  const fHood = qs.get('h')
  const [q, setQ] = useState('')
  const [google, setGoogle] = useState<Place[] | null>(null)
  const [gMsg, setGMsg] = useState('')
  const [picked, setPicked] = useState<Place | null>(() => (presetId ? placeById.get(presetId) ?? null : null))
  const [comment, setComment] = useState('')
  const [conf, setConf] = useState<{ name: string; niches: Niche[]; vibes: Vibe[]; occasions: Occasion[]; price: number } | null>(null)
  const [ai, setAi] = useState({ engine: '', flag: null as string | null, busy: false })
  const [done, setDone] = useState<{ name: string; status: string; motivo?: string } | null>(null)
  const [count, setCount] = useState(0)
  useEffect(() => { track('indicar_opened', { preset: !!presetId, gap: fNiche && fHood ? `${fNiche}@${fHood}` : undefined }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // candidatos: com busca, tudo que bate no nome/bairro; sem busca e com lacuna (estilo+bairro), a base daquele recorte
  const results = useMemo(() => {
    const t = norm(q.trim())
    if (t.length >= 2) return places.filter((p) => p.kind !== 'evento' && (norm(p.name).includes(t) || norm(p.hood) === t)).slice(0, 15)
    if (fHood) return places.filter((p) => p.hood === fHood && p.curation === 'base' && (!fNiche || p.niches.includes(fNiche))).slice(0, 15)
    return []
  }, [q, fHood, fNiche, done]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!picked) { setConf(null); return }
    setConf({ name: picked.name, niches: picked.niches.slice(0, 3), vibes: picked.vibes.slice(0, 2), occasions: picked.occasions.slice(0, 2), price: PRICES.reduce((a, b) => (Math.abs(b.v - picked.price) < Math.abs(a.v - picked.price) ? b : a)).v })
    setComment(''); setAi({ engine: '', flag: null, busy: false })
  }, [picked?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!picked || !comment.trim()) return
    const t = setTimeout(async () => {
      setAi((a) => ({ ...a, busy: true }))
      const r = await analyzePlace({ comment: comment.trim(), name: conf?.name ?? picked.name, niches: picked.niches, occasions: picked.occasions.slice(0, 2) }).catch(() => null)
      if (r) setConf((c) => c && { ...c, niches: r.niches.length ? r.niches : c.niches, vibes: r.vibes.length ? r.vibes : c.vibes, occasions: r.occasions.length ? r.occasions : c.occasions })
      setAi({ engine: r?.engine ?? '', flag: r?.flag ?? null, busy: false })
    }, 900)
    return () => clearTimeout(t)
  }, [comment, picked?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function searchG() {
    setGMsg('buscando…')
    const r = await searchGoogle(q.trim())
    track('places_search', { ok: r.ok, from: 'indicar' })
    if (r.ok) { setGoogle(r.places); setGMsg(r.places.length ? '' : 'Nada encontrado em SP.') }
    else setGMsg(r.reason === 'limite_dia' ? 'A cota de buscas do Google de hoje acabou.' : r.reason === 'limite_aparelho' ? 'Você já usou as buscas no Google de hoje.' : 'Não consegui buscar agora.')
  }

  async function save() {
    if (!picked || !conf) return
    const final: Place = { ...picked, name: conf.name.trim() || picked.name, niches: conf.niches, vibes: conf.vibes, occasions: conf.occasions, price: conf.price, tagline: 'Sugerido pela comunidade', curation: undefined }
    const r = await confirmCommunityPlace(final, comment.trim()).catch(() => null)
    track('community_place', { status: r?.status, engine: ai.engine, from: 'indicar' })
    setDone({ name: final.name, status: r?.status ?? 'local', motivo: r?.motivo })
    setCount((n) => n + 1)
    setPicked(null); setGoogle(null); setQ('')
  }

  const row = (p: Place) => {
    const curated = isCommunity(p) || !p.source
    return (
      <motion.button key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }}
        disabled={curated} onClick={() => setPicked(p)}
        className={cx('flex items-center gap-3 rounded-[20px] border border-line bg-surface/60 p-2.5 pr-3 text-left', curated && 'opacity-60')}>
        <Cover hue={p.hue} icon={placeIcon(p)} iconSize={20} className="size-12 shrink-0" rounded="rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{p.name}</p>
          <p className="truncate text-xs text-mute">{p.tagline} · {p.hood}</p>
        </div>
        <span className={cx('shrink-0 rounded-full px-2 py-1 text-[11px]', curated ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-mute')}>{curated ? 'já curado' : 'indicar'}</span>
      </motion.button>
    )
  }

  const footer = picked && conf ? (
    <div className="grid gap-2">
      <Button size="lg" className="w-full" icon={<Check size={16} />} disabled={!conf.niches.length} onClick={save}>Adicionar ao rolê</Button>
    </div>
  ) : null

  return (
    <Page footer={footer}>
      <TopBar title="Indicar um lugar" />
      <div className="px-5">
        <h1 className="font-serif text-[40px] leading-[0.95] tracking-tight">Que lugar você<br /><em className="text-accent">indicaria?</em></h1>
        <p className="mt-3 text-[14px] text-mute">Só entra no rolê o que alguém conhece de verdade. Busque, diga como é, e ele passa a aparecer pra quem procura algo assim.</p>
        {count > 0 && <p className="mt-2 text-[13px] text-accent">Você já indicou {count} {count === 1 ? 'lugar' : 'lugares'} agora. Valeu!</p>}

        <AnimatePresence>
          {done && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cx('mt-4 rounded-[18px] p-3 text-[13px]', done.status === 'revisao' ? 'bg-amber-400/10 text-amber-200' : 'bg-accent/10 text-accent')}>
              {done.status === 'revisao' ? `${done.name} vai passar por uma revisão rápida (${done.motivo}).` : `${done.name} entrou no catálogo do rolê ✓`}
              <button onClick={() => setDone(null)} className="float-right text-mute" aria-label="Fechar"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {!picked && (
          <>
            <label className="mt-5 flex items-center gap-2 rounded-full border border-line bg-surface px-4">
              <Search size={15} className="text-mute" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setGoogle(null); setGMsg('') }} placeholder="Nome do lugar" aria-label="Buscar lugar" autoFocus={!fHood}
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
            </label>
            {!q && fHood && <p className="mt-4 text-[12px] uppercase tracking-[0.14em] text-mute">Você conhece algum destes? {fNiche ? `${nicheLabel(fNiche)} · ` : ''}{fHood}</p>}
            <div className="mt-3 grid gap-2"><AnimatePresence initial={false}>{results.map(row)}</AnimatePresence></div>
            {results.some((p) => p.curation === 'base') && <p className="mt-2 text-right text-[11px] text-faint">lugares reais © colaboradores do OpenStreetMap</p>}
            {placesEnabled() && q.trim().length >= 3 && !google && (
              <button onClick={searchG} className="mt-4 flex w-full items-center gap-3 rounded-[20px] border border-dashed border-white/15 px-4 py-3 text-left">
                <MapPin size={18} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">Não achou? Buscar “{q.trim()}” no Google Maps</span><span className="block text-[11px] text-mute">{searchesLeftToday()} buscas hoje neste celular</span></span>
              </button>
            )}
            {gMsg && <p className="mt-3 text-center text-[13px] text-mute">{gMsg}</p>}
            {google && google.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-[12px] uppercase tracking-[0.14em] text-mute">No Google Maps</p>
                <div className="grid gap-2">{google.map((p) => row(placeById.get(p.id) ?? p))}</div>
                <p className="mt-2 text-right text-[11px] text-faint">Dados de lugares: Google Maps</p>
              </>
            )}
          </>
        )}

        {picked && conf && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }} className="mt-5 pb-4">
            <div className="flex items-center gap-3 rounded-[20px] bg-surface p-3">
              <Cover hue={picked.hue} icon={placeIcon(picked)} iconSize={20} className="size-12 shrink-0" rounded="rounded-[12px]" />
              <input value={conf.name} onChange={(e) => setConf({ ...conf, name: e.target.value })} maxLength={80} aria-label="Nome do lugar"
                className="min-w-0 flex-1 bg-transparent font-serif text-[22px] outline-none" />
              <button onClick={() => setPicked(null)} aria-label="Trocar" className="grid size-8 place-items-center rounded-full bg-white/[0.06]"><X size={14} /></button>
            </div>
            <p className="mt-1 px-1 text-[12px] text-faint">{picked.hood}{picked.mapsUrl && <> · <a href={picked.mapsUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">ver no Maps</a></>}</p>

            <p className="mb-2 mt-5 text-[11px] uppercase tracking-[0.14em] text-mute">Como é? (a IA marca pra você)</p>
            <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} placeholder="Ex.: drinks autorais, som baixo, ótimo pra date" aria-label="Comentário"
              className="h-12 w-full rounded-[16px] border border-line bg-bg px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent/50" />
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink/80">
              <Sparkles size={12} className={cx('text-accent', ai.busy && 'animate-pulse')} />
              <span className="text-mute">Entendi:</span> {[...conf.niches.map(nicheLabel), ...conf.vibes.map(vibeLabel), ...conf.occasions.map(occasionLabel)].join(' · ') || '—'}
            </p>
            {ai.flag && <p className="mt-1 text-[11px] text-amber-300">Esse texto vai pra revisão da curadoria ({ai.flag}).</p>}

            <p className="mb-2 mt-5 text-[11px] uppercase tracking-[0.14em] text-mute">Estilo (até 3)</p>
            <div className="flex flex-wrap gap-1.5">{NICHES.map((n) => <Chip key={n.id} active={conf.niches.includes(n.id)} onClick={() => setConf({ ...conf, niches: toggle(conf.niches, n.id, 3) })}>{n.label}</Chip>)}</div>
            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-mute">Vibe (até 2)</p>
            <div className="flex flex-wrap gap-1.5">{VIBES.map((v) => <Chip key={v.id} active={conf.vibes.includes(v.id)} onClick={() => setConf({ ...conf, vibes: toggle(conf.vibes, v.id, 2) })}>{v.label}</Chip>)}</div>
            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-mute">Bom para (até 3)</p>
            <div className="flex flex-wrap gap-1.5">{OCCASIONS.map((o) => <Chip key={o.id} active={conf.occasions.includes(o.id)} onClick={() => setConf({ ...conf, occasions: toggle(conf.occasions, o.id, 3) })}>{o.label}</Chip>)}</div>
            <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-mute">Quanto se gasta por pessoa</p>
            <div className="flex flex-wrap gap-1.5">{PRICES.map((p) => <Chip key={p.v} active={conf.price === p.v} onClick={() => setConf({ ...conf, price: p.v })}>{p.l}</Chip>)}</div>
            <p className="mt-3 text-[11px] text-faint">Preço atual: {priceLabel(conf.price)}</p>
          </motion.div>
        )}

        {!picked && (
          <div className="mt-8 flex justify-between pb-6 text-[13px]">
            <Link to="/fundador" className="text-mute underline-offset-4 hover:text-ink hover:underline">O que falta curar?</Link>
            <button onClick={() => nav('/')} className="text-mute underline-offset-4 hover:text-ink hover:underline">Ir pro início</button>
          </div>
        )}
      </div>
    </Page>
  )
}
