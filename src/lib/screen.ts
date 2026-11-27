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
    travada: document.documentElement.classList.contains('vp-stuck') ? 'sim' : 'não', maxInner,
    ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, ''),
  }
}
/* Bug do iOS no app instalado (tela de início): depois que o teclado abre pela primeira vez (e às vezes já ao abrir),
   a janela encolhe (innerHeight 894 em vez de 956 no 17 Pro Max) e não volta até fechar o app; o iOS pinta uma faixa
   preta embaixo e nada desenhado ali aparece. Medição do aparelho do Orleon em 27/11: inner 894, vh 956, topo 62.
   Correção conhecida (dev.to/cederhook): esconder e mostrar de novo o contêiner de altura total força o WebKit a
   recalcular a janela. Feito só no app instalado, só com a janela presa e sem teclado aberto. */
let maxInner = 0
function stuck() {
  const full = Math.max(screen.width, screen.height)
  maxInner = Math.max(maxInner, innerHeight)
  return full - innerHeight > 4 && innerHeight > innerWidth
}
function typing() {
  const a = document.activeElement as HTMLElement | null
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)
}
export function healViewport() {
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone = nav.standalone === true || matchMedia('(display-mode: standalone)').matches
  const root = document.documentElement
  if (!standalone) { root.classList.remove('vp-stuck'); return }
  if (!stuck() || typing()) { if (!stuck()) root.classList.remove('vp-stuck'); return }
  const el = document.getElementById('root')
  if (el) {
    const prev = el.style.display
    el.style.display = 'none'
    void el.offsetHeight // reflow síncrono, sem pintar
    el.style.display = prev
  }
  // se não destravou, ajusta a barra de baixo pra área que sobrou
  setTimeout(() => root.classList.toggle('vp-stuck', stuck()), 120)
}
function scheduleHeal(ms: number) { setTimeout(healViewport, ms) }

function fixAppHeight() {
  document.documentElement.style.removeProperty('--app-h')
  scheduleHeal(0)
}
export function installScreenFix() {
  requestAnimationFrame(() => setTimeout(fixAppHeight, 30))
  addEventListener('resize', fixAppHeight)
  visualViewport?.addEventListener('resize', fixAppHeight)
  addEventListener('orientationchange', () => setTimeout(fixAppHeight, 300))
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(fixAppHeight, 50) })
  // teclado fechou: espera ele sumir e destrava a janela
  document.addEventListener('focusout', () => scheduleHeal(160))
  addEventListener('pageshow', () => scheduleHeal(50))
}
