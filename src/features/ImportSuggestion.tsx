import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { Avatar, Button, Cover, EmptyState, Page } from '../ui/primitives'
import { ease } from '../ui/motion'
import { placeIcon } from '../ui/placeIcon'
import { addSuggestion, importRequest } from '../lib/api'
import { readPayload, readSuggestion } from '../lib/share'
import { placeById } from '../mocks/seeds/places'
import { track } from '../lib/track'

/** Link de retorno de uma sugestão: adiciona o lugar sugerido à votação de quem pediu. */
export function ImportSuggestion() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [state, setState] = useState<'loading' | 'ok' | 'dup' | 'error'>('loading')
  const sug = readSuggestion(location.hash)

  useEffect(() => {
    ;(async () => {
      if (!sug) return setState('error')
      const payload = await readPayload(location.hash)
      if (payload && payload.id === id) await importRequest(payload)
      try {
        const r = await addSuggestion(id, sug)
        await qc.invalidateQueries({ queryKey: ['request', id] })
        track('suggestion_imported', { id, placeId: sug.placeId, duplicate: r.duplicate })
        setState(r.duplicate ? 'dup' : 'ok')
      } catch { setState('error') }
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const place = sug ? placeById.get(sug.placeId) : undefined
  if (state === 'error' || !sug || !place) return <Page><EmptyState title="Sugestão não encontrada" text="Esse link de sugestão está incompleto." action={<Button onClick={() => nav('/')}>Ir pro início</Button>} /></Page>

  return (
    <Page>
      <div className="flex min-h-full flex-col items-center justify-center px-8 pt-24 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="relative">
          <Cover hue={place.hue} icon={placeIcon(place)} iconSize={56} className="size-32" rounded="rounded-[32px]" />
          <span className="absolute -bottom-3 -right-3"><Avatar name={sug.by} hue={sug.hue} size={44} /></span>
        </motion.div>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.6, ease }} className="mt-10 text-sm uppercase tracking-[0.16em] text-accent">
          {state === 'loading' ? 'adicionando…' : state === 'dup' ? 'já estava na votação' : 'nova sugestão'}
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6, ease }} className="mt-2 font-serif text-[40px] leading-none text-balance">
          {sug.by} sugeriu {place.name}
        </motion.h1>
        {sug.comment && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-3 text-[15px] text-ink/80">“{sug.comment}”</motion.p>}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="mt-10 grid w-full gap-2">
          <Button size="lg" disabled={state === 'loading'} onClick={() => nav(`/pedido/${id}`, { replace: true })}>Ver no pedido</Button>
          <Button size="lg" variant="soft" disabled={state === 'loading'} onClick={() => nav(`/r/${id}`, { replace: true })}>Abrir votação</Button>
        </motion.div>
        <p className="mt-6 text-xs text-faint">Pra quem já votou ver a nova opção, mande o link da votação de novo.</p>
      </div>
    </Page>
  )
}
