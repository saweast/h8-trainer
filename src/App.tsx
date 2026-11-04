import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { ModeProvider } from '@/features/mode/ModeProvider'
import { queryClient } from '@/lib/queryClient'
import { RouteFallback } from '@/components/common/RouteFallback'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'

// Everything past the first screen loads on demand (charts, workout screen, …).
const ComingSoonPage = lazy(() => import('@/pages/ComingSoonPage').then((m) => ({ default: m.ComingSoonPage })))
const ExercisesPage = lazy(() => import('@/pages/ExercisesPage').then((m) => ({ default: m.ExercisesPage })))
const ExerciseDetailPage = lazy(() =>
  import('@/features/progress/ExerciseDetailPage').then((m) => ({ default: m.ExerciseDetailPage })),
)
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const ProgressPage = lazy(() => import('@/pages/ProgressPage').then((m) => ({ default: m.ProgressPage })))
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })))
const TrainerClientsPage = lazy(() => import('@/pages/TrainerClientsPage').then((m) => ({ default: m.TrainerClientsPage })))
const TemplateEditorPage = lazy(() =>
  import('@/features/templates/TemplateEditorPage').then((m) => ({ default: m.TemplateEditorPage })),
)
const ProgramEditorPage = lazy(() =>
  import('@/features/templates/ProgramEditorPage').then((m) => ({ default: m.ProgramEditorPage })),
)
const BodyPage = lazy(() => import('@/features/body/BodyPage').then((m) => ({ default: m.BodyPage })))
const WorkoutPage = lazy(() => import('@/features/workout/WorkoutPage').then((m) => ({ default: m.WorkoutPage })))

// "/h8-trainer/" → "/h8-trainer"
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="h8.theme" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ModeProvider>
            <BrowserRouter basename={basename}>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  {/* Full-screen: no app header or bottom navigation while training */}
                  <Route path="workout/:workoutId" element={<WorkoutPage />} />
                  <Route path="templates/:templateId" element={<TemplateEditorPage />} />
                  <Route path="programs/:programId" element={<ProgramEditorPage />} />
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="history" element={<HistoryPage />} />
                    <Route path="exercises" element={<ExercisesPage />} />
                    <Route path="exercises/:exerciseId" element={<ExerciseDetailPage />} />
                    <Route path="progress" element={<ProgressPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="templates" element={<TemplatesPage />} />
                    <Route path="trainer" element={<TrainerClientsPage />} />
                    <Route path="trainer/clients/:athleteId" element={<ComingSoonPage />} />
                    <Route path="body" element={<BodyPage />} />
                    <Route path="invite/:code" element={<ComingSoonPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster position="top-center" />
          </ModeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
