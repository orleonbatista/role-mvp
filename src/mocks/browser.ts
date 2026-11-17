import { getResponse } from 'msw'
import { handlers } from './handlers'

/**
 * API mock em processo: intercepta fetch('/api/...') e responde com os handlers do MSW.
 * Não depende de Service Worker (que alguns navegadores embutidos/webviews bloqueiam).
 * Para ver as chamadas no DevTools > Network, dá pra trocar por setupWorker de 'msw/browser'.
 */
export async function startMocks() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (new URL(request.url, location.href).pathname.startsWith('/api/')) {
      const res = await getResponse(handlers, request)
      if (res) return res
    }
    return realFetch(input, init)
  }
}
