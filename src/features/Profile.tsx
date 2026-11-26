import { motion } from 'motion/react'
import { Link, useNavigate } from 'react-router'
import { ArrowUpRight, BarChart3, MapPinPlus, Megaphone, RotateCcw, Settings2, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { GoogleButton } from './GoogleButton'
import { deleteMe } from '../mocks/remote'
import { useToast } from '../ui/Toast'
import { AnimatedNumber, Avatar, Cover, Page, SectionTitle, Skeleton, Tag } from '../ui/primitives'
import { ease, item, list } from '../ui/motion'
import { useDiary, useProfile, useSync } from '../lib/api'
import { placeIcon } from '../ui/placeIcon'
import { NICHES, VERDICT_LABEL, nicheLabel, timeAgo, vibeLabel } from '../lib/labels'
import { resetAll } from '../db/db'

export function ProfilePage() {
  const nav = useNavigate()
  const { data: me } = useProfile()
  const { data } = useDiary()
  const sync = useSync().data
  const qc = useQueryClient()
  const toast = useToast()
  async function eraseAll() {
    if (!confirm('Apagar seu perfil, avaliações e participação em turmas do servidor e deste celular? Não dá pra desfazer.')) return
    const r = await deleteMe()
    if (!r) { toast('Servidor fora do ar: tente de novo daqui a pouco pra apagar também de lá.'); return }
    await resetAll()
  }

  const diary = data?.diary ?? []
  const requests = data?.requests ?? []

  // curadoria: quanto você já validou em cada nicho
  const scores = NICHES.map((n) => {
    const fromReviews = diary.filter((d) => d.went && d.place.niches.includes(n.id)).length * 18
    const fromTaste = me?.niches.includes(n.id) ? 22 : 0
    return { ...n, score: Math.min(100, fromReviews + fromTaste + (requests.filter((r) => r.criteria.niches.includes(n.id)).length * 6)) }
  }).sort((a, b) => b.score - a.score)
  const rep = diary.length * 15 + requests.length * 5

  if (!me) return <Page tabbed><Skeleton className="m-5 h-40" /></Page>

  return (
    <Page tabbed>
      <header className="relative px-5 pt-16">
        <div className="pointer-events-none absolute -top-10 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `hsl(${me.hue} 90% 60% / .18)` }} />
        <div className="relative flex items-end justify-between">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
            <Avatar name={me.name} hue={me.hue} size={76} />
          </motion.div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => nav('/onboarding')} className="grid size-10 place-items-center rounded-full bg-white/[0.06]" aria-label="Editar gosto">
            <Settings2 size={16} />
          </motion.button>
        </div>
        <h1 className="relative mt-4 font-serif text-[42px] leading-none">{me.name}</h1>
        <p className="mt-1 text-sm text-mute">{me.handle} · {me.hood}</p>

        <div className="mt-6 grid grid-cols-3 divide-x divide-line rounded-[22px] border border-line bg-surface/60 py-4 text-center">
          {[{ k: 'rolês', v: diary.filter((d) => d.went).length }, { k: 'pedidos', v: requests.length }, { k: 'reputação', v: rep }].map((s) => (
            <div key={s.k}>
              <AnimatedNumber value={s.v} className="font-serif text-3xl leading-none" />
              <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-mute">{s.k}</p>
            </div>
          ))}
        </div>
      </header>

      {!me.email && (
        <section className="mx-5 mt-6 rounded-[22px] border border-accent/40 bg-accent/[0.05] p-4">
          <p className="text-[14px] font-medium">Salve seu perfil com a conta Google</p>
          <p className="mb-3 mt-1 text-[13px] text-mute">Sem login, trocar de celular ou limpar o navegador apaga seu gosto, avaliações e turmas.</p>
          <GoogleButton text="signin_with" onDone={(r) => {
            if (!r.ok) return
            if (r.existing) { window.location.assign(import.meta.env.BASE_URL); return }
            toast('Conta Google ligada')
            qc.invalidateQueries({ queryKey: ['me'] })
          }} />
        </section>
      )}

      <section className="mt-8">
        <SectionTitle>Seu gosto</SectionTitle>
        <div className="flex flex-wrap gap-1.5 px-5">
          {me.niches.map((n) => <Tag key={n} tone="accent">{nicheLabel(n)}</Tag>)}
          {me.vibes.map((v) => <Tag key={v}>{vibeLabel(v)}</Tag>)}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle aside={<span className="text-xs text-faint">sobe quando você avalia</span>}>Curadoria</SectionTitle>
        <motion.div variants={list} initial="initial" animate="animate" className="grid gap-3 px-5">
          {scores.slice(0, 4).map((s) => (
            <motion.div key={s.id} variants={item}>
              <div className="mb-1.5 flex justify-between text-[13px]"><span>{s.label}</span><span className="text-mute">{s.score}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${s.score}%` }} transition={{ duration: 1.1, ease, delay: 0.2 }} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mt-9">
        <SectionTitle>Diário</SectionTitle>
        <div className="grid gap-2 px-5">
          {!diary.length && (
            <div className="rounded-[22px] border border-dashed border-line p-5 text-center text-sm text-mute">
              Nenhum rolê avaliado ainda. Faça um pedido, feche com o grupo e conte como foi.
            </div>
          )}
          {diary.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.5, ease }}>
              <Link to={`/lugar/${d.place.id}`} className="flex items-center gap-3 rounded-[20px] bg-surface p-2.5 pr-4">
                <Cover hue={d.place.hue} icon={placeIcon(d.place)} iconSize={22} className="size-14 shrink-0" rounded="rounded-[14px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{d.place.name}</p>
                  <p className="truncate text-xs text-mute">{d.went ? (d.verdict ? VERDICT_LABEL[d.verdict] : '') : 'não rolou'}{d.note ? ` · ${d.note}` : ''}</p>
                </div>
                <span className="text-[11px] text-faint">{timeAgo(d.createdAt)}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <SectionTitle>Seus pedidos</SectionTitle>
        <div className="grid gap-2 px-5">
          {!requests.length && <p className="text-sm text-faint">Nenhum ainda.</p>}
          {requests.map((r) => (
            <Link key={r.id} to={`/pedido/${r.id}`} className="flex items-center gap-3 rounded-[20px] border border-line p-4 text-[14px] hover:bg-surface">
              <span className="line-clamp-1 flex-1">“{r.text}”</span>
              {r.status === 'decidido' ? <Tag tone="accent">decidido</Tag> : <ArrowUpRight size={14} className="text-mute" />}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <SectionTitle>Conta e dados</SectionTitle>
        <div className="mx-5 divide-y divide-line overflow-hidden rounded-[22px] border border-line">
          {me.email && <p className="flex items-center gap-3 px-4 py-3.5 text-[14px]"><ShieldCheck size={16} className="text-accent" /><span className="min-w-0 flex-1 truncate">Conta Google · {me.email}</span></p>}
          <Link to="/turmas" className="flex items-center gap-3 px-4 py-3.5">
            <Users size={16} className="text-accent" />
            <span className="flex-1 text-[14px]">Suas turmas</span>
            <ArrowUpRight size={14} className="text-mute" />
          </Link>
          <Link to="/privacidade" className="flex items-center gap-3 px-4 py-3.5">
            <ShieldCheck size={16} className="text-mute" />
            <span className="flex-1 text-[14px]">Aviso de privacidade</span>
            <ArrowUpRight size={14} className="text-mute" />
          </Link>
          <button onClick={eraseAll} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <Trash2 size={16} className="text-[#ff8a8a]" />
            <span className="flex-1 text-[14px] text-[#ff8a8a]">Apagar meus dados</span>
          </button>
        </div>
      </section>

      <section className="mt-9">
        <SectionTitle>Curadoria</SectionTitle>
        <div className="mx-5 divide-y divide-line overflow-hidden rounded-[22px] border border-line">
          <Link to="/indicar" className="flex items-center gap-3 px-4 py-3.5">
            <MapPinPlus size={16} className="text-accent" />
            <span className="flex-1">
              <span className="block text-[14px]">Indicar um lugar</span>
              <span className="block text-xs text-mute">Entra no catálogo curado pela comunidade</span>
            </span>
            <ArrowUpRight size={14} className="text-mute" />
          </Link>
          <Link to="/fundador" className="flex items-center gap-3 px-4 py-3.5">
            <Sparkles size={16} className="text-mute" />
            <span className="flex-1 text-[14px]">Curador fundador · o que falta curar</span>
            <ArrowUpRight size={14} className="text-mute" />
          </Link>
          <Link to="/divulgar" className="flex items-center gap-3 px-4 py-3.5">
            <Megaphone size={16} className="text-mute" />
            <span className="flex-1 text-[14px]">Divulgar um evento</span>
            <ArrowUpRight size={14} className="text-mute" />
          </Link>
          {sync?.curator && <Link to="/testes" className="flex items-center gap-3 px-4 py-3.5">
            <BarChart3 size={16} className="text-mute" />
            <span className="flex-1 text-[14px]">{sync.admin ? 'Painel do admin' : 'Painel da curadoria'}</span>
            <ArrowUpRight size={14} className="text-mute" />
          </Link>}
        </div>
      </section>

      <div className="mt-10 flex justify-center">
        <button onClick={resetAll} className="flex items-center gap-2 text-xs text-faint hover:text-ink"><RotateCcw size={12} /> zerar dados locais</button>
      </div>
    </Page>
  )
}
