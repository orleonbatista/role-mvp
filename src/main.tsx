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

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } })

async function boot() {
  await startMocks()
  // ordem importa: fictícios (só demo) primeiro, depois curados (comunidade, eventos), por último a base OSM
  if (await demoOn()) { registerDemoSeeds(); await seedIfEmpty() } else await purgeSeeds()
  await Promise.all([loadExtraEvents(), loadGooglePlaces()])
  await loadBase()
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
