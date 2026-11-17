import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, ArrowUp, Banknote, Clock, MapPin, Minus, Music2, Plus, Sparkles, Tag as TagIcon, Users, Wand2 } from 'lucide-react'
import { Chip, Page, TopBar, cx } from '../ui/primitives'
import { ease, pop } from '../ui/motion'
import { OCCASIONS, VIBES, nicheLabel, occasionLabel, vibeLabel } from '../lib/labels'
import { track } from '../lib/track'
import { isVague } from '../mocks/ranker'
import { parseText, useCreateRequest } from '../lib/api'
import type { Criteria, Occasion, Vibe } from '../lib/types'

const EXAMPLES = [
  'aniversário pra 14 pessoas sábado em Pinheiros, até R$ 90',
  'listening bar tranquilo pra um date na quinta',
  'quero comer acepipes com chopp gelado, boteco raiz',
  'balada de eletrônica underground pra ir sozinho',
  'happy hour da firma pra 25 perto da Paulista',
  'domingo à tarde ao ar livre, pet friendly',
]

const TAG_TEXT: Record<string, string> = { vegano: 'vegano', samba: 'samba', pet: 'pet friendly', acessivel: 'acessível', karaoke: 'karaokê', funk: 'funk', sertanejo: 'sertanejo', 'open-bar': 'open bar' }

export function NewRequest() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const create = useCreateRequest()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<Criteria | null>(null)
  const [occasion, setOccasion] = useState<Occasion | undefined>((params.get('o') as Occasion) || undefined)
  const [group, setGroup] = useState<number | undefined>()
  const [vibes, setVibes] = useState<Vibe[]>([])
  const [clarify, setClarify] = useState(false)
  const [ex, setEx] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const id = setInterval(() => setEx((x) => (x + 1) % EXAMPLES.length), 3200)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!text.trim()) { setParsed(null); return }
    const t = setTimeout(() => parseText(text).then(setParsed), 220)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => { setTimeout(() => ta.current?.focus(), 450) }, [])

  const occ = occasion ?? parsed?.occasion
  const size = group ?? parsed?.groupSize ?? 4

  const detected: { key: string; icon: React.ReactNode; label: string }[] = []
  if (occ) detected.push({ key: 'o', icon: <Sparkles size={12} />, label: occasionLabel(occ) })
  if (parsed && (parsed.groupSize > 2 || group)) detected.push({ key: 'g', icon: <Users size={12} />, label: `${size} pessoas` })
  if (parsed?.hood) detected.push({ key: 'h', icon: <MapPin size={12} />, label: parsed.hood })
  if (parsed?.when) detected.push({ key: 'w', icon: <Clock size={12} />, label: parsed.when.label })
  if (parsed?.budget) detected.push({ key: 'b', icon: <Banknote size={12} />, label: `até R$ ${parsed.budget}` })
  parsed?.niches.forEach((n) => detected.push({ key: 'n' + n, icon: <Music2 size={12} />, label: nicheLabel(n) }))
  parsed?.vibes.forEach((v) => detected.push({ key: 'v' + v, icon: null, label: vibeLabel(v) }))
  parsed?.tags.filter((t) => !parsed.unmet.includes(TAG_TEXT[t]) && !parsed.unmet.includes(t)).forEach((t) => detected.push({ key: 't' + t, icon: <TagIcon size={12} />, label: TAG_TEXT[t] }))
  const unmet = parsed?.unmet ?? []

  async function submit(force = false) {
    if (text.trim().length < 6) return
    // pedido vago: pergunta antes de chutar (uma vez)
    const vague = parsed ? isVague({ ...parsed, occasion: occ, vibes: [...parsed.vibes, ...vibes] }) : true
    if (vague && !force && !clarify) { setClarify(true); track('clarify_shown', { text }); return }
    const { id } = await create.mutateAsync({ text, overrides: { occasion, groupSize: group, vibes: vibes.length ? [...new Set([...(parsed?.vibes ?? []), ...vibes])] : undefined } })
    track('request_created', { vague, clarified: clarify, groupSize: size, occasion: occ, niches: parsed?.niches, unmet })
    nav(`/pedido/${id}`, { replace: true })
  }

  return (
    <Page>
      <TopBar title="Novo pedido" />
      <div className="px-5 pb-28 pt-2">
        <motion.div layoutId="composer" transition={{ type: 'spring', stiffness: 300, damping: 34 }} className="relative rounded-[28px] border border-line bg-surface p-4">
          <div className="relative">
            <textarea
              ref={ta}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
              aria-label="Descreva o rolê"
              rows={4}
              className="relative z-10 w-full bg-transparent text-[19px] leading-snug outline-none"
            />
            <AnimatePresence mode="wait">
              {!text && (
                <motion.p
                  key={ex}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.45, ease }}
                  className="pointer-events-none absolute inset-0 text-[19px] leading-snug text-faint"
                >
                  {EXAMPLES[ex]}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="flex min-h-8 flex-wrap items-center gap-1.5">
            <AnimatePresence mode="popLayout">
              {detected.map((d) => (
                <motion.span key={d.key} layout variants={pop} initial="initial" animate="animate" exit="exit" className="inline-flex h-7 items-center gap-1 rounded-full bg-accent/12 px-2.5 text-xs text-accent">
                  {d.icon}{d.label}
                </motion.span>
              ))}
            </AnimatePresence>
            {!detected.length && <span className="flex items-center gap-1.5 text-xs text-faint"><Wand2 size={12} /> a IA entende ocasião, grupo, dia, bairro, preço e vibe</span>}
          </div>
          <AnimatePresence>
            {unmet.length > 0 && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 flex items-center gap-1.5 overflow-hidden text-xs text-amber-300/90">
                <AlertCircle size={12} /> Ainda não tenho {unmet.join(' nem ')} no catálogo — vou trazer o mais próximo.
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {clarify && (
            <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease }} className="overflow-hidden">
              <div className="mt-4 rounded-[24px] border border-accent/25 bg-accent/[0.05] p-4">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-accent"><Sparkles size={13} /> Me ajuda a acertar</p>
                <p className="mt-2 text-[14px] text-ink/85">Ficou bem aberto. Escolhe a ocasião ou o clima abaixo — ou busca assim mesmo.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {VIBES.map((v) => <Chip key={v.id} active={vibes.includes(v.id)} onClick={() => setVibes((a) => (a.includes(v.id) ? a.filter((x) => x !== v.id) : [...a, v.id]))}>{v.label}</Chip>)}
                </div>
                <button onClick={() => submit(true)} className="mt-3 text-xs text-mute underline decoration-white/20 underline-offset-4 hover:text-ink">Buscar assim mesmo</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.5, ease } }}>
          <p className="mb-2.5 mt-7 text-[13px] uppercase tracking-[0.14em] text-mute">Ocasião</p>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <Chip key={o.id} active={occ === o.id} onClick={() => setOccasion(occasion === o.id ? undefined : o.id)}>{o.label}</Chip>
            ))}
          </div>

          <p className="mb-2.5 mt-7 text-[13px] uppercase tracking-[0.14em] text-mute">Quantas pessoas</p>
          <div className="flex items-center gap-4">
            <Stepper onClick={() => setGroup(Math.max(1, size - 1))}><Minus size={16} /></Stepper>
            <div className="w-14 overflow-hidden text-center font-serif text-5xl leading-none">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={size} className="inline-block" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
                  {size}
                </motion.span>
              </AnimatePresence>
            </div>
            <Stepper onClick={() => setGroup(Math.min(80, size + 1))}><Plus size={16} /></Stepper>
          </div>
        </motion.div>
      </div>

      <div className="bottom-bar absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/90 to-transparent px-5 pb-8 pt-10">
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={text.trim().length < 6 || create.isPending}
          onClick={() => submit()}
          className={cx(
            'relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-full font-medium transition-all duration-500',
            text.trim().length >= 6 ? 'bg-accent text-accent-ink shadow-[0_10px_40px_-10px_rgba(198,255,61,0.7)]' : 'bg-white/[0.06] text-faint',
          )}
        >
          {create.isPending ? (
            <>
              <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent" animate={{ x: ['-100%', '100%'] }} transition={{ repeat: Infinity, duration: 1 }} />
              <span className="relative">Procurando o rolê…</span>
            </>
          ) : (
            <>{clarify ? 'Buscar com esses filtros' : 'Encontrar o rolê'} <ArrowUp size={16} /></>
          )}
        </motion.button>
      </div>
    </Page>
  )
}

function Stepper({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.88 }} onClick={onClick} className="grid size-11 place-items-center rounded-full bg-white/[0.07] hover:bg-white/[0.1]">
      {children}
    </motion.button>
  )
}
