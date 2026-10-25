import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AccessDenied } from '../courses/AccessDenied'
import { PageLoader } from '../ui/Skeleton'

export function RequireAuth() {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <PageLoader label="Opening your workspace…" />
  }

  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return <Outlet />
}

export function GuestOnly() {
  const { user, status } = useAuth()

  if (status === 'loading') {
    return <PageLoader label="Checking your session…" />
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export function RequireRole({ roles, children }) {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <PageLoader label="Checking your permissions…" />
  }

  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  if (!roles.includes(user.role)) {
    return <AccessDenied />
  }

  return children
}
