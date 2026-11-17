import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { PhoneFrame } from './PhoneFrame'
import { TabBar } from './TabBar'
import { ToastHost } from '../ui/Toast'
import { useProfile } from '../lib/api'
import { Onboarding } from '../features/Onboarding'
import { Home } from '../features/Home'
import { NewRequest } from '../features/NewRequest'
import { Results } from '../features/Results'
import { VotePage } from '../features/Vote'
import { PlacePage } from '../features/Place'
import { ReviewPage } from '../features/Review'
import { ProfilePage } from '../features/Profile'

const TAB_ROUTES = ['/', '/perfil']

export function App() {
  const location = useLocation()
  const { data: profile, isLoading } = useProfile()
  const needsOnboarding = !isLoading && !profile?.onboarded && !location.pathname.startsWith('/onboarding') && !location.pathname.startsWith('/r/')

  return (
    <MotionConfig reducedMotion="user">
      <PhoneFrame>
        <ToastHost>
          <LayoutGroup>
            <AnimatePresence initial={false}>
              {needsOnboarding ? (
                <Navigate to="/onboarding" replace />
              ) : (
                <Routes location={location} key={location.pathname}>
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/novo" element={<NewRequest />} />
                  <Route path="/pedido/:id" element={<Results />} />
                  <Route path="/r/:id" element={<VotePage />} />
                  <Route path="/lugar/:id" element={<PlacePage />} />
                  <Route path="/avaliar/:id" element={<ReviewPage />} />
                  <Route path="/perfil" element={<ProfilePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )}
            </AnimatePresence>
          </LayoutGroup>
          <TabBar visible={TAB_ROUTES.includes(location.pathname) && !!profile?.onboarded} />
        </ToastHost>
      </PhoneFrame>
    </MotionConfig>
  )
}
