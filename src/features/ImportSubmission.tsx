import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Page, Skeleton, TopBar } from '../ui/primitives'
import { ease } from '../ui/motion'
import { importSubmission, useSubmissions } from '../lib/api'
import { readDraft } from '../lib/share'
import { track } from '../lib/track'
import { SubmissionReview } from './SubmissionReview'

/** Link da curadoria: o evento enviado entra na fila deste aparelho e já dá pra decidir aqui. */
export function ImportSubmission() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const subs = useSubmissions()

  useEffect(() => {
    let alive = true
    readDraft(location.hash).then(async (raw) => {
      if (!raw) throw new Error('payload')
      await importSubmission(id, raw)
      track('submission_received', { id })
      await qc.invalidateQueries({ queryKey: ['submissions'] })
      if (alive) setState('ok')
    }).catch(() => alive && setState('error'))
    return () => { alive = false }
  }, [id, qc])

  const s = subs.data?.find((x) => x.id === id)
  if (state === 'error') return <Page><EmptyState title="Link de curadoria inválido" text="Peça pra pessoa reenviar o link do evento." action={<Button onClick={() => nav('/')}>Ir pro início</Button>} /></Page>

  return (
    <Page>
      <TopBar title="Curadoria" />
      <div className="px-5">
        <motion.h1 initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.6, ease }}
          className="font-serif text-[40px] leading-[0.95]">Novo evento<br /><span className="italic text-accent">pra revisar</span></motion.h1>
        <p className="mt-3 text-[14px] text-mute">Aprove se encaixa no que a comunidade pede e se parece real. O critério é confiança: na dúvida, recuse.</p>
        <div className="mt-6">{state === 'loading' || !s ? <Skeleton className="h-64" /> : <SubmissionReview s={s} />}</div>
        <Button variant="ghost" className="mt-4 w-full" onClick={() => nav('/testes#fila')}>Ver fila completa</Button>
      </div>
    </Page>
  )
}
