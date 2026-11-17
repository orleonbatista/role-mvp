import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Button, Skeleton } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { ease } from '../ui/motion'
import { renderStory, type StoryCard } from '../lib/storyCard'
import { track } from '../lib/track'

const IgGlyph = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)

/** Arte de Story + link copiado + folha nativa do celular (Instagram não aceita embed nem pré-preencher sticker pela web). */
export function StorySheet({ open, onClose, card, link, context }: { open: boolean; onClose: () => void; card: StoryCard | null; link: string; context: string }) {
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [posted, setPosted] = useState(false)

  // gera a arte ao abrir: o clique em "Postar" precisa chamar share() direto, sem esperar render
  useEffect(() => {
    if (!open || !card) return
    let url: string | undefined
    setFile(null); setPreview(undefined); setPosted(false)
    renderStory(card).then((b) => {
      const f = new File([b], `role-${card.kind}.png`, { type: 'image/png' })
      url = URL.createObjectURL(b)
      setFile(f); setPreview(url)
    })
    track('story_opened', { context, kind: card.kind })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [open, card, context])

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); return true } catch { return false }
  }

  function download() {
    if (!preview || !file) return
    const a = document.createElement('a')
    a.href = preview
    a.download = file.name
    a.click()
  }

  async function post() {
    if (!file) return
    const ok = await copyLink()
    const canFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
    if (canFiles) {
      try {
        await navigator.share({ files: [file] })
        track('story_shared', { context, via: 'native', linkCopied: ok })
        setPosted(true)
      } catch { /* cancelado */ }
    } else {
      download()
      track('story_shared', { context, via: 'download', linkCopied: ok })
      toast(ok ? 'Imagem baixada e link copiado' : 'Imagem baixada')
      setPosted(true)
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-none">Postar no Story</p>
      <p className="mt-2 text-sm text-mute">Quem tocar no link vota sem instalar nada, e conhece o app.</p>

      <div className="mt-4 flex gap-4">
        <div className="relative aspect-[9/16] w-[38%] shrink-0 overflow-hidden rounded-[18px] border border-line bg-bg shadow-[0_20px_50px_-20px_rgba(198,255,61,0.35)]">
          <AnimatePresence mode="wait">
            {preview ? (
              <motion.img key="img" src={preview} alt="Prévia da arte do Story" className="h-full w-full object-cover"
                initial={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 0.6, ease }} />
            ) : (
              <motion.div key="sk" exit={{ opacity: 0 }} className="h-full w-full"><Skeleton className="h-full w-full rounded-none" /></motion.div>
            )}
          </AnimatePresence>
        </div>
        <ol className="grid content-start gap-3 text-[13px] leading-snug text-ink/85">
          {[
            ['1', 'Toque em postar e escolha', 'Instagram → Story'],
            ['2', 'No Story, abra os stickers e', 'escolha “Link”'],
            ['3', 'Cole o link (já copiado) e', 'coloque na área marcada'],
          ].map(([n, a, b]) => (
            <li key={n} className="flex gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[12px] font-semibold text-accent">{n}</span>
              <span>{a} <b className="font-medium text-ink">{b}</b></span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5 grid gap-2">
        <button
          disabled={!file}
          onClick={post}
          className="relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-full text-[15px] font-medium text-white shadow-[0_10px_34px_-10px_rgba(225,48,108,0.7)] transition-transform active:scale-[0.98] disabled:opacity-50"
          style={{ background: 'linear-gradient(90deg,#f58529,#dd2a7b 45%,#8134af 75%,#515bd4)' }}
        >
          {posted ? <Check size={17} /> : <IgGlyph />} {posted ? 'Pronto! Agora cola o link' : 'Postar no Instagram'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="soft" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copyLink}>{copied ? 'Copiado' : 'Copiar link'}</Button>
          <Button size="lg" variant="soft" icon={<Download size={16} />} disabled={!preview} onClick={() => { download(); track('story_downloaded', { context }) }}>Baixar</Button>
        </div>
      </div>
    </Sheet>
  )
}
