import { celebrate, StarBurst } from '../ui/Celebrate'
import { useProfile } from '../lib/api'
import { VERDICT_LABEL } from '../lib/labels'
import { StorySheet } from './StorySheet'
import type { StoryCard } from '../lib/storyCard'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Frown, Heart, Meh, Sparkles } from 'lucide-react'
import { Avatar, Button, Cover, EmptyState, Overlay, Page, Skeleton, TopBar, cx } from '../ui/primitives'
import { placeIcon } from '../ui/placeIcon'
import { track } from '../lib/track'
import { useToast } from '../ui/Toast'
import { ease, spring } from '../ui/motion'
import { useCreateReview, useRequest } from '../lib/api'
import type { Person, Verdict } from '../lib/types'

const VERDICTS: { id: Verdict; label: string; icon: typeof Heart }[] = [
  { id: 'amei', label: 'Amei', icon: Heart },
  { id: 'ok', label: 'Foi ok', icon: Meh },
  { id: 'nao-curti', label: 'Não curti', icon: Frown },
]

export function ReviewPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { data, isError } = useRequest(id)
  const create = useCreateReview()
  const [went, setWent] = useState<boolean | null>(null)
  const [placeId, setPlaceId] = useState<string>()
  const [verdict, setVerdict] = useState<Verdict>()
  const [note, setNote] = useState('')
  const [credited, setCredited] = useState<Person | null | undefined>(undefined)
  const [story, setStory] = useState<StoryCard | null>(null)
  const me = useProfile().data

  useEffect(() => {
    if (data && !placeId) setPlaceId(data.request.decidedPlaceId ?? data.options[0]?.id)
  }, [data, placeId])

  async function submit() {
    if (!placeId || went === null) return
    const res = await create.mutateAsync({ requestId: id, placeId, went, verdict: went ? verdict : undefined, note })
    track('review_saved', { went, verdict, credited: !!res.credited })
    try { localStorage.setItem(`role.reviewed.${id}`, '1') } catch { /* */ }
    setCredited(res.credited)
    if (!res.credited) {
      if (went) celebrate({ kind: 'check', title: 'Avaliação salva', text: 'Vira curadoria e soma pontos no seu perfil' })
      else toast('Avaliação salva no seu diário')
      // foi e avaliou: oferece postar a avaliação no Story (fecha → vai pro perfil)
      const p = data?.options.find((o) => o.id === placeId)
      if (went && verdict && p) setStory({ kind: 'avaliacao', place: p, verdict: VERDICT_LABEL[verdict], note: note.trim() || undefined, author: me?.name.split(' ')[0] ?? 'Alguém' })
      else nav('/perfil')
    }
  }

  const ready = went === false || (went && placeId && verdict)
  if (isError) return <Page><TopBar /><EmptyState title="Pedido não encontrado" text="Não achei esse rolê neste aparelho." action={<Button onClick={() => nav('/')}>Ir pro início</Button>} /></Page>

  const footer = <Button size="lg" className="w-full" disabled={!ready || create.isPending} onClick={submit}>Salvar no diário</Button>

  return (
    <Page footer={footer}>
      <TopBar title="Pós-rolê" />
      {!data ? <Skeleton className="m-5 h-60" /> : (
        <div className="px-5">
          <h1 className="font-serif text-[44px] leading-[0.95] tracking-tight">E aí,<br /><em className="text-accent">foi?</em></h1>
          <p className="mt-3 text-sm text-mute">Sua resposta ajusta suas recomendações e dá reputação a quem indicou.</p>

          <div className="mt-7 grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <motion.button key={String(v)} whileTap={{ scale: 0.96 }} onClick={() => setWent(v)}
                className={cx('h-16 rounded-[20px] border text-[15px] transition-colors', went === v ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface')}>
                {v ? 'Fui' : 'Não rolou'}
              </motion.button>
            ))}
          </div>

          <AnimatePresence>
            {went && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease }} className="overflow-hidden">
                <p className="mb-3 mt-8 text-[13px] uppercase tracking-[0.14em] text-mute">Onde?</p>
                <div className="grid gap-2">
                  {data.options.map((p) => (
                    <motion.button key={p.id} whileTap={{ scale: 0.98 }} onClick={() => setPlaceId(p.id)}
                      className={cx('flex items-center gap-3 rounded-[20px] border p-2.5 text-left transition-colors', placeId === p.id ? 'border-accent/70 bg-accent/[0.06]' : 'border-line')}>
                      <Cover hue={p.hue} icon={placeIcon(p)} iconSize={18} className="size-11" rounded="rounded-[12px]" />
                      <span className="flex-1 text-[15px]">{p.name}</span>
                      <motion.span className="mr-2 size-5 rounded-full border" animate={{ backgroundColor: placeId === p.id ? '#c6ff3d' : 'rgba(0,0,0,0)', borderColor: placeId === p.id ? '#c6ff3d' : 'rgba(255,255,255,.15)' }} />
                    </motion.button>
                  ))}
                </div>

                <p className="mb-3 mt-8 text-[13px] uppercase tracking-[0.14em] text-mute">Como foi?</p>
                <div className="grid grid-cols-3 gap-2">
                  {VERDICTS.map(({ id: v, label, icon: Icon }) => {
                    const on = verdict === v
                    return (
                      <motion.button key={v} whileTap={{ scale: 0.92 }} onClick={() => setVerdict(v)}
                        className={cx('flex flex-col items-center gap-2 rounded-[22px] border py-5 text-sm transition-colors', on ? 'border-accent bg-accent/10 text-accent' : 'border-line text-mute')}>
                        <motion.span animate={on ? { scale: [1, 1.35, 1], rotate: [0, -10, 0] } : { scale: 1 }} transition={{ duration: 0.45 }}>
                          <Icon size={26} className={on && v === 'amei' ? 'fill-current' : ''} />
                        </motion.span>
                        {label}
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {went !== null && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }}>
                <p className="mb-3 mt-8 text-[13px] uppercase tracking-[0.14em] text-mute">Uma linha pro diário (opcional)</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={went ? 'o que fez valer (ou não)…' : 'o que aconteceu…'}
                  className="w-full rounded-[20px] border border-line bg-surface p-4 text-[15px] outline-none transition-colors placeholder:text-faint focus:border-accent/50" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}


      <Overlay>
      <AnimatePresence>
        {credited && (
          <motion.div className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg/92 px-8 text-center backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="relative">
              <StarBurst />
              <Avatar name={credited.name} hue={credited.hue} size={96} />
              <motion.span initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.35, ...spring }} className="absolute -right-3 -top-2 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink">+15 rep</motion.span>
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6, ease }} className="mt-8 flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-accent"><Sparkles size={14} /> indicação validada</motion.p>
            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6, ease }} className="mt-2 font-serif text-[36px] leading-none text-balance">Você deu reputação pra {credited.handle}</motion.h2>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="mt-3 text-sm text-mute">Quem indica bem sobe no ranking de curadores e pesa mais nas próximas recomendações.</motion.p>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-10 w-full">
              <Button size="lg" className="w-full" onClick={() => nav('/perfil')}>Ver meu diário</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </Overlay>
      <StorySheet open={!!story} onClose={() => { setStory(null); nav('/perfil') }} card={story} link={`${location.origin}${import.meta.env.BASE_URL}?src=ig`} context="avaliacao" />
    </Page>
  )
}
