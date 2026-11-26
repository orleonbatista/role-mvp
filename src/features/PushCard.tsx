import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '../ui/primitives'
import { enablePush, pushState, type PushState } from '../lib/push'

/** convite pra ligar avisos: aparece só quando faz sentido (suportado e ainda desligado) */
export function PushCard({ text, context }: { text: string; context: string }) {
  const [st, setSt] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')) }, [])
  if (!st || st === 'on' || st === 'unsupported') return null
  return (
    <div className="mx-5 mt-5 flex items-start gap-3 rounded-[20px] border border-line bg-surface p-4">
      <Bell size={18} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        {st === 'ios-install' ? (
          <p className="text-[13px] text-ink/85">No iPhone, os avisos funcionam com o app na tela de início: toque em Compartilhar → <b className="font-medium">Adicionar à Tela de Início</b> e abra por lá.</p>
        ) : st === 'denied' ? (
          <p className="text-[13px] text-ink/85">Os avisos estão bloqueados neste navegador. Libere nas configurações do site pra saber quando votarem.</p>
        ) : (
          <>
            <p className="text-[13px] text-ink/85">{text}</p>
            <Button variant="soft" className="mt-2" disabled={busy} onClick={async () => { setBusy(true); setSt(await enablePush(context).catch(() => 'off' as const)); setBusy(false) }}>Ativar avisos</Button>
          </>
        )}
      </div>
    </div>
  )
}
