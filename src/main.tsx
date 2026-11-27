import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/geist'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import { setCatalogLoading, startMocks } from './mocks/browser'
import { demoOn, purgeSeeds, seedIfEmpty } from './db/db'
import { registerDemoSeeds } from './mocks/seeds/places'
import { loadExtraEvents } from './mocks/extraEvents'
import { loadGooglePlaces } from './mocks/gplaces'
import { App } from './app/App'
import { db } from './db/db'
import { discoverForTaste, centerOf } from './lib/gdiscover'
import { registerHood } from './lib/hours'
import { setSearchArea } from './lib/places'
import { pushMe, ratings } from './mocks/remote'
import { placeById } from './mocks/seeds/places'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } })

async function boot() {
  await startMocks()
  // ordem importa: fictícios (só demo) primeiro, depois curados (comunidade, eventos), por último a base OSM
  if (await demoOn()) { registerDemoSeeds(); await seedIfEmpty() } else await purgeSeeds()
  // a tela abre na hora: catálogo remoto e servidor chegam em segundo plano e atualizam o que estiver na tela
  const catalog = Promise.all([loadExtraEvents(), loadGooglePlaces()])
  setCatalogLoading(catalog)
  void catalog.then(() => qc.invalidateQueries())
  void import('./mocks/remote').then((r) => r.loadVenuesActive()).then(() => qc.invalidateQueries()).catch(() => {})
  // região de quem já se cadastrou: lugares em volta vindos do banco do PC (não trava a abertura)
  // reset geral de perfis feito no servidor: este aparelho apaga o perfil local e volta pro cadastro
  // (pedidos, votos, avaliações e turmas ficam)
  // (o reset de perfis feito no servidor é aplicado pelo reconcile abaixo, sem travar a abertura)
  const me = await db.profile.get('me')
  // termos do Google: resumo de lugares sem curadoria guardado nos pedidos some depois de 30 dias
  const cut = Date.now() - 30 * 86_400_000
  void db.requests.filter((r) => r.createdAt < cut && !!r.optSnaps?.some((s) => Array.isArray(s) && s[8] === 'b')).modify((r) => {
    r.optSnaps = r.optSnaps!.filter((s) => !(Array.isArray(s) && s[8] === 'b'))
  }).catch(() => {})
  // nota da comunidade (avaliações "Quem foi" de todo mundo) aplicada aos lugares carregados
  const applyRatings = () => ratings().then((r) => {
    for (const [id, [score, n]] of Object.entries(r ?? {})) { const p = placeById.get(id); if (p) { p.rating = score; p.ratingCount = n } }
  }).catch(() => {})
  // descoberta ao vivo no Google: lugares abertos em até 5 km que combinam com o gosto (não trava a abertura)
  if (me?.home) { registerHood(me.hood, [me.home.lat, me.home.lng]); setSearchArea(me.home.lat, me.home.lng, me.home.city) }
  void applyRatings().then(() => qc.invalidateQueries())
  if (me?.onboarded) discoverForTaste(centerOf(me), me.niches).then(applyRatings).then(() => qc.invalidateQueries()).catch(() => {})
  // perfil no banco (só com consentimento): mantém nome, gosto e região atualizados
  // e se o servidor estava fora na abertura (túnel trocando, PC dormindo), tenta de novo até conseguir:
  // nenhum cadastro fica só no celular, e um reset feito no servidor chega mesmo pra quem abriu offline
  let synced = false
  const reconcile = async () => {
    const r = await import('./mocks/remote')
    if (!(await r.apiBase(synced ? false : true))) return
    await r.ensureSession()
    void import('./lib/push').then((m) => m.resyncPush()).catch(() => {})
    const local = Number(localStorage.getItem('role.profileEpoch') ?? 0)
    if (r.serverEpoch > local) {
      localStorage.setItem('role.profileEpoch', String(r.serverEpoch))
      if (await db.profile.get('me')) { await db.profile.delete('me'); location.assign(import.meta.env.BASE_URL + 'onboarding'); return }
    }
    if (synced) return
    if (await r.pullMyRequests().catch(() => 0)) qc.invalidateQueries()
    const cur = await db.profile.get('me')
    const res = cur?.consentAt ? await pushMe(cur) : null
    synced = !cur?.consentAt || !!res
    // o servidor garante o @ único: se ele ajustou, o celular passa a usar o mesmo
    if (cur && res?.handle && res.handle !== cur.handle) { await db.profile.put({ ...cur, handle: res.handle }); qc.invalidateQueries({ queryKey: ['me'] }) }
  }
  void reconcile().catch(() => {})
  // servidor voltou (ou o app acordou e conseguiu falar com ele): recarrega tudo que estava como "sem conexão"
  window.addEventListener('role:online', () => void qc.invalidateQueries())
  window.addEventListener('role:request-synced', (e) => qc.invalidateQueries({ queryKey: ['request', (e as CustomEvent<string>).detail] }))
  const timer = setInterval(() => { if (synced) clearInterval(timer); else void reconcile().catch(() => {}) }, 45_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reconcile().catch(() => {}) })
  window.addEventListener('online', () => void reconcile().catch(() => {}))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
}

boot()

import { installScreenFix } from './lib/screen'
installScreenFix()
