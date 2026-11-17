import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button, Chip, Page } from '../ui/primitives'
import { ease } from '../ui/motion'
import { HOODS, NICHES, VIBES } from '../lib/labels'
import { useProfile, useSaveProfile } from '../lib/api'
import { track } from '../lib/track'
import type { Niche, Vibe } from '../lib/types'

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function Onboarding() {
  const nav = useNavigate()
  const save = useSaveProfile()
  const { data: me } = useProfile()
  // editar gosto depois: pula a tela de boas-vindas e já vem preenchido
  const [step, setStep] = useState(me?.onboarded ? 1 : 0)
  const [dir, setDir] = useState(1)
  const [name, setName] = useState(me?.name ?? '')
  const [hood, setHood] = useState(me?.hood ?? 'Pinheiros')
  const [niches, setNiches] = useState<Niche[]>(me?.niches ?? [])
  const [vibes, setVibes] = useState<Vibe[]>(me?.vibes ?? [])

  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n) }
  const canNext = [true, name.trim().length > 1, niches.length > 0, vibes.length > 0][step]

  async function finish() {
    const first = name.trim().split(' ')[0]
    await save.mutateAsync({
      name: name.trim(), handle: '@' + first.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''),
      hood, niches, vibes, onboarded: true,
    })
    track(me?.onboarded ? 'taste_edited' : 'onboarding_done', { niches, vibes, hood })
    // veio de um convite (ex.: evento divulgado): volta pro que a pessoa estava fazendo
    let next: string | null = null
    try { next = localStorage.getItem('role.next'); localStorage.removeItem('role.next') } catch { /* */ }
    nav(next && next.startsWith('/') ? next : '/', { replace: true })
  }

  return (
    <Page className="flex flex-col">
      {step > 0 && (
        <div className="flex gap-1.5 px-6 pt-14">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full bg-accent" initial={false} animate={{ width: step >= i ? '100%' : '0%' }} transition={{ duration: 0.6, ease }} />
            </div>
          ))}
        </div>
      )}

      <div className="relative flex-1">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.section
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 60, opacity: 0, filter: 'blur(8px)' }),
              center: { x: 0, opacity: 1, filter: 'blur(0px)' },
              exit: (d: number) => ({ x: d * -60, opacity: 0, filter: 'blur(8px)' }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease }}
            className="no-scrollbar absolute inset-0 flex flex-col overflow-y-auto px-6 pb-6 pt-10"
          >
            {step === 0 && <Welcome />}
            {step === 1 && (
              <>
                <h1 className="font-serif text-[44px] leading-[0.95] tracking-tight">Como a galera<br /><em className="text-accent">te chama?</em></h1>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="mt-10 w-full border-b border-line bg-transparent pb-3 text-2xl outline-none placeholder:text-faint focus:border-accent transition-colors"
                />
                <p className="mt-10 mb-3 text-sm text-mute">Seu bairro base</p>
                <div className="flex flex-wrap gap-2">
                  {HOODS.map((h) => <Chip key={h} active={hood === h} onClick={() => setHood(h)}>{h}</Chip>)}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className="font-serif text-[44px] leading-[0.95] tracking-tight">Qual é o<br /><em className="text-accent">seu rolê?</em></h1>
                <p className="mt-3 text-sm text-mute">Escolha quantos quiser. Isso treina suas recomendações.</p>
                <div className="mt-6 grid gap-2">
                  {NICHES.map((n, i) => {
                    const on = niches.includes(n.id)
                    return (
                      <motion.button
                        key={n.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: 0.05 * i, duration: 0.5, ease } }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setNiches((a) => toggle(a, n.id))}
                        className={`relative flex items-center justify-between overflow-hidden rounded-2xl border px-4 py-3 text-left transition-colors ${on ? 'border-accent/60' : 'border-line bg-white/[0.02]'}`}
                      >
                        {on && <motion.span layoutId={`n-${n.id}`} className="absolute inset-0 bg-accent/[0.08]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
                        <span className="relative">
                          <span className="block text-[15px]">{n.label}</span>
                          <span className="block text-xs text-mute">{n.hint}</span>
                        </span>
                        <motion.span
                          className="relative grid size-6 place-items-center rounded-full border border-line"
                          animate={{ backgroundColor: on ? '#c6ff3d' : 'rgba(0,0,0,0)', borderColor: on ? '#c6ff3d' : 'rgba(255,255,255,0.12)', scale: on ? [1, 1.25, 1] : 1 }}
                          transition={{ duration: 0.35 }}
                        >
                          {on && <span className="size-2 rounded-full bg-accent-ink" />}
                        </motion.span>
                      </motion.button>
                    )
                  })}
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h1 className="font-serif text-[44px] leading-[0.95] tracking-tight">E a <em className="text-accent">vibe</em><br />que te pega?</h1>
                <p className="mt-3 text-sm text-mute">A gente cruza isso com o que a comunidade avalia.</p>
                <div className="mt-8 flex flex-wrap gap-2.5">
                  {VIBES.map((v) => <Chip key={v.id} active={vibes.includes(v.id)} onClick={() => setVibes((a) => toggle(a, v.id))} className="h-11 px-5 text-sm">{v.label}</Chip>)}
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 bg-gradient-to-t from-bg via-bg to-bg/0 px-6 pb-10 pt-4">
        {step > 0 ? <Button variant="ghost" onClick={() => go(step - 1)}>Voltar</Button> : <span />}
        <Button
          size="lg"
          disabled={!canNext || save.isPending}
          onClick={() => (step < 3 ? go(step + 1) : finish())}
          icon={step === 3 ? <Sparkles size={16} /> : undefined}
        >
          {step === 0 ? 'Começar' : step === 3 ? 'Montar meu feed' : 'Continuar'}
          {step < 3 && <ArrowRight size={16} />}
        </Button>
      </div>
    </Page>
  )
}

function Welcome() {
  return (
    <div className="flex flex-1 flex-col justify-end pb-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60%]">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full blur-3xl"
            style={{
              width: 260 - i * 50, height: 260 - i * 50,
              left: `${15 + i * 25}%`, top: `${10 + i * 12}%`,
              background: ['#c6ff3d', '#7c5cff', '#ff5c8a'][i], opacity: 0.35,
            }}
            animate={{ x: [0, 30 - i * 20, 0], y: [0, 20 + i * 10, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 8 + i * 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2 } }} className="relative mb-4 font-serif text-2xl italic text-accent">rolê.</motion.p>
      <h1 className="relative font-serif text-[56px] leading-[0.92] tracking-tight text-balance">
        {['O rolê certo,', 'pra cada', 'ocasião.'].map((l, i) => (
          <motion.span key={i} className="block" initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease }}>
            {i === 2 ? <em>{l}</em> : l}
          </motion.span>
        ))}
      </h1>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.6, ease }} className="relative mt-6 max-w-[290px] text-[15px] leading-relaxed text-mute">
        Diga o que você quer. A IA sugere, a comunidade refina, sua turma vota.
      </motion.p>
    </div>
  )
}
