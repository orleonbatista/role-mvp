import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { googleEnabled, loginWithGoogle, renderGoogleButton, type LoginOutcome } from '../lib/googleAuth'
import { track } from '../lib/track'

/** botão oficial "Continuar com o Google"; devolve o resultado do login pra tela decidir o próximo passo */
export function GoogleButton({ onDone, text = 'continue_with' }: { onDone: (r: LoginOutcome) => void; text?: 'continue_with' | 'signin_with' }) {
  const box = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!box.current) return
    renderGoogleButton(box.current, async (cred) => {
      setBusy(true)
      const r = await loginWithGoogle(cred)
      setBusy(false)
      track('login_google', { ok: r.ok, existing: r.ok ? r.existing : undefined })
      if (!r.ok) setFailed(true)
      onDone(r)
    }, text).then((ok) => { if (!ok) setFailed(true) })
  }, [onDone, text])
  if (!googleEnabled()) return null
  return (
    <div className="grid justify-items-center gap-2">
      <div ref={box} className={busy ? 'pointer-events-none opacity-40' : ''} style={{ minHeight: 44, width: '100%', maxWidth: 400, display: 'flex', justifyContent: 'center' }} />
      {busy && <p className="flex items-center gap-2 text-[13px] text-mute"><LoaderCircle size={14} className="animate-spin" />Entrando…</p>}
      {failed && !busy && <p className="text-center text-[12px] text-faint">Não deu pra entrar com o Google agora (servidor do rolê fora do ar?). Dá pra seguir sem conta.</p>}
    </div>
  )
}
