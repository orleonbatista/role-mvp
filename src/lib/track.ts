import { db } from '../db/db'

/** Medição local de testes: tudo fica no IndexedDB do aparelho e pode ser exportado em /testes.
 *  Para agregar entre testadores, plugue aqui um PostHog/Plausible (mesma assinatura). */
export function track(name: string, props?: Record<string, unknown>) {
  const ev = {
    id: `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    at: Date.now(),
    path: location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/',
    props,
  }
  db.events.add(ev).catch(() => {})
  if (import.meta.env.DEV) console.debug('[track]', name, props ?? '')
}

/** funil na ordem do loop principal */
export const FUNNEL: { name: string; label: string }[] = [
  { name: 'onboarding_done', label: 'Fez onboarding' },
  { name: 'request_created', label: 'Criou pedido' },
  { name: 'results_viewed', label: 'Viu recomendações' },
  { name: 'share_opened', label: 'Abriu compartilhar' },
  { name: 'share_sent', label: 'Compartilhou' },
  { name: 'vote_cast', label: 'Votou' },
  { name: 'decided', label: 'Fechou o rolê' },
  { name: 'review_saved', label: 'Avaliou' },
]
