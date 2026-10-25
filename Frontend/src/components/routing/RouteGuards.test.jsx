import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { GuestOnly, RequireAuth, RequireRole } from './RouteGuards'

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

function renderPrivateArea() {
  return render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/private" element={<p>Private content</p>} />
        </Route>
        <Route path="/login" element={<p>Sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuth.mockReset()
  })

  it('redirects anonymous visitors to login', () => {
    useAuth.mockReturnValue({ user: null, status: 'guest' })

    renderPrivateArea()

    expect(screen.getByText('Sign-in page')).toBeInTheDocument()
  })

  it('renders the protected content for authenticated users', () => {
    useAuth.mockReturnValue({ user: { id: 1 }, status: 'authenticated' })

    renderPrivateArea()

    expect(screen.getByText('Private content')).toBeInTheDocument()
  })

  it('shows a loader while the session is being restored', () => {
    useAuth.mockReturnValue({ user: null, status: 'loading' })

    renderPrivateArea()

    expect(screen.getByRole('status')).toHaveTextContent(/opening your workspace/iu)
  })
})

describe('GuestOnly', () => {
  beforeEach(() => {
    useAuth.mockReset()
  })

  it('redirects authenticated users to the dashboard', () => {
    useAuth.mockReturnValue({ user: { id: 1 }, status: 'authenticated' })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<p>Form</p>} />
          </Route>
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows the form to anonymous visitors', () => {
    useAuth.mockReturnValue({ user: null, status: 'guest' })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<p>Form</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Form')).toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  function renderRestrictedArea() {
    return render(
      <MemoryRouter initialEntries={['/new']}>
        <Routes>
          <Route
            path="/new"
            element={
              <RequireRole roles={['teacher', 'admin']}>
                <p>Teacher area</p>
              </RequireRole>
            }
          />
          <Route path="/login" element={<p>Sign-in page</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    useAuth.mockReset()
  })

  it('renders the content for an allowed role', () => {
    useAuth.mockReturnValue({
      user: { id: 1, role: 'teacher' },
      status: 'authenticated',
    })

    renderRestrictedArea()

    expect(screen.getByText('Teacher area')).toBeInTheDocument()
  })

  it('shows an access denied state for students', () => {
    useAuth.mockReturnValue({
      user: { id: 2, role: 'student' },
      status: 'authenticated',
    })

    renderRestrictedArea()

    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(screen.queryByText('Teacher area')).toBeNull()
  })

  it('redirects anonymous visitors to login', () => {
    useAuth.mockReturnValue({ user: null, status: 'guest' })

    renderRestrictedArea()

    expect(screen.getByText('Sign-in page')).toBeInTheDocument()
  })
})
