import { motion } from 'motion/react'
import { useState } from 'react'
import { MessageSquareHeart } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Button, cx } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { useSendFeedback } from '../lib/api'
import { track } from '../lib/track'

const SCALE = ['😖', '😕', '😐', '🙂', '🤩']

/** Feedback de teste em 10 segundos, de qualquer tela. Guarda a tela de origem. */
export function FeedbackButton({ path }: { path: string }) {
  const [open, setOpen] = useState(false)
  const [score, setScore] = useState<number>()
  const [text, setText] = useState('')
  const send = useSendFeedback()
  const toast = useToast()

  async function submit() {
    if (!score) return
    await send.mutateAsync({ path, score, text: text.trim() })
    track('feedback_sent', { score, path })
    setOpen(false); setScore(undefined); setText('')
    toast('Valeu! Feedback salvo')
  }

  return (
    <>
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => { setOpen(true); track('feedback_opened', { path }) }}
        className="absolute right-4 top-[max(env(safe-area-inset-top),10px)] z-[65] grid size-9 place-items-center rounded-full border border-white/10 bg-surface-2/70 text-mute backdrop-blur-xl hover:text-ink sm:top-12"
        aria-label="Enviar feedback"
      >
        <MessageSquareHeart size={16} />
      </motion.button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <p className="font-serif text-[28px] leading-none">Como está sendo?</p>
        <p className="mt-2 text-sm text-mute">Vai direto pro painel de testes, junto com a tela em que você está.</p>
        <div className="mt-5 flex justify-between">
          {SCALE.map((e, i) => (
            <motion.button key={e} whileTap={{ scale: 0.85 }} onClick={() => setScore(i + 1)} aria-label={`Nota ${i + 1}`}
              className={cx('grid size-14 place-items-center rounded-2xl text-2xl transition-all', score === i + 1 ? 'scale-110 bg-accent/20 ring-2 ring-accent' : 'bg-white/[0.05] grayscale-[0.6]')}>
              {e}
            </motion.button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="O que travou, confundiu ou encantou?"
          className="mt-4 w-full rounded-[18px] border border-line bg-bg p-3.5 text-[15px] outline-none placeholder:text-faint focus:border-accent/50" />
        <Button size="lg" className="mt-4 w-full" disabled={!score || send.isPending} onClick={submit}>Enviar</Button>
      </Sheet>
    </>
  )
}
