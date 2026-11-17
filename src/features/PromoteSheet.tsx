import { useEffect, useState } from 'react'
import { Check, Copy, Megaphone, Send } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { bioUrl, handleSlug, promoteText, promoteUrl } from '../lib/share'
import { track } from '../lib/track'
import type { Place } from '../lib/types'

const KEY = 'role.promoter'
export const savedPromoter = () => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
const normHandle = (h: string) => { const s = handleSlug(h.replace(/^@/, '')); return s ? `@${s}` : '' }

/** Fase 1 da divulgação: qualquer pessoa (artista, produtor, criador) compartilha um evento do catálogo
 *  com um link que carrega o @ dela — quem abre monta a votação com o grupo, e a origem fica atribuída. */
export function PromoteSheet({ open, onClose, place, onStory }: {
  open: boolean; onClose: () => void; place: Place; onStory: (link: string, by?: string) => void
}) {
  const toast = useToast()
  const [handle, setHandle] = useState(savedPromoter)
  const [copied, setCopied] = useState(false)
  const by = normHandle(handle)
  const link = promoteUrl(place.id, by)
  useEffect(() => { if (open) track('promote_opened', { id: place.id }) }, [open, place.id])
  const remember = () => { try { by ? localStorage.setItem(KEY, by) : localStorage.removeItem(KEY) } catch { /* */ } }

  return (
    <Sheet open={open} onClose={onClose}>
      <p className="flex items-center gap-2 font-serif text-[28px] leading-none"><Megaphone size={20} className="text-accent" />Divulgar evento</p>
      <p className="mt-2 text-sm text-mute">Quem abre o link chama a turma e decide junto numa votação. Cada link leva o seu @, então dá pra saber quantos grupos você trouxe.</p>

      <label className="mt-5 block text-[12px] uppercase tracking-[0.14em] text-mute" htmlFor="promoter">Quem está divulgando</label>
      <input id="promoter" value={handle} onChange={(e) => setHandle(e.target.value)} onBlur={remember} placeholder="@seu.perfil (opcional)" autoCapitalize="none" autoCorrect="off"
        className="mt-2 h-12 w-full rounded-[16px] border border-line bg-bg px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent/50" />
      <p className="mt-2 truncate rounded-[12px] bg-white/[0.04] px-3 py-2 font-mono text-[11px] text-mute">{link}</p>

      <div className="mt-4 grid gap-2">
        <button
          onClick={() => { remember(); track('promote_story', { id: place.id, by: by || undefined }); onStory(link, by || undefined) }}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full text-[15px] font-medium text-white shadow-[0_10px_34px_-10px_rgba(225,48,108,0.7)] transition-transform active:scale-[0.98]"
          style={{ background: 'linear-gradient(90deg,#f58529,#dd2a7b 45%,#8134af 75%,#515bd4)' }}
        >Arte pro Story</button>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${promoteText(place)}\n${link}`)}`} target="_blank" rel="noreferrer"
            onClick={() => { remember(); track('promote_sent', { id: place.id, via: 'whatsapp', by: by || undefined }) }}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#25D366] text-[15px] font-medium text-black active:scale-[0.98]"
          ><Send size={16} />WhatsApp</a>
          <Button size="lg" variant="soft" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={async () => {
            remember()
            try { await navigator.clipboard.writeText(`${promoteText(place)}\n${link}`); setCopied(true); toast('Texto e link copiados'); setTimeout(() => setCopied(false), 1800) } catch { toast('Não deu pra copiar') }
            track('promote_sent', { id: place.id, via: 'copy', by: by || undefined })
          }}>{copied ? 'Copiado' : 'Copiar'}</Button>
        </div>
      </div>
      {by && (
        <button onClick={async () => { try { await navigator.clipboard.writeText(bioUrl(by)); toast('Link da bio copiado'); track('bio_link_copied', { by }) } catch { /* */ } }}
          className="mt-3 w-full rounded-[16px] border border-dashed border-line px-4 py-3 text-left text-[13px] text-mute transition-colors hover:text-ink">
          <b className="font-medium text-ink">Link pra bio:</b> uma página {by} com todos os eventos que você indica. Toque pra copiar.
        </button>
      )}
    </Sheet>
  )
}
