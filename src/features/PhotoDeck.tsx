import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import { Check, Download, RotateCcw, X } from 'lucide-react'
import { Overlay, Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { track } from '../lib/track'
import { celebrate } from '../ui/Celebrate'

/* Escolher fotos do rolê, estilo "Tinder": arrasta pra direita (ou ✓) guarda pra salvar, pra esquerda (ou ×) pula.
   Quando o monte acaba, as puladas voltam numa segunda passada (dá pra mudar de ideia). No fim, "Salvar N fotos"
   abre o compartilhamento do celular com todas de uma vez (no iPhone: "Salvar N imagens" vai pro app Fotos).
   Salvar a cada arrasto abriria uma janela do iPhone por foto, por isso as escolhidas vão juntas no fim. */
export interface DeckPhoto { id: string; src: string; by: string }

export function PhotoDeck({ open, photos, onClose }: { open: boolean; photos: DeckPhoto[]; onClose: () => void }) {
  const [queue, setQueue] = useState<DeckPhoto[]>([])
  const [kept, setKept] = useState<DeckPhoto[]>([])
  const [skipped, setSkipped] = useState<DeckPhoto[]>([])
  const [round, setRound] = useState(1)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => { if (open) { setQueue(photos); setKept([]); setSkipped([]); setRound(1) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const decide = (p: DeckPhoto, keep: boolean) => {
    setQueue((q) => q.filter((x) => x.id !== p.id))
    if (keep) setKept((k) => [...k, p]); else setSkipped((s) => [...s, p])
    track('deck_swipe', { keep })
  }
  const again = () => { setQueue(skipped); setSkipped([]); setRound((r) => r + 1) }

  async function saveAll() {
    if (!kept.length) return
    setSaving(true)
    try {
      const files = await Promise.all(kept.map(async (p, i) => {
        const b = await (await fetch(p.src)).blob()
        return new File([b], `role-${i + 1}.jpg`, { type: b.type || 'image/jpeg' })
      }))
      track('deck_save', { n: files.length })
      if (navigator.canShare?.({ files })) await navigator.share({ files })
      else for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); await new Promise((r) => setTimeout(r, 300)) }
      celebrate({ kind: 'check', title: `${files.length} ${files.length === 1 ? 'foto salva' : 'fotos salvas'}` })
      onClose()
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast('Não deu pra salvar agora. Abra a foto e toque em Salvar.')
    } finally { setSaving(false) }
  }

  const top = queue[0]
  const done = open && !top
  return (
    <Overlay>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-modal="true" aria-label="Escolher fotos" className="pointer-events-auto absolute inset-0 z-[96] flex flex-col bg-bg/95 backdrop-blur-xl"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between px-5 pt-safe">
              <div>
                <p className="font-serif text-[28px] leading-none">Escolher fotos</p>
                <p className="mt-1 text-[12px] text-mute">{round > 1 ? 'Segunda passada: as que você pulou' : 'Direita guarda, esquerda pula'} · {kept.length} pra salvar</p>
              </div>
              <button onClick={onClose} aria-label="Fechar" className="grid size-10 place-items-center rounded-full bg-white/[0.08]"><X size={18} /></button>
            </div>

            <div className="relative mx-auto mt-4 w-full max-w-[420px] flex-1 px-6">
              {/* monte: a de cima arrasta; as de baixo aparecem levemente atrás */}
              {queue.slice(0, 3).reverse().map((p) => {
                const depth = queue.indexOf(p)
                return depth === 0
                  ? <SwipeCard key={p.id} p={p} onDecide={(k) => decide(p, k)} />
                  : <motion.div key={p.id} className="absolute inset-x-6 top-0 bottom-28 overflow-hidden rounded-[28px] border border-line bg-surface"
                      animate={{ scale: 1 - depth * 0.05, y: depth * 14, opacity: 1 - depth * 0.25 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
                      <img src={p.src} alt="" className="size-full object-cover" draggable={false} />
                    </motion.div>
              })}
              {done && (
                <motion.div className="absolute inset-x-6 top-10 text-center" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="font-serif text-[34px] leading-none">{kept.length ? `${kept.length} ${kept.length === 1 ? 'foto escolhida' : 'fotos escolhidas'}` : 'Nenhuma escolhida'}</p>
                  {kept.length > 0 && (
                    <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                      {kept.slice(0, 12).map((p) => <img key={p.id} src={p.src} alt="" className="size-16 rounded-[12px] object-cover" />)}
                    </div>
                  )}
                  <div className="mt-6 grid gap-2">
                    {kept.length > 0 && <Button size="lg" icon={<Download size={16} />} disabled={saving} onClick={saveAll}>{saving ? 'Preparando…' : `Salvar ${kept.length} ${kept.length === 1 ? 'foto' : 'fotos'}`}</Button>}
                    {skipped.length > 0 && <Button size="lg" variant="soft" icon={<RotateCcw size={16} />} onClick={again}>Rever as {skipped.length} que pulei</Button>}
                  </div>
                </motion.div>
              )}
            </div>

            {top && (
              <div className="flex items-center justify-center gap-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <button onClick={() => decide(top, false)} aria-label="Pular" className="grid size-16 place-items-center rounded-full border border-red-400/40 bg-red-400/10 text-red-300"><X size={26} /></button>
                <button onClick={() => decide(top, true)} aria-label="Guardar pra salvar" className="grid size-16 place-items-center rounded-full bg-accent text-accent-ink"><Check size={28} /></button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Overlay>
  )
}

function SwipeCard({ p, onDecide }: { p: DeckPhoto; onDecide: (keep: boolean) => void }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-14, 14])
  const keepO = useTransform(x, [30, 120], [0, 1])
  const skipO = useTransform(x, [-120, -30], [1, 0])
  const fly = async (keep: boolean, v = 0) => {
    await animate(x, keep ? 520 : -520, { type: 'spring', stiffness: 220, damping: 30, velocity: v })
    onDecide(keep)
  }
  return (
    <motion.div className="absolute inset-x-6 top-0 bottom-28 z-10 cursor-grab touch-none overflow-hidden rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] active:cursor-grabbing"
      style={{ x, rotate }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={1}
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110 || info.velocity.x > 600) void fly(true, info.velocity.x)
        else if (info.offset.x < -110 || info.velocity.x < -600) void fly(false, info.velocity.x)
        else animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 })
      }}>
      <img src={p.src} alt={`Foto de ${p.by}`} className="size-full object-cover" draggable={false} />
      <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] text-white backdrop-blur">por {p.by}</span>
      <motion.span style={{ opacity: keepO }} className="absolute left-4 top-4 rotate-[-12deg] rounded-xl border-4 border-accent px-3 py-1 font-semibold tracking-wide text-accent">SALVAR</motion.span>
      <motion.span style={{ opacity: skipO }} className="absolute right-4 top-4 rotate-[12deg] rounded-xl border-4 border-red-400 px-3 py-1 font-semibold tracking-wide text-red-300">PULAR</motion.span>
    </motion.div>
  )
}
