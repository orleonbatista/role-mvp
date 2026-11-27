import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, ClipboardList, Copy, Dices, Image, LocateFixed, MessageCircle, Receipt, Share2, Sparkles, Vote } from 'lucide-react'
import { Page, TopBar, cx } from '../ui/primitives'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { SplitSheet } from './GroupPanel'
import { StorySheet } from './StorySheet'
import { useProfile } from '../lib/api'
import { track } from '../lib/track'
import type { ConviteCard } from '../lib/storyCard'

/* Caixa de ferramentas do rolê: tudo que ajuda a sair com a galera, sem precisar criar votação nem turma. */

type Tool = 'conta' | 'flyer' | 'post' | 'zap' | 'encontro' | 'leva' | 'sorteio'
const TOOLS: { id: Tool; title: string; text: string; icon: typeof Receipt }[] = [
  { id: 'conta', title: 'Dividir a conta', text: 'Valor por pessoa, 10% opcional e Pix copia e cola', icon: Receipt },
  { id: 'flyer', title: 'Convite com flyer', text: 'Arte de Story com título, data e lugar', icon: Image },
  { id: 'post', title: 'Post pro Instagram', text: 'A mesma arte no formato do feed (4:5)', icon: Sparkles },
  { id: 'zap', title: 'Link pro WhatsApp', text: 'Mensagem pronta num link que abre o zap', icon: MessageCircle },
  { id: 'encontro', title: 'Ponto de encontro', text: 'Manda onde você está como link do mapa', icon: LocateFixed },
  { id: 'leva', title: 'Quem leva o quê', text: 'Lista pra churrasco, piquenique ou festa', icon: ClipboardList },
  { id: 'sorteio', title: 'Decidir na sorte', text: 'Sorteia lugar, quem paga ou quem dirige', icon: Dices },
]

const fi = 'h-12 w-full rounded-2xl border border-line bg-white/[0.03] px-4 text-[14px] outline-none placeholder:text-faint focus:border-accent'
const wa = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

export function FerramentasPage() {
  const [open, setOpen] = useState<Tool | null>(null)
  const nav = useNavigate()
  const close = () => setOpen(null)
  return (
    <Page>
      <TopBar title="Ferramentas" />
      <div className="px-5 pb-16">
        <p className="mb-4 text-[14px] text-mute">Pra qualquer rolê, mesmo sem votação nem turma.</p>
        <div className="grid grid-cols-2 gap-2">
          {TOOLS.map((t) => (
            <button key={t.id} onClick={() => { setOpen(t.id); track('tool_open', { tool: t.id }) }} className="flex min-h-[124px] flex-col items-start rounded-[22px] border border-line bg-surface p-4 text-left">
              <span className="grid size-9 place-items-center rounded-full bg-accent/15 text-accent"><t.icon size={17} /></span>
              <span className="mt-3 text-[15px] leading-tight">{t.title}</span>
              <span className="mt-1 text-[12px] leading-snug text-mute">{t.text}</span>
            </button>
          ))}
          <button onClick={() => nav('/novo')} className="col-span-2 flex items-center gap-3 rounded-[22px] border border-dashed border-accent/40 p-4 text-left">
            <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink"><Vote size={17} /></span>
            <span><span className="block text-[15px]">Votação com a galera</span><span className="block text-[12px] text-mute">A IA sugere lugares e a turma vota pelo link</span></span>
          </button>
        </div>
      </div>
      <SplitSheet open={open === 'conta'} onClose={close} />
      <FlyerTool open={open === 'flyer' || open === 'post'} format={open === 'post' ? 'feed' : 'story'} onClose={close} />
      <ZapTool open={open === 'zap'} onClose={close} />
      <EncontroTool open={open === 'encontro'} onClose={close} />
      <LevaTool open={open === 'leva'} onClose={close} />
      <SorteioTool open={open === 'sorteio'} onClose={close} />
    </Page>
  )
}

function FlyerTool({ open, onClose, format }: { open: boolean; onClose: () => void; format: 'story' | 'feed' }) {
  const me = useProfile().data
  const [f, setF] = useState({ title: '', when: '', where: '', note: '', link: '' })
  const [card, setCard] = useState<ConviteCard | null>(null)
  const ready = f.title.trim().length >= 2
  return (
    <>
      <Sheet open={open && !card} onClose={onClose}>
        <p className="font-serif text-[28px] leading-tight">{format === 'feed' ? 'Post pro Instagram' : 'Convite com flyer'}</p>
        <div className="mt-4 grid gap-2">
          <input className={fi} placeholder="Título (ex.: Aniver da Bia)" aria-label="Título" value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className={fi} placeholder="Quando (ex.: sáb, 20h)" aria-label="Quando" value={f.when} maxLength={40} onChange={(e) => setF({ ...f, when: e.target.value })} />
          <input className={fi} placeholder="Onde (ex.: Bar do Zé, Vila Madalena)" aria-label="Onde" value={f.where} maxLength={60} onChange={(e) => setF({ ...f, where: e.target.value })} />
          <input className={fi} placeholder="Recado (opcional)" aria-label="Recado" value={f.note} maxLength={90} onChange={(e) => setF({ ...f, note: e.target.value })} />
          {format === 'story' && <input className={fi} placeholder="Link pro sticker (opcional)" aria-label="Link" inputMode="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />}
        </div>
        <Button size="lg" className="mt-4 w-full" disabled={!ready} onClick={() => {
          track('tool_flyer', { format })
          setCard({ kind: 'convite', format, title: f.title.trim(), when: f.when.trim() || undefined, where: f.where.trim() || undefined, note: f.note.trim() || undefined, author: me?.name.split(' ')[0] ?? '', hue: me?.hue ?? 82 })
        }}>Gerar arte</Button>
      </Sheet>
      <StorySheet open={open && !!card} onClose={() => { setCard(null); onClose() }} card={card} link={f.link.trim()} context={`tool_${format}`} />
    </>
  )
}

function ZapTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('Bora num rolê? ')
  const [copied, setCopied] = useState(false)
  const link = wa(text.trim())
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-tight">Link pro WhatsApp</p>
      <p className="mt-1 text-[13px] text-mute">Quem toca no link abre o WhatsApp com a mensagem pronta pra mandar pra quem quiser.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 600))} rows={4} aria-label="Mensagem" className="mt-4 w-full rounded-2xl border border-line bg-white/[0.03] p-4 text-[14px] outline-none focus:border-accent" />
      <p className="mt-2 break-all text-[11px] text-faint">{link}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="lg" variant="soft" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); track('tool_zap', { via: 'copy' }); setTimeout(() => setCopied(false), 1800) } catch { /* */ } }}>{copied ? 'Copiado' : 'Copiar link'}</Button>
        <a href={link} target="_blank" rel="noreferrer" onClick={() => track('tool_zap', { via: 'open' })} className="flex h-12 items-center justify-center rounded-full bg-[#25d366] text-[14px] font-medium text-black">Abrir no zap</a>
      </div>
    </Sheet>
  )
}

function EncontroTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'erro'>('idle')
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [note, setNote] = useState('')
  const toast = useToast()
  const maps = pos ? `https://www.google.com/maps/search/?api=1&query=${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : ''
  const msg = `${note.trim() || 'Tô aqui'} 📍 ${maps}`
  function locate() {
    if (!navigator.geolocation) { setSt('erro'); return }
    setSt('busy')
    navigator.geolocation.getCurrentPosition((p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setSt('idle'); track('tool_encontro', {}) }, () => setSt('erro'), { enableHighAccuracy: true, timeout: 10_000 })
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-tight">Ponto de encontro</p>
      <p className="mt-1 text-[13px] text-mute">Pega sua localização agora e vira um link de mapa. Nada fica salvo no rolê.</p>
      {!pos && <Button size="lg" className="mt-4 w-full" icon={<LocateFixed size={16} />} disabled={st === 'busy'} onClick={locate}>{st === 'busy' ? 'Localizando…' : 'Usar minha localização'}</Button>}
      {st === 'erro' && <p className="mt-2 text-[12px] text-[#ff8a8a]">Não deu pra pegar a localização. Libere o acesso no navegador e tente de novo.</p>}
      {pos && (
        <>
          <input className={cx(fi, 'mt-4')} placeholder="Recado (ex.: saída 2 do metrô)" aria-label="Recado" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="lg" variant="soft" icon={<Copy size={16} />} onClick={async () => { try { await navigator.clipboard.writeText(msg); toast('Copiado') } catch { /* */ } }}>Copiar</Button>
            <a href={wa(msg)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-full bg-[#25d366] text-[14px] font-medium text-black">Mandar no zap</a>
          </div>
        </>
      )}
    </Sheet>
  )
}

function LevaTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('Churrasco')
  const [items, setItems] = useState<{ what: string; who: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('role.leva') ?? '') } catch { return [{ what: 'carne', who: '' }, { what: 'carvão', who: '' }, { what: 'gelo', who: '' }, { what: 'bebida', who: '' }] }
  })
  const [nw, setNw] = useState('')
  const save = (x: typeof items) => { setItems(x); try { localStorage.setItem('role.leva', JSON.stringify(x)) } catch { /* */ } }
  const msg = `${title.trim() || 'Rolê'}: quem leva o quê\n${items.map((i) => `• ${i.what}: ${i.who.trim() || '(alguém?)'}`).join('\n')}\n\nResponde com o que você leva 🙌`
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-tight">Quem leva o quê</p>
      <input className={cx(fi, 'mt-3')} aria-label="Nome do rolê" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
      <ul className="mt-3 grid max-h-[38vh] gap-1.5 overflow-y-auto">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-[42%] truncate text-[14px]">{it.what}</span>
            <input value={it.who} placeholder="quem?" aria-label={`Quem leva ${it.what}`} onChange={(e) => save(items.map((x, j) => (j === i ? { ...x, who: e.target.value.slice(0, 30) } : x)))}
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-3 text-[13px] outline-none focus:border-accent" />
            <button onClick={() => save(items.filter((_, j) => j !== i))} aria-label={`Tirar ${it.what}`} className="grid size-9 place-items-center text-mute">×</button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nw.trim()) { save([...items, { what: nw.trim().slice(0, 30), who: '' }]); setNw('') } }}>
        <input value={nw} onChange={(e) => setNw(e.target.value)} placeholder="Adicionar item" aria-label="Adicionar item" className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 text-[13px] outline-none focus:border-accent" />
        <button type="submit" className="h-10 rounded-full border border-line px-4 text-[13px]">+</button>
      </form>
      <a href={wa(msg)} target="_blank" rel="noreferrer" onClick={() => track('tool_leva', { n: items.length })} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-[#25d366] text-[14px] font-medium text-black"><Share2 size={16} />Mandar a lista no zap</a>
    </Sheet>
  )
}

function SorteioTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [raw, setRaw] = useState('')
  const [res, setRes] = useState<string | null>(null)
  const [spin, setSpin] = useState(false)
  const opts = raw.split(/\n|,/).map((x) => x.trim()).filter(Boolean)
  function draw() {
    if (opts.length < 2) return
    setSpin(true); setRes(null)
    let n = 0
    const t = setInterval(() => {
      setRes(opts[Math.floor(Math.random() * opts.length)])
      if (++n > 12) {
        clearInterval(t)
        const a = new Uint32Array(1); crypto.getRandomValues(a)
        setRes(opts[a[0] % opts.length]); setSpin(false); track('tool_sorteio', { n: opts.length })
      }
    }, 90)
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-tight">Decidir na sorte</p>
      <p className="mt-1 text-[13px] text-mute">Um por linha ou separados por vírgula: lugares, nomes, o que for.</p>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value.slice(0, 800))} rows={4} placeholder={'Bar do Zé\nPizzaria da Vila\nBoteco 28'} aria-label="Opções do sorteio" className="mt-3 w-full rounded-2xl border border-line bg-white/[0.03] p-4 text-[14px] outline-none placeholder:text-faint focus:border-accent" />
      {res && <p className={cx('mt-3 text-center font-serif text-[40px] leading-none', spin ? 'text-mute' : 'text-accent')}>{res}</p>}
      <Button size="lg" className="mt-4 w-full" icon={<Dices size={16} />} disabled={opts.length < 2 || spin} onClick={draw}>{res && !spin ? 'Sortear de novo' : 'Sortear'}</Button>
      {res && !spin && <a href={wa(`Sorteio do rolê entre ${opts.join(', ')}: deu ${res} 🎲`)} target="_blank" rel="noreferrer" className="mt-2 flex h-12 items-center justify-center rounded-full border border-line text-[14px]">Mandar o resultado no zap</a>}
    </Sheet>
  )
}
