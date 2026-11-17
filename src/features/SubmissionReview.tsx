import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Check, Code2, Send, X } from 'lucide-react'
import { Button, Cover, Tag, cx } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { ease } from '../ui/motion'
import { useReviewSubmission, useSync, type SubmissionDTO } from '../lib/api'
import { eventWhen, isPast } from '../mocks/extraEvents'
import { bioUrl, promoteText, promoteUrl } from '../lib/share'
import { nicheLabel, occasionLabel, priceLabel, timeAgo, vibeLabel } from '../lib/labels'
import { track } from '../lib/track'

/** JSON que vai pro eventos.json do repositório (publicar = commit; o app lê em tempo de execução) */
export const publishJson = (s: SubmissionDTO) => {
  const { fit: _fit, origin: _o, by, ...rest } = s
  return JSON.stringify({ ...rest, by: { handle: by.handle, role: by.role }, status: 'aprovado' })
}

/** Cartão de curadoria: o evento como vai aparecer + encaixe com os pedidos + aprovar/recusar. */
export function SubmissionReview({ s, compact }: { s: SubmissionDTO; compact?: boolean }) {
  const toast = useToast()
  const review = useReviewSubmission()
  const [copied, setCopied] = useState(false)
  const sync = useSync().data
  const livePublish = !!(sync?.online && sync.admin)
  const past = isPast(s)
  const decide = (status: 'aprovado' | 'recusado') => {
    review.mutate({ id: s.id, status })
    track('submission_reviewed', { id: s.id, status, matches: s.fit.matches })
    toast(status === 'aprovado' ? (livePublish ? 'Aprovado e publicado pra todo mundo' : 'Aprovado neste aparelho') : 'Recusado')
  }
  const notifyText = `Seu evento ${s.name} foi aprovado no rolê! 🎉\nEsse é o seu link de divulgação (leva o seu @ e vira votação de grupo):\n${promoteUrl(s.id, s.by.handle)}${s.by.handle ? `\n\nLink pra bio, com todos os seus eventos:\n${bioUrl(s.by.handle)}` : ''}`
  const promoLink = promoteUrl(s.id, s.by.handle)

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}
      className={cx('rounded-[22px] border p-4', s.status === 'pendente' ? 'border-accent/25 bg-surface' : 'border-line')}>
      <div className="flex gap-3">
        <Cover hue={s.hue} iconSize={22} className="size-14 shrink-0" rounded="rounded-[14px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[22px] leading-tight">{s.name}</p>
          <p className="truncate text-xs text-mute">{eventWhen(s)} · {s.hood} · {priceLabel(s.price)}</p>
          <p className="mt-0.5 truncate text-xs text-faint">{s.by.handle || 'sem @'} · {s.by.role}{s.by.contact ? ` · ${s.by.contact}` : ''} · {timeAgo(s.at)}</p>
        </div>
      </div>
      {!compact && <p className="mt-3 text-[14px] text-ink/85">{s.tagline}</p>}
      {!compact && s.highlights.length > 0 && <p className="mt-1 text-[13px] text-mute">{s.highlights.join(' · ')}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.niches.map((n) => <Tag key={n} tone="accent">{nicheLabel(n)}</Tag>)}
        {s.vibes.map((v) => <Tag key={v}>{vibeLabel(v)}</Tag>)}
        {s.occasions.map((o) => <Tag key={o}>{occasionLabel(o)}</Tag>)}
      </div>
      <div className="mt-3 rounded-[14px] bg-white/[0.04] px-3 py-2 text-[12px]">
        <span className={s.fit.matches ? 'text-accent' : 'text-amber-300'}>Top 5 em {s.fit.matches} de {s.fit.total} pedidos</span>
        {s.fit.top[0] && <span className="text-mute"> · melhor: “{s.fit.top[0].text}” (#{s.fit.top[0].pos})</span>}
        {past && <span className="text-amber-300"> · data já passou</span>}
        {s.ticketUrl && <span className="block truncate text-faint">ingresso: {s.ticketUrl}</span>}
      </div>

      {s.status === 'pendente' ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="soft" icon={<X size={15} />} disabled={review.isPending} onClick={() => decide('recusado')}>Recusar</Button>
          <Button icon={<Check size={15} />} disabled={review.isPending || past} onClick={() => decide('aprovado')}>Aprovar</Button>
        </div>
      ) : s.status === 'recusado' ? (
        <div className="mt-3 flex items-center justify-between text-[13px] text-mute">
          <span>Recusado</span>
          <button className="underline-offset-4 hover:text-ink hover:underline" onClick={() => review.mutate({ id: s.id, status: 'pendente' })}>voltar pra fila</button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {livePublish
            ? <p className="text-[12px] text-accent">Aprovado e publicado: já aparece no feed de todo mundo.</p>
            : <p className="text-[12px] text-mute">Aprovado: já aparece neste aparelho. Pra todo mundo ver, ligue o backend com a chave da curadoria, ou publique no <code className="text-ink/80">eventos.json</code>.</p>}
          <div className={cx('grid gap-2', livePublish ? 'grid-cols-1' : 'grid-cols-2')}>
            {!livePublish && <Button variant="soft" icon={copied ? <Check size={15} /> : <Code2 size={15} />} onClick={async () => {
              try { await navigator.clipboard.writeText(publishJson(s)); setCopied(true); toast('JSON copiado'); setTimeout(() => setCopied(false), 1800) } catch { toast('Não deu pra copiar') }
            }}>{copied ? 'Copiado' : 'Copiar JSON'}</Button>}
            <a href={`https://wa.me/?text=${encodeURIComponent(notifyText)}`} target="_blank" rel="noreferrer" onClick={() => track('submission_notified', { id: s.id })}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] text-[14px] font-medium text-black active:scale-[0.98]"><Send size={15} />Avisar</a>
          </div>
          <div className="flex justify-between text-[12px] text-mute">
            <Link to={`/lugar/${s.id}`} className="underline-offset-4 hover:text-ink hover:underline">ver página</Link>
            <button className="underline-offset-4 hover:text-ink hover:underline" onClick={async () => {
              try { await navigator.clipboard.writeText(`${promoteText({ ...s, when: eventWhen(s) })}\n${promoLink}`); toast('Link de divulgação copiado') } catch { /* */ }
            }}>copiar link de divulgação</button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
