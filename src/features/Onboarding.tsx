import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, LoaderCircle, LocateFixed, MapPin, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Chip, Page } from '../ui/primitives'
import { ease } from '../ui/motion'
import { HOODS, NICHES, VIBES } from '../lib/labels'
import { useProfile, useSaveProfile } from '../lib/api'
import { track } from '../lib/track'
import type { Home, Niche, Vibe } from '../lib/types'
import { homeFromCep, homeFromGps, hoodFor } from '../mocks/region'
import { centerOf, discoverForTaste } from '../lib/gdiscover'
import { registerHood } from '../lib/hours'
import { useToast } from '../ui/Toast'
import { GoogleButton } from './GoogleButton'
import type { LoginOutcome } from '../lib/googleAuth'

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
  // região precisa ser escolhida (GPS, CEP ou bairro): antes o app assumia Pinheiros sem avisar
  const [hoodPicked, setHoodPicked] = useState(!!me?.onboarded)
  const [niches, setNiches] = useState<Niche[]>(me?.niches ?? [])
  const [vibes, setVibes] = useState<Vibe[]>(me?.vibes ?? [])
  const [home, setHome] = useState<Home | undefined>(me?.home)
  const [loadingRegion, setLoadingRegion] = useState(false)
  const [consent, setConsent] = useState(!!me?.consentAt)
  const [email, setEmail] = useState(me?.email)
  const onGoogle = useCallback((r: LoginOutcome) => {
    if (!r.ok) return
    // conta que já existia: perfil, avaliações e turmas voltaram — recarrega já dentro do app
    if (r.existing) { window.location.assign(import.meta.env.BASE_URL); return }
    setEmail(r.email)
    if (r.name) setName((n) => n || r.name!)
    setDir(1); setStep(1)
  }, [])
  const qc = useQueryClient()
  const toast = useToast()

  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n) }
  // 2 passos: (1) nome + região, (2) estilos + vibes (opcionais) + aceite
  const LAST = 2
  const canNext = [true, name.trim().length > 1 && (!!home || hoodPicked), niches.length > 0 && consent][step]

  async function finish() {
    const first = name.trim().split(' ')[0]
    const finalHood = home ? hoodFor(home) : hood
    await save.mutateAsync({
      name: name.trim(), handle: '@' + first.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''),
      hood: finalHood, home, niches, vibes, onboarded: true, consentAt: me?.consentAt ?? Date.now(), email,
    })
    track(me?.onboarded ? 'taste_edited' : 'onboarding_done', { niches, vibes, hood: finalHood, via: home?.via ?? 'bairro' })
    // lugares reais em volta, ao vivo no Google: abertos, até 5 km, do gosto escolhido
    if (home) registerHood(finalHood, [home.lat, home.lng])
    setLoadingRegion(true)
    const n = await Promise.race([discoverForTaste(centerOf({ home, hood: finalHood }), niches), new Promise<number>((res) => setTimeout(() => res(-1), 9000))])
    setLoadingRegion(false)
    track('region_loaded', { n, via: home?.via ?? 'bairro' })
    if (n > 0) { qc.invalidateQueries(); toast(`${n} lugares abertos perto de você que combinam com seu gosto`) }
    // veio de um convite (ex.: evento divulgado): volta pro que a pessoa estava fazendo
    let next: string | null = null
    try { next = localStorage.getItem('role.next'); localStorage.removeItem('role.next') } catch { /* */ }
    nav(next && next.startsWith('/') ? next : '/', { replace: true })
  }

  return (
    <Page className="flex flex-col">
      {step > 0 && (
        <div className="flex gap-1.5 px-6 pt-14">
          {[1, 2].map((i) => (
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
            {step === 0 && <Welcome onGoogle={onGoogle} />}
            {step === 1 && (
              <>
                <h1 className="font-serif text-[44px] leading-[0.95] tracking-tight">De onde você<br /><em className="text-accent">sai pro rolê?</em></h1>
<Region home={home} setHome={setHome} hood={hood} setHood={(h) => { setHood(h); setHoodPicked(true) }} />
                <input
                  enterKeyHint="done"
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="mt-8 w-full border-b border-line bg-transparent pb-3 text-2xl outline-none placeholder:text-faint focus:border-accent transition-colors"
                />
                {name.trim().length > 1 && !home && !hoodPicked && <p className="mt-4 text-[13px] text-accent">Falta escolher onde você costuma sair ↑</p>}
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

                <h2 className="mt-8 text-sm text-mute">E a vibe? <span className="text-faint">(opcional)</span></h2>
                
                <div className="mt-3 flex flex-wrap gap-2">
                  {VIBES.map((v) => <Chip key={v.id} active={vibes.includes(v.id)} onClick={() => setVibes((a) => toggle(a, v.id))} className="h-10 px-4 text-sm">{v.label}</Chip>)}
                </div>
                <label className="mt-8 flex items-start gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 text-[13px] leading-relaxed text-ink/85">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#c6ff3d]" />
                  <span>
                    Concordo em salvar meu nome, gosto e região (~1 km) pra montar recomendações e as votações com a minha turma.{' '}
                    <Link to="/privacidade" className="text-accent underline-offset-4 hover:underline">Aviso de privacidade</Link> · dá pra apagar tudo no Perfil.
                  </span>
                </label>
                            </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 bg-gradient-to-t from-bg via-bg to-bg/0 px-6 pb-10 pt-4">
        {step > 0 ? <Button variant="ghost" onClick={() => go(step - 1)}>Voltar</Button> : <span />}
        <Button
          size="lg"
          disabled={!canNext || save.isPending || loadingRegion}
          onClick={() => (step < LAST ? go(step + 1) : finish())}
          icon={step === LAST ? <Sparkles size={16} /> : undefined}
        >
          {loadingRegion ? <><LoaderCircle size={16} className="animate-spin" />Buscando lugares perto de você…</> : step === 0 ? 'Começar' : step === LAST ? 'Montar meu feed' : 'Continuar'}
          {step < LAST && <ArrowRight size={16} />}
        </Button>
      </div>
    </Page>
  )
}

/** região: localização (GPS) ou CEP; escolher bairro fica como alternativa */
function Region({ home, setHome, hood, setHood }: { home?: Home; setHome: (h?: Home) => void; hood: string; setHood: (h: string) => void }) {
  const [cep, setCep] = useState('')
  const [busy, setBusy] = useState<'gps' | 'cep' | null>(null)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState(!!home && home.via === 'bairro')
  const MSG = { negado: 'Localização bloqueada. Use o CEP ou escolha o bairro.', indisponivel: 'Não deu pra pegar a localização. Tente o CEP.', cep: 'CEP inválido.', offline: 'Não achei esse CEP (ou o servidor está fora). Escolha o bairro.' } as const
  async function run(kind: 'gps' | 'cep') {
    setBusy(kind); setErr('')
    const r = kind === 'gps' ? await homeFromGps() : await homeFromCep(cep)
    setBusy(null)
    if (r.ok) { setHome(r.home); setManual(false); track('region_set', { via: r.home.via }) } else setErr(MSG[r.reason])
  }
  const fmtCep = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d }
  return (
    <div className="mt-8">
      <p className="mb-1 text-sm text-ink">Onde você costuma sair?</p>
      <p className="mb-3 text-xs text-faint">A gente carrega os lugares reais perto de você. Guardamos só a região (~1 km), nunca o endereço.</p>
      {home && home.via !== 'bairro' ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/[0.06] px-4 py-3">
          <span className="flex min-w-0 items-center gap-2 text-[15px]"><MapPin size={16} className="shrink-0 text-accent" /><span className="truncate">{home.label}{home.city && home.city !== home.label ? ` · ${home.city}` : ''}</span></span>
          <button className="shrink-0 text-[13px] text-mute underline-offset-4 hover:underline" onClick={() => setHome(undefined)}>trocar</button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Button variant="soft" className="w-full" disabled={!!busy} onClick={() => run('gps')}
            icon={busy === 'gps' ? <LoaderCircle size={16} className="animate-spin" /> : <LocateFixed size={16} />}>
            Usar minha localização
          </Button>
          <div className="flex gap-2">
            <input inputMode="numeric" autoComplete="postal-code" value={cep} onChange={(e) => setCep(fmtCep(e.target.value))} placeholder="ou seu CEP"
              onKeyDown={(e) => { if (e.key === 'Enter' && cep.replace(/\D/g, '').length === 8) run('cep') }}
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 outline-none placeholder:text-faint focus:border-accent" />
            <Button variant="soft" disabled={!!busy || cep.replace(/\D/g, '').length !== 8} onClick={() => run('cep')}
              icon={busy === 'cep' ? <LoaderCircle size={16} className="animate-spin" /> : undefined}>Buscar</Button>
          </div>
          {err && <p className="text-[13px] text-[#ff8a8a]">{err}</p>}
          <button className="mt-1 w-fit text-[13px] text-mute underline-offset-4 hover:underline" onClick={() => setManual((m) => !m)}>
            {manual ? 'esconder bairros' : 'prefiro escolher um bairro'}
          </button>
          {manual && (
            <div className="flex flex-wrap gap-2">
              {HOODS.map((h) => <Chip key={h} active={!home && hood === h} onClick={() => { setHood(h); setHome(undefined) }}>{h}</Chip>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Welcome({ onGoogle }: { onGoogle: (r: LoginOutcome) => void }) {
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="relative mt-8 grid gap-2">
        <GoogleButton onDone={onGoogle} />
        <p className="text-center text-[12px] text-faint">Com a conta Google, seu perfil e suas turmas te acompanham em qualquer celular. Ou toque em Começar pra seguir sem conta.</p>
      </motion.div>
    </div>
  )
}
