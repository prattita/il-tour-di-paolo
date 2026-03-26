import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PublicOnlyRoute } from './components/PublicOnlyRoute'
import { GroupLayout } from './components/GroupLayout'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { CreateGroupPage } from './pages/CreateGroupPage'
import { JoinGroupPage } from './pages/JoinGroupPage'
import { GroupFeedPage } from './pages/GroupFeedPage'
import { ActivityListPage } from './pages/ActivityListPage'
import { TaskCompletePage } from './pages/TaskCompletePage'
import { GroupInfoPage } from './pages/GroupInfoPage'
import { GroupProfilePage } from './pages/GroupProfilePage'
import { GroupApprovalsPage } from './pages/GroupApprovalsPage'
import { GroupSettingsPage } from './pages/GroupSettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            path="/group/:groupId/activity/:activityId/task/:taskId"
            element={
              <ProtectedRoute>
                <TaskCompletePage />
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
            <Route path="profile/:userId" element={<GroupProfilePage />} />
            <Route path="approvals" element={<GroupApprovalsPage />} />
            <Route path="settings" element={<GroupSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
