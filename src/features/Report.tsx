import { useState } from 'react'
import { Flag } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { report, type ReportKind } from '../mocks/remote'
import { useToast } from '../ui/Toast'
import { track } from '../lib/track'

const REASONS: [string, string][] = [['ofensivo', 'Ofensivo ou desrespeitoso'], ['spam', 'Propaganda ou spam'], ['falso', 'Informação falsa'], ['outro', 'Outro motivo']]

/** denunciar avaliação, recado ou sugestão: com 3 denúncias some na hora e vai pra fila da curadoria */
export function ReportButton({ kind, id, className }: { kind: ReportKind; id: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true) }} aria-label="Denunciar" className={className ?? 'grid size-8 place-items-center rounded-full text-faint hover:text-mute'}><Flag size={13} /></button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <p className="font-serif text-[28px] leading-tight">Denunciar</p>
        <p className="mt-1 text-[13px] text-mute">A curadoria revisa. Ninguém fica sabendo quem denunciou.</p>
        <div className="mt-5 grid gap-2">
          {REASONS.map(([k, label]) => (
            <button key={k} onClick={async () => {
              const ok = await report(kind, id, k)
              track('report_sent', { kind, reason: k })
              setOpen(false); toast(ok ? 'Denúncia enviada. Obrigado.' : 'Sem conexão agora, tente depois.')
            }} className="h-12 rounded-full border border-line text-left px-5 text-[14px] hover:border-accent/50">{label}</button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
