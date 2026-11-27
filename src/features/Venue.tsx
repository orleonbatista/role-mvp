import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, BadgeCheck, Gift, Store, Users } from 'lucide-react'
import { allPlacePhotos, claimVenue, deletePlacePhoto, saveVenue, uploadPlacePhoto, venueOf, venueReport, type Venue } from '../mocks/remote'
import { shrink } from './GroupPanel'
import { Camera, Trash2 } from 'lucide-react'
import type { Place } from '../lib/types'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { track } from '../lib/track'

const input = 'h-12 w-full rounded-2xl border border-line bg-white/[0.03] px-4 text-[14px] outline-none placeholder:text-faint focus:border-accent'

/** página da casa: o que o dono verificado publica (bio, Instagram, grupo máximo, oferta) + reivindicação e painel do dono */
export function VenueSection({ place }: { place: Place }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['venue', place.id], queryFn: () => venueOf(place.id), staleTime: 60_000, retry: false })
  const [claim, setClaim] = useState(false)
  const [edit, setEdit] = useState(false)
  const v = q.data
  if (!v) return null
  const verified = v.status === 'verificada'
  return (
    <section className="mt-8">
      {verified && (
        <div className="rounded-[22px] border border-line p-4">
          <p className="flex items-center gap-1.5 text-[12px] text-accent"><BadgeCheck size={14} />Casa verificada</p>
          {v.bio && <p className="mt-2 text-[14px] text-ink/90">{v.bio}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            {v.groupMax ? <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5"><Users size={12} />grupos até {v.groupMax}</span> : null}
            {v.instagram && <a href={`https://instagram.com/${v.instagram}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5"><AtSign size={12} />{v.instagram}</a>}
          </div>
          {v.offer && <p className="mt-3 flex items-start gap-2 rounded-2xl bg-accent/10 p-3 text-[13px]"><Gift size={15} className="mt-0.5 shrink-0 text-accent" /><span><b className="font-medium">Oferta pra grupos:</b> {v.offer}</span></p>}
          {v.mine && <button onClick={() => setEdit(true)} className="mt-3 text-[13px] text-mute underline underline-offset-4">Editar página e ver resultados</button>}
        </div>
      )}
      {!verified && v.status === 'pendente' && v.mine && <p className="text-[13px] text-mute">Verificação da sua casa em andamento: a gente liga no telefone do Google pra confirmar.</p>}
      {!verified && !(v.status === 'pendente' && v.mine) && (
        <button onClick={() => setClaim(true)} className="flex items-center gap-2 text-[13px] text-mute underline-offset-4 hover:underline"><Store size={14} />É dono(a) ou gerente? Reivindique a página da casa</button>
      )}
      <ClaimSheet open={claim} onClose={() => setClaim(false)} place={place} onDone={() => qc.invalidateQueries({ queryKey: ['venue', place.id] })} />
      {verified && v.mine && <EditSheet open={edit} onClose={() => setEdit(false)} place={place} v={v} onDone={() => qc.invalidateQueries({ queryKey: ['venue', place.id] })} />}
    </section>
  )
}

function ClaimSheet({ open, onClose, place, onDone }: { open: boolean; onClose: () => void; place: Place; onDone: () => void }) {
  const [f, setF] = useState({ name: '', role: '', contact: '' })
  const toast = useToast()
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-tight">Página da casa</p>
      <p className="mt-1 text-[13px] text-mute">{place.name}. Pra confirmar, a gente liga no telefone que aparece no Google. Depois disso você edita a página, cria oferta pra grupos e vê quantas turmas escolheram a casa.</p>
      <div className="mt-4 grid gap-2">
        <input className={input} placeholder="Seu nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={input} placeholder="Cargo (dono, gerente…)" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        <input className={input} placeholder="Seu WhatsApp ou e-mail" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
        <Button size="lg" className="mt-2 w-full" disabled={!f.name.trim() || !f.contact.trim()} onClick={async () => {
          const ok = await claimVenue(place.id, { ...f, placeName: place.name })
          track('venue_claim', { id: place.id })
          toast(ok ? 'Pedido enviado. A gente entra em contato.' : 'Sem conexão agora, tente depois.')
          if (ok) { onClose(); onDone() }
        }}>Enviar</Button>
      </div>
    </Sheet>
  )
}

function EditSheet({ open, onClose, place, v, onDone }: { open: boolean; onClose: () => void; place: Place; v: Venue; onDone: () => void }) {
  const [f, setF] = useState({ bio: v.bio ?? '', instagram: v.instagram ?? '', groupMax: v.groupMax ? String(v.groupMax) : '', offer: v.offer ?? '' })
  const rep = useQuery({ queryKey: ['venue-report', place.id], queryFn: () => venueReport(place.id), enabled: open })
  const toast = useToast()
  const n = rep.data
  return (
    <Sheet open={open} onClose={onClose}>
      <p className="font-serif text-[28px] leading-tight">{place.name}</p>
      {n && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[['viram a página', n.views], ['em votações', n.inRequests], ['votos', n.votes], ['turmas escolheram', n.wins], ['contatos', n.contacts]].map(([k, x]) => (
            <div key={k as string} className="rounded-2xl bg-white/[0.04] p-2.5"><p className="font-serif text-[24px] leading-none">{x}</p><p className="mt-1 text-[10px] text-mute">{k}</p></div>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-faint">Últimos 30 dias.</p>
      <OwnerPhotos place={place} />
      <div className="mt-4 grid gap-2">
        <textarea className={`${input} h-24 py-3`} maxLength={300} placeholder="Sobre a casa (até 300 caracteres)" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <input className={input} placeholder="Instagram (sem @)" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} />
        <input className={input} inputMode="numeric" placeholder="Recebe grupos de até quantas pessoas?" value={f.groupMax} onChange={(e) => setF({ ...f, groupMax: e.target.value.replace(/\D/g, '') })} />
        <input className={input} maxLength={140} placeholder="Oferta pra grupos (ex.: grupo de 6+ ganha uma porção)" value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value })} />
        <Button size="lg" className="mt-2 w-full" onClick={async () => {
          const ok = await saveVenue(place.id, { bio: f.bio, instagram: f.instagram, groupMax: f.groupMax ? Number(f.groupMax) : null, offer: f.offer })
          toast(ok ? 'Página atualizada' : 'Não deu pra salvar (link não passa)')
          if (ok) { onClose(); onDone() }
        }}>Salvar</Button>
      </div>
    </Sheet>
  )
}

/** fotos da casa (até 10): a IA dá nota e as melhores abrem o carrossel; recusadas mostram o motivo */
function OwnerPhotos({ place }: { place: Place }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['owner-photos', place.id], queryFn: () => allPlacePhotos(place.id), refetchInterval: (x) => (x.state.data?.some((p) => p.status === 'avaliando') ? 3000 : false) })
  const mine = (q.data ?? []).filter((p) => p.source === 'casa')
  return (
    <div className="mt-4">
      <p className="mb-2 text-[13px] text-mute">Fotos da casa ({mine.length}/10)</p>
      <div className="grid gap-1.5">
        {mine.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-[12px]">
            <span className="flex-1 truncate">{p.status === 'avaliando' ? 'IA avaliando…' : p.status === 'ok' ? `nota ${p.score?.toFixed(0)} · ${p.reason ?? ''}` : `recusada: ${p.reason ?? ''}`}</span>
            <button aria-label="Apagar foto" onClick={async () => { await deletePlacePhoto(p.id); qc.invalidateQueries({ queryKey: ['owner-photos', place.id] }); qc.invalidateQueries({ queryKey: ['place-photos', place.id] }) }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {mine.length < 10 && (
        <label className="mt-2 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-white/20 text-[13px]">
          <Camera size={15} className="text-accent" />{busy ? 'Enviando…' : 'Enviar fotos'}
          <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={async (e) => {
            const files = [...(e.target.files ?? [])].slice(0, 10 - mine.length)
            setBusy(true)
            let n = 0
            for (const f of files) { try { if (await uploadPlacePhoto(place.id, await shrink(f))) n++ } catch { /* ilegível */ } }
            setBusy(false); e.target.value = ''
            toast(n ? `${n} enviada(s); a IA está avaliando` : 'Não deu pra enviar')
            qc.invalidateQueries({ queryKey: ['owner-photos', place.id] }); qc.invalidateQueries({ queryKey: ['place-photos', place.id] })
          }} />
        </label>
      )}
    </div>
  )
}
