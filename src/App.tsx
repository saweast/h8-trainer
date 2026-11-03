import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { ModeProvider } from '@/features/mode/ModeProvider'
import { queryClient } from '@/lib/queryClient'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { ExercisesPage } from '@/pages/ExercisesPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ProgressPage } from '@/pages/ProgressPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { TrainerClientsPage } from '@/pages/TrainerClientsPage'

// "/h8-trainer/" → "/h8-trainer"
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="h8.theme" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ModeProvider>
            <BrowserRouter basename={basename}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="history" element={<HistoryPage />} />
                    <Route path="exercises" element={<ExercisesPage />} />
                    <Route path="progress" element={<ProgressPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="templates" element={<TemplatesPage />} />
                    <Route path="trainer" element={<TrainerClientsPage />} />
                    <Route path="trainer/clients/:athleteId" element={<ComingSoonPage />} />
                    <Route path="workout/:workoutId" element={<ComingSoonPage />} />
                    <Route path="body" element={<ComingSoonPage />} />
                    <Route path="invite/:code" element={<ComingSoonPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
            <Toaster position="top-center" />
          </ModeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
