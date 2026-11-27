import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { googleEnabled, loginWithGoogle, renderGoogleButton, type LoginOutcome } from '../lib/googleAuth'
import { track } from '../lib/track'

/** botão oficial "Continuar com o Google"; devolve o resultado do login pra tela decidir o próximo passo */
export function GoogleButton({ onDone, text = 'continue_with' }: { onDone: (r: LoginOutcome) => void; text?: 'continue_with' | 'signin_with' }) {
  const box = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!box.current) return
    renderGoogleButton(box.current, async (cred) => {
      setBusy(true)
      const r = await loginWithGoogle(cred)
      // conta existente: o app recarrega com o perfil; a tela de "entrando" fica até a troca (sem piscar o cadastro)
      if (!(r.ok && r.existing)) setBusy(false)
      track('login_google', { ok: r.ok, existing: r.ok ? r.existing : undefined })
      if (!r.ok) setFailed(true)
      onDone(r)
    }, text).then((ok) => { if (!ok) setFailed(true); else setReady(true) })
  }, [onDone, text])
  if (!googleEnabled()) return null
  return (
    <div className="grid justify-items-center gap-2">
      <div className="relative w-full" style={{ maxWidth: 400 }}>
        {!ready && !failed && <div className="absolute inset-0 animate-pulse rounded-full bg-white/[0.08]" aria-label="Carregando o botão do Google" role="status" />}
        <div ref={box} className={busy ? 'pointer-events-none opacity-40' : ''} style={{ minHeight: 44, width: '100%', display: 'flex', justifyContent: 'center' }} />
      </div>
      {busy && (
        <div className="fixed inset-0 z-[90] grid place-content-center justify-items-center gap-4 bg-bg/95 backdrop-blur" role="status" aria-live="polite">
          <span className="font-serif text-[40px] italic">rolê<span className="text-accent">.</span></span>
          <span className="flex items-center gap-2 text-[14px] text-mute"><LoaderCircle size={16} className="animate-spin text-accent" />Entrando com a sua conta…</span>
          <span className="max-w-[260px] text-center text-[12px] text-faint">Trazendo seu perfil, turmas e pedidos</span>
        </div>
      )}
      {failed && !busy && <p className="text-center text-[12px] text-faint">Não deu pra entrar com o Google agora (servidor do rolê fora do ar?). Dá pra seguir sem conta.</p>}
    </div>
  )
}
