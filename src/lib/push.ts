import { pushKey, pushSubscribe } from '../mocks/remote'
import { track } from './track'

/* Avisos no celular (Web Push). No iPhone só funciona com o app instalado na tela de início (Safari 16.4+). */
export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'on' | 'off'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS() && !standalone() ? 'ios-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

const toKey = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** pede permissão, inscreve e registra no backend; devolve o estado final */
export async function enablePush(context: string): Promise<PushState> {
  const st = await pushState()
  if (st === 'unsupported' || st === 'ios-install' || st === 'denied') return st
  const perm = await Notification.requestPermission()
  track('push_permission', { perm, context })
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const key = await pushKey()
  if (!key) return 'off'
  const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key.key) }))
  const ok = await pushSubscribe(sub.toJSON())
  return ok ? 'on' : 'off'
}

/** se o navegador já tem inscrição, reenvia ao servidor (que pode tê-la perdido: dados apagados, aparelho trocado,
 *  envio que falhou). Antes o app achava que estava "ligado" e o servidor não tinha pra quem mandar. */
export async function resyncPush() {
  try {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await pushSubscribe(sub.toJSON())
  } catch { /* sem suporte */ }
}
