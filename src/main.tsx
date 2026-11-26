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
import { loadBase } from './mocks/base'
import { loadExtraEvents } from './mocks/extraEvents'
import { loadGooglePlaces } from './mocks/gplaces'
import { App } from './app/App'
import { db } from './db/db'
import { ensureRegion } from './mocks/region'
import { pushMe, ratings } from './mocks/remote'
import { placeById } from './mocks/seeds/places'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } })

async function boot() {
  await startMocks()
  // ordem importa: fictícios (só demo) primeiro, depois curados (comunidade, eventos), por último a base OSM
  if (await demoOn()) { registerDemoSeeds(); await seedIfEmpty() } else await purgeSeeds()
  await Promise.all([loadExtraEvents(), loadGooglePlaces()])
  await loadBase()
  // região de quem já se cadastrou: lugares em volta vindos do banco do PC (não trava a abertura)
  const me = await db.profile.get('me')
  // nota da comunidade (avaliações "Quem foi" de todo mundo) aplicada aos lugares carregados
  const applyRatings = () => ratings().then((r) => {
    for (const [id, [score, n]] of Object.entries(r ?? {})) { const p = placeById.get(id); if (p) { p.rating = score; p.ratingCount = n } }
  }).catch(() => {})
  // garante a região no banco (raio de 5 km; refaz a carga de quem entrou com o raio antigo) e carrega no aparelho
  if (me?.home) ensureRegion(me.home).then(applyRatings).then(() => qc.invalidateQueries()).catch(() => {})
  else void applyRatings().then(() => qc.invalidateQueries())
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
