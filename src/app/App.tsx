import { ConfirmHost } from '../ui/Confirm'
import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react'
import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react'

/* App instalado na tela de início fica aberto por dias com a versão antiga na memória; depois de um deploy,
   as partes carregadas sob demanda (Perfil, Turmas…) mudam de nome e a importação falha — antes isso deixava
   a tela toda preta. Agora: recarrega uma vez pra pegar a versão nova; se ainda falhar, mostra um aviso. */
function retryImport<T>(f: () => Promise<T>): Promise<T> {
  return f().catch((e) => {
    try {
      const k = 'role.chunkReload', last = Number(sessionStorage.getItem(k) ?? 0)
      if (Date.now() - last > 30_000) { sessionStorage.setItem(k, String(Date.now())); location.reload(); return new Promise<T>(() => {}) }
    } catch { /* */ }
    throw e
  })
}
class RouteError extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() { return { err: true } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="absolute inset-0 grid place-content-center gap-4 bg-bg px-8 text-center">
        <p className="font-serif text-[30px] leading-tight">Não deu pra abrir esta tela<span className="text-accent">.</span></p>
        <p className="text-[14px] text-mute">Pode ser uma versão nova do app chegando, ou a conexão.</p>
        <button onClick={() => location.reload()} className="mx-auto h-12 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink">Recarregar</button>
      </div>
    )
  }
}
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { PhoneFrame } from './PhoneFrame'
import { TabBar } from './TabBar'
import { FeedbackButton } from './FeedbackButton'
import { ToastHost } from '../ui/Toast'
import { Skeleton } from '../ui/primitives'
import { useProfile } from '../lib/api'
import { captureSource, track } from '../lib/track'
import { Home } from '../features/Home'

// code-split: só a Home vai no bundle inicial; o resto carrega sob demanda
const Onboarding = lazy(() => retryImport(() => import('../features/Onboarding').then((m) => ({ default: m.Onboarding }))))
const NewRequest = lazy(() => retryImport(() => import('../features/NewRequest').then((m) => ({ default: m.NewRequest }))))
const Results = lazy(() => retryImport(() => import('../features/Results').then((m) => ({ default: m.Results }))))
const VotePage = lazy(() => retryImport(() => import('../features/Vote').then((m) => ({ default: m.VotePage }))))
const PlacePage = lazy(() => retryImport(() => import('../features/Place').then((m) => ({ default: m.PlacePage }))))
const ReviewPage = lazy(() => retryImport(() => import('../features/Review').then((m) => ({ default: m.ReviewPage }))))
const ProfilePage = lazy(() => retryImport(() => import('../features/Profile').then((m) => ({ default: m.ProfilePage }))))
const SuggestPage = lazy(() => retryImport(() => import('../features/Suggest').then((m) => ({ default: m.SuggestPage }))))
const ImportSuggestion = lazy(() => retryImport(() => import('../features/ImportSuggestion').then((m) => ({ default: m.ImportSuggestion }))))
const EventInvite = lazy(() => retryImport(() => import('../features/EventInvite').then((m) => ({ default: m.EventInvite }))))
const DivulgarPage = lazy(() => retryImport(() => import('../features/Divulgar').then((m) => ({ default: m.DivulgarPage }))))
const ImportSubmission = lazy(() => retryImport(() => import('../features/ImportSubmission').then((m) => ({ default: m.ImportSubmission }))))
const CreatorPage = lazy(() => retryImport(() => import('../features/CreatorPage').then((m) => ({ default: m.CreatorPage }))))
const IndicarPage = lazy(() => retryImport(() => import('../features/Indicar').then((m) => ({ default: m.IndicarPage }))))
const FundadorPage = lazy(() => retryImport(() => import('../features/Fundador').then((m) => ({ default: m.FundadorPage }))))
const PrivacidadePage = lazy(() => retryImport(() => import('../features/Privacidade').then((m) => ({ default: m.PrivacidadePage }))))
const TurmasPage = lazy(() => retryImport(() => import('../features/Turmas').then((m) => ({ default: m.TurmasPage }))))
const QuickSearch = lazy(() => retryImport(() => import('../features/QuickSearch').then((m) => ({ default: m.QuickSearch }))))
const TestesPage = lazy(() => retryImport(() => import('../features/Testes').then((m) => ({ default: m.TestesPage }))))

const TAB_ROUTES = ['/', '/perfil']

function Fallback() {
  return (
    <div className="absolute inset-0 grid content-start gap-3 bg-bg px-5 pt-20">
      <Skeleton className="h-10 w-2/3" /><Skeleton className="h-40" /><Skeleton className="h-40" />
    </div>
  )
}

export function App() {
  const location = useLocation()
  const { data: profile, isLoading } = useProfile()
  const isPublic = ['/r/', '/s/', '/e/', '/p/', '/lugar/', '/avaliar/', '/divulgar', '/indicar', '/fundador', '/testes', '/privacidade'].some((p) => location.pathname.startsWith(p))
  const needsOnboarding = !isLoading && !profile?.onboarded && !location.pathname.startsWith('/onboarding') && !isPublic
  const showFeedback = !['/onboarding', '/r/', '/s/', '/i/', '/e/', '/c/', '/p/', '/divulgar', '/testes'].some((p) => location.pathname.startsWith(p))

  useEffect(() => {
    const src = captureSource()
    track('app_open', { referrer: document.referrer || undefined, via: src ?? undefined })
  }, [])
  useEffect(() => { track('screen', { path: location.pathname }) }, [location.pathname])

  return (
    <MotionConfig reducedMotion="user">
      <PhoneFrame>
        <ToastHost>
          <LayoutGroup>
            <AnimatePresence initial={false}>
              {needsOnboarding ? (
                <Navigate key="redirect" to="/onboarding" replace />
              ) : (
                <Routes location={location} key={location.pathname}>
                  <Route path="/" element={<Home />} />
                  {[
                    ['/onboarding', <Onboarding />], ['/novo', <NewRequest />], ['/pedido/:id', <Results />], ['/r/:id', <VotePage />],
                    ['/lugar/:id', <PlacePage />], ['/avaliar/:id', <ReviewPage />], ['/perfil', <ProfilePage />], ['/testes', <TestesPage />],
                    ['/s/:id', <SuggestPage />], ['/i/:id', <ImportSuggestion />],
                    ['/e/:id', <EventInvite />], ['/divulgar', <DivulgarPage />], ['/c/:id', <ImportSubmission />], ['/p/:handle', <CreatorPage />], ['/indicar', <IndicarPage />], ['/fundador', <FundadorPage />], ['/privacidade', <PrivacidadePage />], ['/turmas', <TurmasPage />], ['/buscar', <QuickSearch />],
                  ].map(([path, el]) => (
                    <Route key={path as string} path={path as string} element={<RouteError><Suspense fallback={<Fallback />}>{el}</Suspense></RouteError>} />
                  ))}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )}
            </AnimatePresence>
          </LayoutGroup>
          {showFeedback && profile?.onboarded && <FeedbackButton path={location.pathname} />}
          <TabBar visible={TAB_ROUTES.includes(location.pathname) && !!profile?.onboarded} />
          <ConfirmHost />
        </ToastHost>
      </PhoneFrame>
    </MotionConfig>
  )
}
