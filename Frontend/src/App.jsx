import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AppLayout } from './components/layout/AppLayout'
import { GuestOnly, RequireAuth, RequireRole } from './components/routing/RouteGuards'
import DashboardPage from './pages/DashboardPage'
import NotFoundPage from './pages/NotFoundPage'
import ProfilePage from './pages/ProfilePage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import CourseDetailPage from './pages/courses/CourseDetailPage'
import CourseFormPage from './pages/courses/CourseFormPage'
import CoursesPage from './pages/courses/CoursesPage'
import UserEditPage from './pages/admin/UserEditPage'
import UsersPage from './pages/admin/UsersPage'

const COURSE_MANAGER_ROLES = ['teacher', 'admin']
const ADMIN_ROLES = ['admin']

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route
                  path="/users"
                  element={
                    <RequireRole roles={ADMIN_ROLES}>
                      <UsersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/users/:userId/edit"
                  element={
                    <RequireRole roles={ADMIN_ROLES}>
                      <UserEditPage />
                    </RequireRole>
                  }
                />
                <Route path="/courses" element={<CoursesPage />} />
                <Route
                  path="/courses/new"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <CourseFormPage />
                    </RequireRole>
                  }
                />
                <Route path="/courses/:courseId" element={<CourseDetailPage />} />
                <Route
                  path="/courses/:courseId/edit"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <CourseFormPage />
                    </RequireRole>
                  }
                />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
