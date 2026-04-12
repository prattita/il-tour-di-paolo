import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { FcmForegroundBanner } from './components/FcmForegroundBanner'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PublicOnlyRoute } from './components/PublicOnlyRoute'
import { PageLoading } from './components/PageLoading'
import { OwnerPendingAppBadge } from './components/OwnerPendingAppBadge'

/** Route-level code splitting — keeps initial parse smaller; Firebase stays in shared chunks as imported by pages. */
const GroupLayout = lazy(() =>
  import('./components/GroupLayout').then((m) => ({ default: m.GroupLayout })),
)
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })))
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const CreateGroupPage = lazy(() =>
  import('./pages/CreateGroupPage').then((m) => ({ default: m.CreateGroupPage })),
)
const JoinGroupPage = lazy(() =>
  import('./pages/JoinGroupPage').then((m) => ({ default: m.JoinGroupPage })),
)
const GroupFeedPage = lazy(() =>
  import('./pages/GroupFeedPage').then((m) => ({ default: m.GroupFeedPage })),
)
const ActivityListPage = lazy(() =>
  import('./pages/ActivityListPage').then((m) => ({ default: m.ActivityListPage })),
)
const TaskCompletePage = lazy(() =>
  import('./pages/TaskCompletePage').then((m) => ({ default: m.TaskCompletePage })),
)
const LegacyTaskCompleteRedirect = lazy(() =>
  import('./pages/LegacyTaskCompleteRedirect').then((m) => ({
    default: m.LegacyTaskCompleteRedirect,
  })),
)
const GroupInfoPage = lazy(() =>
  import('./pages/GroupInfoPage').then((m) => ({ default: m.GroupInfoPage })),
)
const GroupProfilePage = lazy(() =>
  import('./pages/GroupProfilePage').then((m) => ({ default: m.GroupProfilePage })),
)
const GroupApprovalsPage = lazy(() =>
  import('./pages/GroupApprovalsPage').then((m) => ({ default: m.GroupApprovalsPage })),
)
const GroupSettingsPage = lazy(() =>
  import('./pages/GroupSettingsPage').then((m) => ({ default: m.GroupSettingsPage })),
)
const GroupStandingsPage = lazy(() =>
  import('./pages/GroupStandingsPage').then((m) => ({ default: m.GroupStandingsPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OwnerPendingAppBadge />
        <FcmForegroundBanner />
        <Suspense fallback={<PageLoading />}>
          <Routes>
          <Route
            path="/auth"
            element={
              <PublicOnlyRoute>
                <AuthPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/group/new"
            element={
              <ProtectedRoute>
                <CreateGroupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join/:inviteCode"
            element={
              <ProtectedRoute>
                <JoinGroupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join"
            element={
              <ProtectedRoute>
                <JoinGroupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/group/:groupId/complete"
            element={
              <ProtectedRoute>
                <TaskCompletePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/group/:groupId/activity/:activityId/task/:taskId"
            element={
              <ProtectedRoute>
                <LegacyTaskCompleteRedirect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/group/:groupId"
            element={
              <ProtectedRoute>
                <GroupLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="feed" replace />} />
            <Route path="feed" element={<GroupFeedPage />} />
            <Route path="activities" element={<ActivityListPage />} />
            <Route path="info" element={<GroupInfoPage />} />
            <Route path="standings" element={<GroupStandingsPage />} />
            <Route path="profile/:userId" element={<GroupProfilePage />} />
            <Route path="approvals" element={<GroupApprovalsPage />} />
            <Route path="settings" element={<GroupSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
