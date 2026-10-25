import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

const loginMock = vi.fn()
const registerMock = vi.fn()

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<p>Registration page</p>} />
        <Route path="/dashboard" element={<p>Private area</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<p>Sign-in page</p>} />
        <Route path="/dashboard" element={<p>Private area</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuth.mockReset()
  loginMock.mockReset()
  registerMock.mockReset()
  useAuth.mockReturnValue({ login: loginMock, register: registerMock })
})

describe('LoginPage', () => {
  it('blocks submission and shows client validation messages', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed email before calling the API', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email')
    await user.type(screen.getByLabelText(/^password/i), 'Secret123!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByText('That email address is not valid.')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('logs in and redirects to the requested page', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValue({ first_name: 'Thomas' })
    renderLogin()

    await user.type(screen.getByLabelText(/email address/i), ' teacher@example.com ')
    await user.type(screen.getByLabelText(/^password/i), 'Secret123!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Private area')).toBeInTheDocument()
    expect(loginMock).toHaveBeenCalledWith('teacher@example.com', 'Secret123!')
  })

  it('shows a server error when credentials are refused', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue({
      code: 'invalid_credentials',
      message: 'Incorrect email or password.',
      fields: {},
      status: 400,
    })
    renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'teacher@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'WrongPassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email or password.',
    )
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    renderLogin()

    const password = screen.getByLabelText(/^password/i)
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))

    expect(password).toHaveAttribute('type', 'text')
    expect(
      screen.getByRole('button', { name: /hide password/i }),
    ).toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  async function fillValidForm(user, overrides = {}) {
    await user.type(screen.getByLabelText(/^first name/i), overrides.firstName ?? 'Sofia')
    await user.type(screen.getByLabelText(/^last name/i), overrides.lastName ?? 'Student')
    await user.type(
      screen.getByLabelText(/email address/i),
      overrides.email ?? 'sofia@example.com',
    )
    await user.type(
      screen.getByLabelText(/^password/i),
      overrides.password ?? 'StrongPass123!',
    )
    await user.type(
      screen.getByLabelText(/^confirm password/i),
      overrides.confirm ?? 'StrongPass123!',
    )
  }

  it('only offers student and teacher roles', () => {
    renderRegister()

    expect(screen.getByRole('option', { name: 'Student' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Teacher' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /administrator/i })).toBeNull()
  })

  it('validates required fields and password confirmation', async () => {
    const user = userEvent.setup()
    renderRegister()

    await user.click(screen.getByRole('button', { name: /create my account/i }))
    expect(screen.getByText('Enter your first name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your last name.')).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()

    await fillValidForm(user, { confirm: 'AnotherPassword!' })
    await user.click(screen.getByRole('button', { name: /create my account/i }))

    expect(
      screen.getByText('The two passwords do not match.'),
    ).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('registers a teacher and redirects to the dashboard', async () => {
    const user = userEvent.setup()
    registerMock.mockResolvedValue({ first_name: 'Sofia' })
    renderRegister()

    await fillValidForm(user, {
      firstName: ' Sofia ',
      email: 'sofia@example.com',
    })
    await user.selectOptions(screen.getByLabelText(/signing up as/i), 'teacher')
    await user.click(screen.getByRole('button', { name: /create my account/i }))

    expect(await screen.findByText('Private area')).toBeInTheDocument()
    expect(registerMock).toHaveBeenCalledWith({
      first_name: 'Sofia',
      last_name: 'Student',
      email: 'sofia@example.com',
      password: 'StrongPass123!',
      password_confirm: 'StrongPass123!',
      role: 'teacher',
    })
  })

  it('surfaces server field errors', async () => {
    const user = userEvent.setup()
    registerMock.mockRejectedValue({
      code: 'validation_error',
      message: 'The submitted data is invalid.',
      fields: { email: ['An account already exists with this email address.'] },
      status: 400,
    })
    renderRegister()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create my account/i }))

    expect(
      await screen.findByText('An account already exists with this email address.'),
    ).toBeInTheDocument()
  })
})
