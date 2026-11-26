import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/geist'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import { startMocks } from './mocks/browser'
import { demoOn, purgeSeeds, seedIfEmpty } from './db/db'
import { registerDemoSeeds } from './mocks/seeds/places'
import { loadExtraEvents } from './mocks/extraEvents'
import { loadGooglePlaces } from './mocks/gplaces'
import { App } from './app/App'
import { db } from './db/db'
import { discoverForTaste, centerOf } from './lib/gdiscover'
import { registerHood } from './lib/hours'
import { pushMe, ratings } from './mocks/remote'
import { placeById } from './mocks/seeds/places'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } })

async function boot() {
  await startMocks()
  // ordem importa: fictícios (só demo) primeiro, depois curados (comunidade, eventos), por último a base OSM
  if (await demoOn()) { registerDemoSeeds(); await seedIfEmpty() } else await purgeSeeds()
  await Promise.all([loadExtraEvents(), loadGooglePlaces()])
  // região de quem já se cadastrou: lugares em volta vindos do banco do PC (não trava a abertura)
  // reset geral de perfis feito no servidor: este aparelho apaga o perfil local e volta pro cadastro
  // (pedidos, votos, avaliações e turmas ficam)
  try {
    const { apiBase, serverEpoch } = await import('./mocks/remote')
    if (await apiBase()) {
      const ep = (await import('./mocks/remote')).serverEpoch || serverEpoch
      const local = Number(localStorage.getItem('role.profileEpoch') ?? 0)
      if (ep > local) { await db.profile.delete('me'); localStorage.setItem('role.profileEpoch', String(ep)) }
    }
  } catch { /* sem backend: segue */ }
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
  if (me?.home) registerHood(me.hood, [me.home.lat, me.home.lng])
  void applyRatings().then(() => qc.invalidateQueries())
  if (me?.onboarded) discoverForTaste(centerOf(me), me.niches).then(applyRatings).then(() => qc.invalidateQueries()).catch(() => {})
  // perfil no banco (só com consentimento): mantém nome, gosto e região atualizados
  if (me?.consentAt) void pushMe(me)
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
