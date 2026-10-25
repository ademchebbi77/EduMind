import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { AppLayout } from './AppLayout'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({ useToast: vi.fn() }))

const logout = vi.fn()
const updateProfile = vi.fn()

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<p>Dashboard</p>} />
          <Route path="/profile" element={<p>Profile page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  logout.mockReset()
  updateProfile.mockReset()
  useAuth.mockReturnValue({
    user: {
      first_name: 'Sofia',
      last_name: 'Student',
      full_name: 'Sofia Student',
      email: 'sofia@example.com',
      role: 'student',
    },
    updateProfile,
    logout,
  })
  useToast.mockReturnValue({ addToast: vi.fn() })
})

describe('AppLayout', () => {
  it('navigates to the profile page from the action next to logout', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(
      screen.getByRole('link', { name: /edit my profile/i }),
    )

    expect(await screen.findByText('Profile page')).toBeInTheDocument()
  })

  it('shows the account administration link to admins', () => {
    useAuth.mockReturnValue({
      user: {
        first_name: 'Ada',
        last_name: 'Admin',
        full_name: 'Ada Admin',
        email: 'admin@example.com',
        role: 'admin',
      },
      updateProfile,
      logout,
    })

    renderLayout()

    expect(screen.getByRole('link', { name: /users/i })).toHaveAttribute(
      'href',
      '/users',
    )
  })

  it('hides the account administration link from students', () => {
    renderLayout()

    expect(screen.queryByRole('link', { name: /users/i })).toBeNull()
  })
})
