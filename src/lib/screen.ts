/* App instalado: mede a altura da tela de várias formas (100vh, 100lvh, innerHeight) e usa a maior que não passe
   da tela física. Cobre iPhone de qualquer tamanho (SE 667 pt até Pro Max 956 pt) e Android; no navegador não mexe. */
export function screenMetrics() {
  const probe = (h: string) => {
    const d = document.createElement('div')
    d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${h};visibility:hidden;pointer-events:none`
    document.body.appendChild(d)
    const v = d.getBoundingClientRect().height
    d.remove()
    return Math.round(v)
  }
  const inset = (side: string) => {
    const d = document.createElement('div')
    d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-${side});visibility:hidden`
    document.body.appendChild(d)
    const v = d.getBoundingClientRect().height
    d.remove()
    return Math.round(v)
  }
  const nav = navigator as Navigator & { standalone?: boolean }
  const shell = document.querySelector('.app-shell')?.getBoundingClientRect()
  return {
    standalone: nav.standalone === true || matchMedia('(display-mode: standalone)').matches,
    screen: `${screen.width}×${screen.height}`, dpr: devicePixelRatio,
    inner: `${innerWidth}×${innerHeight}`, visual: Math.round(visualViewport?.height ?? 0),
    vh: probe('100vh'), lvh: probe('100lvh'), dvh: probe('100dvh'), svh: probe('100svh'), pct: document.documentElement.clientHeight,
    top: inset('top'), bottom: inset('bottom'),
    shellTop: Math.round(shell?.top ?? -1), shellBottom: Math.round(shell?.bottom ?? -1),
    appH: getComputedStyle(document.documentElement).getPropertyValue('--app-h') || '(não usada)',
    ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, ''),
  }
}
function fixAppHeight() {
  const root = document.documentElement
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone = nav.standalone === true || matchMedia('(display-mode: standalone)').matches
  const portrait = innerHeight >= innerWidth
  if (!standalone || !portrait) { root.style.removeProperty('--app-h'); return }
  const m = screenMetrics()
  const full = Math.max(screen.width, screen.height)
  // teclado aberto encurta a janela: aí segue a janela (não estica pra baixo do teclado)
  const keyboard = (visualViewport?.height ?? innerHeight) < innerHeight - 120
  const h = keyboard ? innerHeight : Math.min(full, Math.max(m.vh, m.lvh, innerHeight))
  root.style.setProperty('--app-h', `${h}px`)
}
export function installScreenFix() {
  requestAnimationFrame(() => setTimeout(fixAppHeight, 30))
  addEventListener('resize', fixAppHeight)
  visualViewport?.addEventListener('resize', fixAppHeight)
  addEventListener('orientationchange', () => setTimeout(fixAppHeight, 300))
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(fixAppHeight, 50) })
}
