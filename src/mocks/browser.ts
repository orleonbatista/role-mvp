import { getResponse } from 'msw'
import { handlers } from './handlers'

/**
 * API mock em processo: intercepta fetch('/api/...') e responde com os handlers do MSW.
 * Não depende de Service Worker (que alguns navegadores embutidos/webviews bloqueiam).
 * Para ver as chamadas no DevTools > Network, dá pra trocar por setupWorker de 'msw/browser'.
 */
/** catálogo remoto (eventos, lugares do Google em cache) carregando em segundo plano: a API local espera por ele
 *  no máximo 2,5 s, pra a tela abrir na hora e não responder "não encontrado" antes de o catálogo chegar */
let catalog: Promise<unknown> = Promise.resolve()
export const setCatalogLoading = (p: Promise<unknown>) => { catalog = p.catch(() => {}) }

export async function startMocks() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (new URL(request.url, location.href).pathname.startsWith('/api/')) {
      await Promise.race([catalog, new Promise((r) => setTimeout(r, 2500))])
      const res = await getResponse(handlers, request)
      if (res) return res
    }
    return realFetch(input, init)
  }
}
