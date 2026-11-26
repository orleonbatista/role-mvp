import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, Copy, MapPinPlus, Send, Sparkles } from 'lucide-react'
import { Button, Page, SectionTitle, TopBar, cx } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { ease, item, list } from '../ui/motion'
import { useProfile } from '../lib/api'
import { HOODS, NICHES, nicheLabel } from '../lib/labels'
import { isCommunity, places } from '../mocks/seeds/places'
import { handleSlug } from '../lib/share'
import { track } from '../lib/track'
import type { Niche } from '../lib/types'

/** Curador fundador: convite + mapa do que falta curar (estilo × bairro), com candidatos reais da base. */
export function FundadorPage() {
  const { data: me } = useProfile()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  useEffect(() => { track('fundador_opened') }, [])

  const stats = useMemo(() => {
    const curated = places.filter(isCommunity)
    const base = places.filter((p) => p.curation === 'base')
    // lacuna = estilo × bairro com poucos curados e lugares reais na base esperando alguém que conheça
    const gaps: { niche: Niche; hood: string; curated: number; candidates: number; mine: number }[] = []
    for (const h of HOODS) for (const n of NICHES.map((x) => x.id)) {
      const c = curated.filter((p) => p.hood === h && p.niches.includes(n)).length
      const cand = base.filter((p) => p.hood === h && p.niches.includes(n)).length
      // afinidade: gosto vale mais que bairro (quem curte jazz conhece jazz, mesmo longe de casa)
      const mine = me ? (me.niches.includes(n) ? 2 : 0) + (me.hood === h ? 1 : 0) : 0
      if (cand > 0 && c < 3) gaps.push({ niche: n, hood: h, curated: c, candidates: cand, mine })
    }
    // primeiro o que tem a ver com quem está vendo (gosto/bairro), depois onde há mais lugar real sem curadoria
    gaps.sort((a, b) => b.mine - a.mine || a.curated - b.curated || b.candidates - a.candidates)
    const byHood = HOODS.map((h) => ({ h, n: curated.filter((p) => p.hood === h).length })).sort((a, b) => b.n - a.n)
    return { curated: curated.length, base: base.length, gaps: gaps.slice(0, 10), byHood }
  }, [me])

  const slug = me?.name ? handleSlug(me.name.split(' ')[0]) : ''
  const link = `${location.origin}${import.meta.env.BASE_URL}v/?to=f&src=fundador${slug ? `_${slug}` : ''}`
  const msg = `Tô montando o rolê., um app de rolês curado por quem conhece de verdade (nada de nota inflada). Topa ser curador fundador e indicar 3 lugares que você ama? Leva 1 minuto 👇\n${link}`

  return (
    <Page>
      <TopBar title="Curador fundador" />
      <div className="px-5">
        <motion.h1 initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.7, ease }}
          className="font-serif text-[44px] leading-[0.92] tracking-tight">Quem conhece,<br /><em className="text-accent">indica.</em></motion.h1>
        <p className="mt-3 text-[14px] text-mute">
          O rolê. só mostra lugar que alguém da comunidade conhece e indicou. A IA entende o pedido e cruza com essa curadoria. Os primeiros curadores definem a cara do app.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <div className="rounded-[20px] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-mute">curados</p>
            <p className="mt-1 font-serif text-[36px] leading-none text-accent">{stats.curated}</p>
            <p className="mt-1 text-[11px] text-faint">pela comunidade</p>
          </div>
          <div className="rounded-[20px] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-mute">esperando</p>
            <p className="mt-1 font-serif text-[36px] leading-none">{stats.base}</p>
            <p className="mt-1 text-[11px] text-faint">lugares reais sem curadoria</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <Link to="/indicar" onClick={() => track('fundador_indicar')}><Button size="lg" className="w-full" icon={<MapPinPlus size={17} />}>Indicar um lugar</Button></Link>
          <div className="grid grid-cols-2 gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" onClick={() => track('fundador_invite', { via: 'whatsapp' })}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] text-[14px] font-medium text-black active:scale-[0.98]"><Send size={15} />Convidar</a>
            <Button variant="soft" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={async () => {
              try { await navigator.clipboard.writeText(msg); setCopied(true); toast('Convite copiado'); setTimeout(() => setCopied(false), 1800) } catch { toast('Não deu pra copiar') }
              track('fundador_invite', { via: 'copy' })
            }}>{copied ? 'Copiado' : 'Copiar convite'}</Button>
          </div>
        </div>
      </div>

      <section className="mt-9">
        <SectionTitle aside={<span className="text-xs text-faint">toque pra curar</span>}>O que falta curar</SectionTitle>
        <motion.div variants={list} initial="initial" animate="animate" className="grid gap-2 px-5">
          {stats.gaps.map((g) => (
            <motion.div key={`${g.niche}-${g.hood}`} variants={item}>
              <Link to={`/indicar?n=${g.niche}&h=${encodeURIComponent(g.hood)}`} onClick={() => track('fundador_gap', { niche: g.niche, hood: g.hood })}
                className={cx('flex items-center gap-3 rounded-[20px] border p-3.5', g.mine >= 2 ? 'border-accent/30 bg-accent/[0.05]' : 'border-line bg-surface/60')}>
                <Sparkles size={15} className={g.mine >= 2 ? 'text-accent' : 'text-mute'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{nicheLabel(g.niche)} em {g.hood}</span>
                  <span className="block text-[12px] text-mute">{g.curated} {g.curated === 1 ? 'curado' : 'curados'} · {g.candidates} lugares reais esperando</span>
                </span>
                <span className="text-[13px] text-accent">curar →</span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
        <p className="mt-2 px-5 text-right text-[11px] text-faint">Dados de lugares: Google Maps</p>
      </section>

      <section className="mt-8 pb-8">
        <SectionTitle>Curadoria por bairro</SectionTitle>
        <div className="flex flex-wrap gap-1.5 px-5">
          {stats.byHood.map(({ h, n }) => (
            <span key={h} className={cx('rounded-full px-3 py-1.5 text-[12px]', n ? 'bg-accent/15 text-accent' : 'bg-white/[0.05] text-mute')}>{h} · {n}</span>
          ))}
        </div>
      </section>
    </Page>
  )
}
