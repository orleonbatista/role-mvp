import { BeerLoader } from '../ui/Celebrate'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { track } from '../lib/track'

/* Puxar pra baixo atualiza a tela (no app instalado o navegador não faz isso sozinho, e o app trava a rolagem da
   página). Vale em qualquer tela: quando a área que rola está no topo e o dedo desce, mostra a seta; soltou depois de
   ~80 px, recarrega todos os dados visíveis (votos, chat, notificações, lugares) sem recarregar o app. */
const PULL = 80

function scroller(el: EventTarget | null): HTMLElement | null {
  for (let e = el as HTMLElement | null; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e)
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) return e
    if (e.getAttribute('role') === 'dialog' || e.dataset.noPull !== undefined) return null // folhas e campos: não puxa
  }
  return null
}

export function PullToRefresh() {
  const qc = useQueryClient()
  const [dy, setDy] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<{ y: number; x: number; el: HTMLElement | null } | null>(null)

  useEffect(() => {
    const down = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1) return
      if ((e.target as Element | null)?.closest?.('[role=dialog],[data-no-pull]')) return // dentro de folha: o arrasto fecha a folha
      const el = scroller(e.target)
      if ((el?.scrollTop ?? 0) > 0) return
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, el }
    }
    const move = (e: TouchEvent) => {
      const s = start.current
      if (!s) return
      const d = e.touches[0].clientY - s.y
      if (d <= 0 || Math.abs(e.touches[0].clientX - s.x) > d || (s.el?.scrollTop ?? 0) > 0) { setDy(0); return }
      setDy(Math.min(130, d * 0.55))
    }
    const up = async () => {
      const s = start.current
      start.current = null
      const pulled = dy
      setDy(0)
      if (!s || pulled < PULL) return
      setBusy(true)
      track('pull_refresh', { path: location.pathname })
      window.dispatchEvent(new Event('role:refresh'))
      await Promise.race([qc.invalidateQueries(), new Promise((r) => setTimeout(r, 4000))])
      setBusy(false)
    }
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', up)
    document.addEventListener('touchcancel', up)
    return () => {
      document.removeEventListener('touchstart', down)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', up)
    }
  }, [dy, busy, qc])

  const show = busy || dy > 8
  if (!show) return null
  const ready = dy >= PULL
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center" style={{ top: `calc(env(safe-area-inset-top) + ${busy ? 18 : Math.max(4, dy - 30)}px)` }} role="status" aria-live="polite">
      <span className={`grid size-9 place-items-center rounded-full border border-white/10 bg-surface-2 shadow-lg ${ready || busy ? 'text-accent' : 'text-mute'}`}>
        {busy ? <BeerLoader size={16} /> : <RefreshCw size={16} style={{ transform: `rotate(${dy * 3}deg)` }} />}
        <span className="sr-only">{busy ? 'Atualizando' : ready ? 'Solte pra atualizar' : 'Puxe pra atualizar'}</span>
      </span>
    </div>
  )
}
