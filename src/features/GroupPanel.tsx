import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CloudSun, Navigation, Send, Timer } from 'lucide-react'
import { pushDeadline, pushMessage, pushRsvp, type Rsvp } from '../mocks/remote'
import type { Place, RequestDetail } from '../lib/types'
import { slotDate } from '../lib/slot'
import { track } from '../lib/track'
import { cx } from '../ui/primitives'

/* Decisão em grupo: prazo da votação, presença ("vou / talvez"), recados pra turma e o card do rolê fechado
   (rota, clima, agenda). Presença, recados e prazo vivem no servidor; sem conexão, esses blocos não aparecem. */

const H = 3600_000
const fmtLeft = (ms: number) => (ms <= 0 ? 'encerrada' : ms < H ? `fecha em ${Math.max(1, Math.round(ms / 60_000))} min` : ms < 48 * H ? `fecha em ${Math.round(ms / H)} h` : `fecha em ${Math.round(ms / (24 * H))} dias`)

/** etiqueta do prazo (todo mundo vê) */
export function DeadlineBadge({ d }: { d: RequestDetail }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60_000); return () => clearInterval(t) }, [])
  const at = d.extra?.closesAt
  if (!at || d.request.status === 'decidido') return null
  const left = at - Date.now()
  return (
    <p className={cx('mx-5 mt-3 flex items-center gap-1.5 text-[12px]', left <= 0 ? 'text-[#ff8a8a]' : 'text-accent')}>
      <Timer size={13} />Votação {fmtLeft(left)}{left <= 0 ? `: falta ${d.author.name.split(' ')[0]} fechar` : ''}
    </p>
  )
}

/** o autor escolhe até quando a turma vota (avisamos quando vencer) */
export function DeadlinePicker({ d }: { d: RequestDetail }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  if (!d.extra?.online || d.request.status === 'decidido') return null
  const cur = d.extra.closesAt
  const opts: [string, number | null][] = [['sem prazo', null], ['2 h', 2 * H], ['6 h', 6 * H], ['amanhã', 24 * H], ['2 dias', 48 * H]]
  return (
    <div className="mx-5 mt-4 rounded-[18px] border border-line p-3">
      <p className="flex items-center gap-1.5 text-[13px] text-mute"><Timer size={14} />Prazo pra votar {cur ? <span className="text-accent">· {fmtLeft(cur - Date.now())}</span> : null}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {opts.map(([label, ms]) => (
          <button key={label} disabled={busy} onClick={async () => {
            setBusy(true)
            await pushDeadline(d.request.id, ms === null ? null : Date.now() + ms)
            track('deadline_set', { ms })
            await qc.invalidateQueries({ queryKey: ['request', d.request.id] })
            setBusy(false)
          }} className={cx('h-9 rounded-full border px-3 text-[12px]', (ms === null ? !cur : false) ? 'border-accent text-accent' : 'border-line text-ink/80')}>{label}</button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">Quando o prazo vencer, você recebe um aviso pra fechar o rolê.</p>
    </div>
  )
}

/** presença no rolê fechado */
export function RsvpBlock({ d, voter }: { d: RequestDetail; voter: string }) {
  const qc = useQueryClient()
  const ex = d.extra
  if (!ex?.online || d.request.status !== 'decidido') return null
  const mine = ex.rsvps.find((r) => r.mine)?.status
  const by = (s: Rsvp) => ex.rsvps.filter((r) => r.status === s)
  const opts: [Rsvp, string][] = [['vou', 'Vou'], ['talvez', 'Talvez'], ['nao', 'Não vou']]
  return (
    <section className="mx-5 mt-5 rounded-[22px] border border-line p-4">
      <p className="text-[15px]">Você vai?</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {opts.map(([s, label]) => (
          <button key={s} aria-pressed={mine === s} onClick={async () => {
            if (!voter.trim()) return
            await pushRsvp(d.request.id, s, voter.trim()); track('rsvp', { s })
            await qc.invalidateQueries({ queryKey: ['request', d.request.id] })
          }} className={cx('h-11 rounded-full border text-[14px]', mine === s ? 'border-accent bg-accent/10 text-accent' : 'border-line')}>
            {label} {by(s).length > 0 && <span className="text-mute">· {by(s).length}</span>}
          </button>
        ))}
      </div>
      {by('vou').length > 0 && <p className="mt-3 text-[12px] text-mute">Confirmados: {by('vou').map((r) => r.voter).join(', ')}</p>}
      {!voter.trim() && <p className="mt-2 text-[11px] text-faint">Escreva seu nome lá em cima pra confirmar.</p>}
    </section>
  )
}

/** recados pra turma toda: ficam na votação e chegam como aviso no celular de quem participou */
export function Messages({ d, voter }: { d: RequestDetail; voter: string }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const ex = d.extra
  if (!ex?.online) return null
  return (
    <section className="mx-5 mt-5">
      <p className="mb-2 text-[13px] uppercase tracking-[0.14em] text-mute">Recados da turma</p>
      <div className="grid gap-1.5">
        {ex.messages.length === 0 && <p className="text-[12px] text-faint">Combine aqui: ponto de encontro, quem leva o quê. Todo mundo que votou recebe.</p>}
        {ex.messages.map((m) => (
          <p key={m.id} className={cx('w-fit max-w-[85%] rounded-2xl px-3 py-2 text-[13px]', m.mine ? 'ml-auto bg-accent/15' : 'bg-white/[0.05]')}>
            {!m.mine && <b className="mr-1 font-medium text-accent">{m.voter}</b>}{m.text}
          </p>
        ))}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        if (!voter.trim()) { setErr('Escreva seu nome lá em cima antes.'); return }
        const ok = await pushMessage(d.request.id, text.trim(), voter.trim())
        if (!ok) { setErr('Não deu pra enviar (link e telefone não passam).'); return }
        setText(''); setErr(''); track('group_message', {})
        await qc.invalidateQueries({ queryKey: ['request', d.request.id] })
      }}>
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} placeholder="Mandar recado pra turma" aria-label="Recado pra turma"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white/[0.03] px-4 text-[14px] outline-none placeholder:text-faint focus:border-accent" />
        <button type="submit" aria-label="Enviar recado" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Send size={16} /></button>
      </form>
      {err && <p className="mt-1.5 text-[12px] text-[#ff8a8a]">{err}</p>}
    </section>
  )
}

/** rolê fechado: como chegar, previsão do tempo e botão pra agenda */
export function DecidedExtras({ place, time, createdAt, text }: { place: Place; time?: string; createdAt: number; text: string }) {
  const when = slotDate(time, createdAt)
  const gid = place.id.startsWith('g-') ? place.id.slice(2) : ''
  const route = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.name)}${gid ? `&destination_place_id=${encodeURIComponent(gid)}` : ''}`
  const day = when ? when.toISOString().slice(0, 10) : null
  const wx = useQuery({
    queryKey: ['wx', place.lat, place.lng, day],
    enabled: !!(when && place.lat != null && place.lng != null && when.getTime() - Date.now() < 15 * 24 * H && when.getTime() > Date.now() - 6 * H),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lng}&hourly=temperature_2m,precipitation_probability&timezone=America%2FSao_Paulo&start_date=${day}&end_date=${day}`)
      const j = await r.json()
      const i = Math.min(23, when!.getHours())
      return { t: Math.round(j.hourly.temperature_2m[i]), rain: j.hourly.precipitation_probability[i] as number }
    },
  })
  const cal = when ? (() => {
    const f = (x: Date) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const end = new Date(when.getTime() + 3 * H)
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Rolê: ${place.name}`)}&dates=${f(when)}/${f(end)}&details=${encodeURIComponent(`"${text}" · combinado pelo rolê.`)}&location=${encodeURIComponent(place.name)}`
  })() : null
  const chip = 'flex h-10 items-center justify-center gap-1.5 rounded-full border border-line text-[12px] text-ink/85'
  return (
    <div className="mx-5 mt-2 grid grid-cols-3 gap-2">
      <a href={route} target="_blank" rel="noreferrer" className={chip} onClick={() => track('decided_route', {})}><Navigation size={13} />Rota</a>
      {cal ? <a href={cal} target="_blank" rel="noreferrer" className={chip} onClick={() => track('decided_calendar', {})}><CalendarPlus size={13} />Agenda</a> : <span />}
      {wx.data ? <span className={chip}><CloudSun size={13} />{wx.data.t}° · {wx.data.rain}% chuva</span> : <span />}
    </div>
  )
}
