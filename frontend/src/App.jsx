import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { MethodistReportsPage } from './pages/MethodistReportsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ArchivedProjectsPage } from './pages/ArchivedProjectsPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { ProfilePage } from './pages/ProfilePage'
import { PublishedProjectsFeedPage } from './pages/PublishedProjectsFeedPage'
import { ProjectCreatePage } from './pages/ProjectCreatePage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { StageManagePage } from './pages/StageManagePage'
import { ProjectTemplatesPage } from './pages/ProjectTemplatesPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SupervisorInvitesPage } from './pages/SupervisorInvitesPage'
import { TeamsPage } from './pages/TeamsPage'
import { TeacherDeadlinesPage } from './pages/TeacherDeadlinesPage'
import { StageReviewPage } from './pages/StageReviewPage'
import { UsersManagePage } from './pages/UsersManagePage'
import { UserImportPage } from './pages/UserImportPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/archive" element={<ArchivedProjectsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="users/manage" element={<UsersManagePage />} />
        <Route path="feed" element={<PublishedProjectsFeedPage />} />
        <Route path="projects/new" element={<ProjectCreatePage />} />
        <Route path="projects/templates" element={<ProjectTemplatesPage />} />
        <Route path="projects/:projectId/stages/manage" element={<StageManagePage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="supervisor-invites" element={<SupervisorInvitesPage />} />
        <Route path="teacher/deadlines" element={<TeacherDeadlinesPage />} />
        <Route path="stages/review" element={<StageReviewPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="methodist/reports" element={<MethodistReportsPage />} />
        <Route path="users/import" element={<UserImportPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
