import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, Copy, Megaphone, Send, Sparkles } from 'lucide-react'
import { Button, Chip, Page, SectionTitle, TopBar, cx } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { ease } from '../ui/motion'
import { eventFit, useSubmissions, useSubmitEvent } from '../lib/api'
import { curadoriaUrl, handleSlug } from '../lib/share'
import { HOODS, NICHES, OCCASIONS, VIBES } from '../lib/labels'
import { eventWhen } from '../mocks/extraEvents'
import { track } from '../lib/track'
import { savedPromoter } from './PromoteSheet'
import type { EventDraft, EventFit, EventSubmission, Niche, Occasion, PromoterRole, Vibe } from '../lib/types'

const ROLES: { id: PromoterRole; label: string }[] = [
  { id: 'artista', label: 'Artista' }, { id: 'produtor', label: 'Produtor(a)' }, { id: 'casa', label: 'Casa / bar' }, { id: 'criador', label: 'Criador(a)' },
]
const HOURS = [12, 14, 16, 18, 19, 20, 21, 22, 23]
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
const toggle = <T,>(arr: T[], v: T, max: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : arr.length >= max ? [...arr.slice(1), v] : [...arr, v])
const field = 'h-12 w-full rounded-[16px] border border-line bg-bg px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent/50'
const STATUS: Record<EventSubmission['status'], [string, string]> = {
  pendente: ['na fila da curadoria', 'bg-white/[0.06] text-mute'], aprovado: ['aprovado', 'bg-accent/15 text-accent'], recusado: ['não entrou', 'bg-red-400/10 text-red-300'],
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <p className="mb-2 mt-6 flex items-baseline justify-between text-[12px] uppercase tracking-[0.14em] text-mute">{children}{hint && <span className="normal-case tracking-normal text-faint">{hint}</span>}</p>
}

/** Fase 2: artista/produtor/criador envia o evento → vai pra fila da curadoria. Só entra no feed se aprovado. */
export function DivulgarPage() {
  const toast = useToast()
  const submit = useSubmitEvent()
  const mine = useSubmissions()
  const [name, setName] = useState('')
  const [role, setRole] = useState<PromoterRole>('artista')
  const [handle, setHandle] = useState(savedPromoter)
  const [contact, setContact] = useState('')
  const [date, setDate] = useState('')
  const [hour, setHour] = useState(20)
  const [hood, setHood] = useState('')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [niches, setNiches] = useState<Niche[]>([])
  const [vibes, setVibes] = useState<Vibe[]>([])
  const [occasions, setOccasions] = useState<Occasion[]>([])
  const [tagline, setTagline] = useState('')
  const [highlights, setHighlights] = useState(['', '', ''])
  const [ticketUrl, setTicketUrl] = useState('')
  const [fit, setFit] = useState<EventFit | null>(null)
  const [sent, setSent] = useState<{ sub: EventSubmission; link: string; synced: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { track('divulgar_viewed') }, [])

  const by = handleSlug(handle.replace(/^@/, ''))
  const draft: EventDraft = useMemo(() => ({
    name: name.trim(), niches, vibes, occasions, hood, date, hour,
    price: Math.max(0, Math.round(Number(price) || 0)), capacity: Math.max(1, Math.round(Number(capacity) || 80)),
    tagline: tagline.trim(), highlights: highlights.map((h) => h.trim()).filter(Boolean),
    ticketUrl: /^https:\/\//.test(ticketUrl.trim()) ? ticketUrl.trim() : undefined,
    by: { handle: by ? `@${by}` : '', role, contact: contact.trim() || undefined },
  }), [name, niches, vibes, occasions, hood, date, hour, price, capacity, tagline, highlights, ticketUrl, by, role, contact])

  const missing = [
    draft.name.length < 3 && 'nome', !by && 'seu @', !date && 'data', !hood && 'bairro', !niches.length && 'estilo', draft.tagline.length < 10 && 'uma frase sobre o evento',
  ].filter(Boolean) as string[]

  // encaixe ao vivo com os pedidos da comunidade (é o que a curadoria olha primeiro)
  useEffect(() => {
    if (!niches.length || !date) { setFit(null); return }
    const t = setTimeout(() => eventFit(draft).then(setFit).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [draft, niches.length, date])

  async function send() {
    if (missing.length) return
    const sub = await submit.mutateAsync(draft)
    const link = await curadoriaUrl(sub.id, { ...draft, hue: sub.hue } as EventDraft)
    try { localStorage.setItem('role.promoter', `@${by}`) } catch { /* */ }
    track('event_submitted', { id: sub.id, niches, role, matches: fit?.matches })
    setSent({ sub, link, synced: sub.synced })
  }

  const footer = (
    <div className="grid gap-1.5">
      {missing.length > 0 && <p className="text-center text-[12px] text-faint">Falta: {missing.join(', ')}</p>}
      <Button size="lg" className="w-full" icon={<Send size={16} />} disabled={!!missing.length || submit.isPending} onClick={send}>
        {submit.isPending ? 'Enviando…' : 'Enviar pra curadoria'}
      </Button>
    </div>
  )
  const myList = mine.data?.filter((s) => s.origin === 'meu') ?? []

  return (
    <Page footer={footer}>
      <TopBar title="Divulgar evento" />
      <div className="px-5">
        <motion.h1 initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }} transition={{ duration: 0.7, ease }}
          className="font-serif text-[44px] leading-[0.95] tracking-tight">Seu evento<br /><span className="italic text-accent">no rolê.</span></motion.h1>
        <p className="mt-3 text-[14px] text-mute">A curadoria revisa cada envio. Entra no feed quem encaixa no que a comunidade está pedindo. Aprovado, você ganha o link de divulgação com o seu @.</p>

        <Label>Nome do evento</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Noite de Vinil na Laje" className={field} />

        <Label>Quem é você</Label>
        <div className="flex flex-wrap gap-2">{ROLES.map((r) => <Chip key={r.id} active={role === r.id} onClick={() => setRole(r.id)}>{r.label}</Chip>)}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@seu.perfil" autoCapitalize="none" autoCorrect="off" className={field} aria-label="Seu @" />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="WhatsApp (opcional)" inputMode="tel" className={field} aria-label="Contato" />
        </div>

        <Label hint={date ? eventWhen({ date, hour }) : undefined}>Quando</Label>
        <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} className={cx(field, '[color-scheme:dark]')} aria-label="Data" />
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">{HOURS.map((h) => <Chip key={h} active={hour === h} onClick={() => setHour(h)}>{h}h</Chip>)}</div>

        <Label>Onde</Label>
        <div className="flex flex-wrap gap-2">{HOODS.map((h) => <Chip key={h} active={hood === h} onClick={() => setHood(h)}>{h}</Chip>)}</div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div><Label>R$ por pessoa</Label><input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0 = grátis" className={field} /></div>
          <div><Label>Público</Label><input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 120" className={field} /></div>
        </div>

        <Label hint="até 3">Estilo</Label>
        <div className="flex flex-wrap gap-2">{NICHES.map((n) => <Chip key={n.id} active={niches.includes(n.id)} onClick={() => setNiches((a) => toggle(a, n.id, 3))}>{n.label}</Chip>)}</div>
        <Label hint="até 2">Vibe</Label>
        <div className="flex flex-wrap gap-2">{VIBES.map((v) => <Chip key={v.id} active={vibes.includes(v.id)} onClick={() => setVibes((a) => toggle(a, v.id, 2))}>{v.label}</Chip>)}</div>
        <Label hint="até 3">Bom para</Label>
        <div className="flex flex-wrap gap-2">{OCCASIONS.map((o) => <Chip key={o.id} active={occasions.includes(o.id)} onClick={() => setOccasions((a) => toggle(a, o.id, 3))}>{o.label}</Chip>)}</div>

        <Label hint={`${tagline.length}/90`}>Em uma frase</Label>
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={90} placeholder="Ex.: Quarteto de jazz no pôr do sol da laje" className={field} />
        <Label hint="opcional">3 destaques</Label>
        <div className="grid gap-2">
          {highlights.map((h, i) => (
            <input key={i} value={h} maxLength={40} onChange={(e) => setHighlights((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={['ex.: line-up com 4 DJs', 'ex.: drinks de jarra', 'ex.: área ao ar livre'][i]} className={field} />
          ))}
        </div>
        <Label hint="opcional">Link do ingresso</Label>
        <input value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} inputMode="url" autoCapitalize="none" placeholder="https://…" className={field} />

        <AnimatePresence>
          {fit && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }}
              className="mt-7 rounded-[22px] border border-accent/25 bg-accent/[0.06] p-4">
              <p className="flex items-center gap-2 text-[13px] uppercase tracking-[0.14em] text-accent"><Sparkles size={14} />Encaixe com a comunidade</p>
              <p className="mt-2 font-serif text-[30px] leading-none">{fit.matches} <span className="text-[18px] text-mute">de {fit.total} pedidos recentes no top 5</span></p>
              {fit.top.length > 0 ? (
                <ul className="mt-3 grid gap-1.5 text-[13px] text-ink/80">
                  {fit.top.map((t) => <li key={t.text} className="flex gap-2"><span className="w-7 shrink-0 text-accent">#{t.pos}</span><span className="truncate">“{t.text}”</span></li>)}
                </ul>
              ) : <p className="mt-2 text-[13px] text-mute">Ainda ninguém pediu algo assim. Ajuste estilo, vibe e ocasião, ou envie assim mesmo.</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {myList.length > 0 && (
          <section className="mt-9">
            <SectionTitle>Seus envios</SectionTitle>
            <div className="-mx-5 grid gap-2 px-5">
              {myList.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-[18px] bg-surface px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">{s.name}</p>
                    <p className="truncate text-xs text-mute">{eventWhen(s)} · {s.hood}</p>
                  </div>
                  {s.status === 'aprovado'
                    ? <Link to={`/lugar/${s.id}`} className={cx('rounded-full px-2.5 py-1 text-[11px]', STATUS.aprovado[1])}>aprovado · ver</Link>
                    : <span className={cx('rounded-full px-2.5 py-1 text-[11px]', STATUS[s.status][1])}>{STATUS[s.status][0]}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="h-6" />
      </div>

      <Sheet open={!!sent} onClose={() => setSent(null)}>
        {sent?.synced ? (
          <>
            <p className="flex items-center gap-2 font-serif text-[28px] leading-none"><Check size={22} className="text-accent" />Na fila da curadoria</p>
            <p className="mt-2 text-sm text-mute">Recebemos seu evento. Assim que for aprovado ele entra no feed e o status muda aqui em "Seus envios". Se quiser apressar, mande o link pra curadoria.</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-serif text-[28px] leading-none"><Megaphone size={20} className="text-accent" />Manda pra curadoria</p>
            <p className="mt-2 text-sm text-mute">Seu evento está pronto. Envie o link pra curadoria do rolê: quem tocar nele vê o evento na fila e aprova ou não. Aprovado, ele entra no feed e você recebe o link de divulgação.</p>
          </>
        )}
        <div className="mt-5 grid gap-2">
          {sent?.synced && <Button size="lg" className="w-full" onClick={() => setSent(null)}>Fechar</Button>}
          <a href={sent ? `https://wa.me/?text=${encodeURIComponent(`Oi! Quero divulgar meu evento no rolê: ${sent.sub.name} (${eventWhen(sent.sub)}, ${sent.sub.hood}).\n👉 Revisar: ${sent.link}`)}` : undefined}
            target="_blank" rel="noreferrer" onClick={() => track('event_sent_to_curation', { via: 'whatsapp' })}
            className={cx('inline-flex items-center justify-center gap-2 rounded-full font-medium active:scale-[0.98]', sent?.synced ? 'h-11 bg-white/[0.06] text-[14px] text-ink' : 'h-14 bg-[#25D366] text-[15px] text-black')}><Send size={16} />{sent?.synced ? 'Avisar a curadoria (opcional)' : 'Enviar no WhatsApp'}</a>
          {!sent?.synced && <Button size="lg" variant="soft" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={async () => {
            if (!sent) return
            try { await navigator.clipboard.writeText(sent.link); setCopied(true); toast('Link copiado'); setTimeout(() => setCopied(false), 1800) } catch { toast('Não deu pra copiar') }
            track('event_sent_to_curation', { via: 'copy' })
          }}>{copied ? 'Copiado' : 'Copiar link (pra mandar no direct)'}</Button>}
        </div>
      </Sheet>
    </Page>
  )
}
