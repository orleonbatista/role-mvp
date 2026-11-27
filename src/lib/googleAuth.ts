import { db } from '../db/db'
import type { Profile, Review } from './types'
import { googleLogin, setDeviceId, setSession, deviceId, type GoogleLogin } from '../mocks/remote'
import { fromSnap } from './places'
import { registerPlace } from '../mocks/seeds/places'

/* Entrar com Google (Google Identity Services). O botão devolve um ID token; o backend do PC valida no Google
   e liga a conta ao aparelho. Conta que já existe → este aparelho passa a ser ela (perfil, avaliações, turmas). */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
export const googleEnabled = () => !!GOOGLE_CLIENT_ID

interface GIS {
  accounts: { id: {
    initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; use_fedcm_for_prompt?: boolean; context?: string }) => void
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    disableAutoSelect: () => void
  } }
}
declare global { interface Window { google?: GIS } }

let loading: Promise<GIS | null> | null = null
function loadGis(): Promise<GIS | null> {
  if (window.google?.accounts) return Promise.resolve(window.google)
  loading ??= new Promise((res) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => res(window.google ?? null)
    s.onerror = () => { loading = null; res(null) }
    document.head.appendChild(s)
  })
  return loading
}

/** desenha o botão oficial do Google em `el`; onToken recebe o ID token */
export async function renderGoogleButton(el: HTMLElement, onToken: (credential: string) => void, text: 'continue_with' | 'signin_with' = 'continue_with') {
  if (!GOOGLE_CLIENT_ID) return false
  const g = await loadGis()
  if (!g) return false
  g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onToken(r.credential), ux_mode: 'popup', context: 'signin' })
  g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text, locale: 'pt-BR', width: Math.min(el.clientWidth || 320, 400) })
  return true
}

/** "Começar" sem Google num aparelho que já foi ligado a uma conta: sessão nova, anônima (o aparelho antigo continua sendo da conta) */
export function startWithoutAccount() {
  try {
    if (!localStorage.getItem('role.googleLinked')) return
    localStorage.removeItem('role.googleLinked')
    localStorage.removeItem('role.device')
    ;(window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google?.accounts?.id?.disableAutoSelect?.()
  } catch { /* */ }
}

export type LoginOutcome = { ok: false } | { ok: true; existing: true } | { ok: true; existing: false; email: string; name?: string }

/** valida no backend e, se a conta já existe, traz o perfil, as avaliações e assume o aparelho dela */
export async function loginWithGoogle(credential: string): Promise<LoginOutcome> {
  const r: GoogleLogin | null = await googleLogin(credential)
  if (!r) return { ok: false }
  if (r.session) setSession(r.session)
  // o servidor pode devolver outro aparelho (conta existente, ou o deste celular já tinha sessão): passa a usar o dele
  if (r.device && r.device !== deviceId()) setDeviceId(r.device)
  try { localStorage.setItem('role.googleLinked', '1') } catch { /* */ }
  if (!r.existing) {
    const cur = await db.profile.get('me')
    if (cur) await db.profile.update('me', { email: r.email })
    return { ok: true, existing: false, email: r.email, name: r.name }
  }
  if (r.device !== deviceId()) setDeviceId(r.device)
  const p = r.profile ?? {}
  const prof: Profile = {
    id: 'me', name: p.name ?? 'Você', handle: p.handle ?? '@voce', hue: p.hue ?? 82, curatorOf: (p.niches ?? []).slice(0, 2), reputation: 0,
    hood: p.hood ?? 'Pinheiros', niches: p.niches ?? [], vibes: p.vibes ?? [], home: p.home, onboarded: !!(p.niches?.length),
    demoMode: false, consentAt: r.consentAt || undefined, email: r.email,
  }
  await db.profile.put(prof)
  for (const x of r.reviews ?? []) {
    const pl = x.place ? fromSnap(x.place) : null
    if (pl) registerPlace(pl)
    const rv: Review = { id: x.id, placeId: x.place_id, requestId: x.request_id ?? undefined, went: true, verdict: x.verdict, note: x.note, createdAt: x.at }
    await db.reviews.put(rv)
    if (x.request_id) try { localStorage.setItem(`role.reviewed.${x.request_id}`, '1') } catch { /* */ }
  }
  return { ok: true, existing: true }
}
