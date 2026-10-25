import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

const api = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
  updateProfileRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  logoutRequest: vi.fn(),
}))

vi.mock('../api/auth', () => api)

function Probe() {
  const { user, status, login, register, updateProfile, changePassword, logout } =
    useAuth()

  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.email || 'none'}</p>
      <button type="button" onClick={() => login('test@example.com', 'Secret123!')}>
        Sign in
      </button>
      <button
        type="button"
        onClick={() =>
          register({
            first_name: 'Sofia',
            last_name: 'Student',
            email: 'sofia@example.com',
            password: 'MotDePasse123!',
            password_confirm: 'MotDePasse123!',
            role: 'student',
          })
        }
      >
        Register
      </button>
      <button
        type="button"
        onClick={() =>
          updateProfile({
            first_name: 'Nina',
            last_name: 'Martin',
            email: 'nina@example.com',
          })
        }
      >
        Profile
      </button>
      <button
        type="button"
        onClick={() =>
          changePassword({
            current_password: 'MotDePasse123!',
            new_password: 'NouveauMotDePasse456!',
            new_password_confirm: 'NouveauMotDePasse456!',
          })
        }
      >
        Password
      </button>
      <button type="button" onClick={() => logout()}>
        Sign out
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset())
})

describe('AuthProvider', () => {
  it('restores an existing session', async () => {
    api.fetchCurrentUser.mockResolvedValue({ email: 'teacher@edumind.local' })

    renderProvider()

    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(screen.getByTestId('user')).toHaveTextContent('teacher@edumind.local')
  })

  it('treats a failed session check as anonymous', async () => {
    api.fetchCurrentUser.mockRejectedValue(new Error('401'))

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('stores the user after login and clears it after logout', async () => {
    const user = userEvent.setup()
    api.fetchCurrentUser.mockRejectedValue(new Error('401'))
    api.loginRequest.mockResolvedValue({
      email: 'test@example.com',
      first_name: 'Test',
    })
    api.logoutRequest.mockResolvedValue(undefined)

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(api.loginRequest).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'Secret123!',
    })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    expect(api.logoutRequest).toHaveBeenCalled()
  })

  it('updates the stored user after a profile change', async () => {
    const user = userEvent.setup()
    api.fetchCurrentUser.mockResolvedValue({
      email: 'old@example.com',
      first_name: 'Old',
    })
    api.updateProfileRequest.mockResolvedValue({
      email: 'nina@example.com',
      first_name: 'Nina',
    })

    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )

    await user.click(screen.getByRole('button', { name: 'Profile' }))

    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('nina@example.com'),
    )
    expect(api.updateProfileRequest).toHaveBeenCalledWith({
      first_name: 'Nina',
      last_name: 'Martin',
      email: 'nina@example.com',
    })
  })

  it('forwards password changes without touching the stored user', async () => {
    const user = userEvent.setup()
    api.fetchCurrentUser.mockResolvedValue({
      email: 'test@example.com',
      first_name: 'Test',
    })
    api.changePasswordRequest.mockResolvedValue({
      detail: 'Your password has been updated.',
    })

    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )

    await user.click(screen.getByRole('button', { name: 'Password' }))

    await waitFor(() =>
      expect(api.changePasswordRequest).toHaveBeenCalledWith({
        current_password: 'MotDePasse123!',
        new_password: 'NouveauMotDePasse456!',
        new_password_confirm: 'NouveauMotDePasse456!',
      }),
    )
    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
  })

  it('authenticates immediately after registration', async () => {
    const user = userEvent.setup()
    api.fetchCurrentUser.mockRejectedValue(new Error('401'))
    api.registerRequest.mockResolvedValue({
      email: 'sofia@example.com',
      first_name: 'Sofia',
    })

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))

    await user.click(screen.getByRole('button', { name: 'Register' }))

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(screen.getByTestId('user')).toHaveTextContent('sofia@example.com')
  })
})
