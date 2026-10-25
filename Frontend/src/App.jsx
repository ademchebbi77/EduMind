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
import MyCoursesPage from './pages/courses/MyCoursesPage'
import CourseEnrollmentsPage from './pages/courses/CourseEnrollmentsPage'
import CategoriesPage from './pages/courses/CategoriesPage'
import UserEditPage from './pages/admin/UserEditPage'
import UsersPage from './pages/admin/UsersPage'
import AssessmentsPage from './pages/assessments/AssessmentsPage'
import ExerciseDetailPage from './pages/assessments/ExerciseDetailPage'
import ExerciseFormPage from './pages/assessments/ExerciseFormPage'
import QuizDetailPage from './pages/assessments/QuizDetailPage'
import QuizFormPage from './pages/assessments/QuizFormPage'
import QuizResultPage from './pages/assessments/QuizResultPage'
import QuizTakePage from './pages/assessments/QuizTakePage'
import SessionsPage from './pages/sessions/SessionsPage'
import SessionFormPage from './pages/sessions/SessionFormPage'
import SessionDetailPage from './pages/sessions/SessionDetailPage'
import AnnouncementsPage from './pages/announcements/AnnouncementsPage'
import AnnouncementFormPage from './pages/announcements/AnnouncementFormPage'
import AnnouncementDetailPage from './pages/announcements/AnnouncementDetailPage'
import CalendarPage from './pages/calendar/CalendarPage'
import MyEnrollmentsPage from './pages/enrollments/MyEnrollmentsPage'
import EnrollmentsAdminPage from './pages/enrollments/EnrollmentsAdminPage'

const COURSE_MANAGER_ROLES = ['teacher', 'admin']
const ADMIN_ROLES = ['admin']
const STUDENT_ROLES = ['student']

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

                {/* Cours */}
                <Route path="/courses" element={<CoursesPage />} />
                <Route
                  path="/my-courses"
                  element={
                    <RequireRole roles={STUDENT_ROLES}>
                      <MyCoursesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/course-enrollments"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <CourseEnrollmentsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/categories"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <CategoriesPage />
                    </RequireRole>
                  }
                />
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

                {/* Assessments (Quiz & Exercices) */}
                <Route path="/assessments" element={<AssessmentsPage />} />
                <Route
                  path="/quizzes/new"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <QuizFormPage />
                    </RequireRole>
                  }
                />
                <Route path="/quizzes/:quizId" element={<QuizDetailPage />} />
                <Route
                  path="/quizzes/:quizId/edit"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <QuizFormPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/quizzes/:quizId/take"
                  element={
                    <RequireRole roles={STUDENT_ROLES}>
                      <QuizTakePage />
                    </RequireRole>
                  }
                />
                <Route path="/quizzes/:quizId/attempts/:attemptId" element={<QuizResultPage />} />
                <Route
                  path="/exercises/new"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <ExerciseFormPage />
                    </RequireRole>
                  }
                />
                <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
                <Route
                  path="/exercises/:exerciseId/edit"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <ExerciseFormPage />
                    </RequireRole>
                  }
                />

                {/* Calendrier */}
                <Route path="/calendar" element={<CalendarPage />} />

                {/* Inscriptions */}
                <Route path="/my-enrollments" element={<MyEnrollmentsPage />} />
                <Route
                  path="/enrollments"
                  element={
                    <RequireRole roles={ADMIN_ROLES}>
                      <EnrollmentsAdminPage />
                    </RequireRole>
                  }
                />

                {/* Sessions en ligne */}
                <Route path="/sessions" element={<SessionsPage />} />                <Route
                  path="/sessions/new"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <SessionFormPage />
                    </RequireRole>
                  }
                />
                <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
                <Route
                  path="/sessions/:sessionId/edit"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <SessionFormPage />
                    </RequireRole>
                  }
                />

                {/* Annonces */}
                <Route path="/announcements" element={<AnnouncementsPage />} />
                <Route
                  path="/announcements/new"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <AnnouncementFormPage />
                    </RequireRole>
                  }
                />
                <Route path="/announcements/:announcementId" element={<AnnouncementDetailPage />} />
                <Route
                  path="/announcements/:announcementId/edit"
                  element={
                    <RequireRole roles={COURSE_MANAGER_ROLES}>
                      <AnnouncementFormPage />
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
