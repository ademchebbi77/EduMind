import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import UserEditPage from './UserEditPage'
import UsersPage from './UsersPage'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  fetchUsers: vi.fn(),
  fetchUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  updateProfile: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))
vi.mock('../../api/users', () => ({
  fetchUsers: mocks.fetchUsers,
  fetchUser: mocks.fetchUser,
  updateUser: mocks.updateUser,
  deleteUser: mocks.deleteUser,
}))

const ADMIN = {
  id: 1,
  first_name: 'Ada',
  last_name: 'Admin',
  full_name: 'Ada Admin',
  email: 'admin@example.com',
  role: 'admin',
  role_display: 'Administrator',
  is_active: true,
  is_superuser: false,
  date_joined: '2026-01-10T10:00:00Z',
}

const TEACHER = {
  id: 2,
  first_name: 'Thomas',
  last_name: 'Martin',
  full_name: 'Thomas Martin',
  email: 'teacher@example.com',
  role: 'teacher',
  role_display: 'Teacher',
  is_active: false,
  is_superuser: false,
  date_joined: '2026-02-12T10:00:00Z',
}

const STUDENT = {
  id: 3,
  first_name: 'Sofia',
  last_name: 'Durand',
  full_name: 'Sofia Durand',
  email: 'sofia@example.com',
  role: 'student',
  role_display: 'Student',
  is_active: true,
  is_superuser: false,
  date_joined: '2026-03-15T10:00:00Z',
}

const SUPERUSER = {
  id: 4,
  first_name: 'Super',
  last_name: 'User',
  full_name: 'Super User',
  email: 'super@example.com',
  role: 'admin',
  role_display: 'Administrator',
  is_active: true,
  is_superuser: true,
  date_joined: '2026-04-01T10:00:00Z',
}

function renderRoute(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:userId/edit" element={<UserEditPage />} />
        <Route path="/profile" element={<p>Profile page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function signInAs(user) {
  useAuth.mockReturnValue({
    user,
    status: 'authenticated',
    updateProfile: mocks.updateProfile,
  })
}

function defaultUsersResult() {
  return {
    count: 3,
    next: null,
    previous: null,
    results: [ADMIN, TEACHER, STUDENT],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  signInAs(ADMIN)
  mocks.fetchUsers.mockResolvedValue(defaultUsersResult())
  mocks.fetchUser.mockResolvedValue(STUDENT)
})

describe('UsersPage', () => {
  it('lists accounts and keeps self-management actions safe', async () => {
    renderRoute('/users')

    expect(
      await screen.findByRole('heading', { name: 'Account management' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
    expect(screen.getByText('Thomas Martin')).toBeInTheDocument()
    expect(screen.getByText('Sofia Durand')).toBeInTheDocument()

    expect(
      screen.getByRole('link', { name: 'Edit my profile' }),
    ).toHaveAttribute('href', '/profile')
    expect(
      screen.queryByRole('button', {
        name: "Deactivate Ada Admin's account",
      }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: "Delete Ada Admin's account",
      }),
    ).toBeNull()
    expect(
      screen.getByRole('button', {
        name: "Deactivate Sofia Durand's account",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: "Delete Sofia Durand's account",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: "Reactivate Thomas Martin's account",
      }),
    ).toBeInTheDocument()

    expect(mocks.fetchUsers).toHaveBeenCalledWith(
      { search: '', role: '', isActive: '', page: 1 },
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  it('sends search, role and status filters to the API', async () => {
    const user = userEvent.setup()
    renderRoute('/users')

    await screen.findByText('Sofia Durand')

    await user.selectOptions(screen.getByLabelText(/^role/i), 'teacher')
    await waitFor(() =>
      expect(mocks.fetchUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: 'teacher', page: 1 }),
        expect.anything(),
      ),
    )

    await user.type(screen.getByLabelText('Search'), 'sofia')
    await waitFor(
      () =>
        expect(mocks.fetchUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: 'sofia', page: 1 }),
          expect.anything(),
        ),
      { timeout: 2000 },
    )

    await user.selectOptions(screen.getByLabelText('Status'), 'false')
    await waitFor(() =>
      expect(mocks.fetchUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: 'false', page: 1 }),
        expect.anything(),
      ),
    )

    await user.click(
      screen.getByRole('button', { name: /reset filters/i }),
    )
    await waitFor(() =>
      expect(mocks.fetchUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: '',
          role: '',
          isActive: '',
          page: 1,
        }),
        expect.anything(),
      ),
    )
  })

  it('deactivates an account after confirmation', async () => {
    const user = userEvent.setup()
    mocks.updateUser.mockResolvedValue({ ...STUDENT, is_active: false })
    renderRoute('/users')

    const row = (await screen.findByText('Sofia Durand')).closest('li')
    await user.click(
      within(row).getByRole('button', {
        name: "Deactivate Sofia Durand's account",
      }),
    )

    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Deactivate this account?' }),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate account' }),
    )

    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith(3, { is_active: false }),
    )
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: "Sofia Durand's account has been deactivated.",
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(row).getByText('Deactivated')).toBeInTheDocument()
    expect(
      within(row).getByRole('button', {
        name: "Reactivate Sofia Durand's account",
      }),
    ).toBeInTheDocument()
  })

  it('reactivates an account after confirmation', async () => {
    const user = userEvent.setup()
    mocks.updateUser.mockResolvedValue({ ...TEACHER, is_active: true })
    renderRoute('/users')

    const row = (await screen.findByText('Thomas Martin')).closest('li')
    await user.click(
      within(row).getByRole('button', {
        name: "Reactivate Thomas Martin's account",
      }),
    )

    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Reactivate this account?' }),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Reactivate account' }),
    )

    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith(2, { is_active: true }),
    )
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: "Thomas Martin's account has been reactivated.",
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(row).getByText('Active')).toBeInTheDocument()
  })

  it('deletes an account and its courses after confirmation', async () => {
    const user = userEvent.setup()
    mocks.deleteUser.mockResolvedValue()
    renderRoute('/users')

    const row = (await screen.findByText('Sofia Durand')).closest('li')
    await user.click(
      within(row).getByRole('button', {
        name: "Delete Sofia Durand's account",
      }),
    )

    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Delete this account?' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/all of this user's courses/i)).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('button', { name: 'Delete permanently' }),
    )

    await waitFor(() => expect(mocks.deleteUser).toHaveBeenCalledWith(3))
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: "Sofia Durand's account has been deleted.",
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(mocks.fetchUsers).toHaveBeenCalledTimes(2))
  })

  it('keeps the dialog open and shows the server error when deletion is refused', async () => {
    const user = userEvent.setup()
    mocks.deleteUser.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: 'validation_error',
            message: 'The submitted data is invalid.',
            fields: {
              non_field_errors: ['At least one active administrator must remain.'],
            },
          },
        },
      },
    })
    renderRoute('/users')

    const row = (await screen.findByText('Sofia Durand')).closest('li')
    await user.click(
      within(row).getByRole('button', {
        name: "Delete Sofia Durand's account",
      }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete permanently',
      }),
    )

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'At least one active administrator must remain.',
      }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('paginates accounts', async () => {
    const user = userEvent.setup()
    mocks.fetchUsers.mockResolvedValue({
      count: 15,
      next: 'http://localhost/api/auth/users/?page=2',
      previous: null,
      results: [STUDENT],
    })
    renderRoute('/users')

    await screen.findByText('Sofia Durand')
    const pagination = screen.getByRole('navigation', {
      name: 'Account pagination',
    })
    expect(pagination).toHaveTextContent('15 accounts · page 1')

    await user.click(within(pagination).getByRole('button', { name: /next/i }))

    await waitFor(() =>
      expect(mocks.fetchUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      ),
    )
  })
})

describe('UserEditPage', () => {
  it('updates another account and its role', async () => {
    const user = userEvent.setup()
    mocks.updateUser.mockResolvedValue({
      ...STUDENT,
      first_name: 'Sofia-Marie',
      last_name: 'Leroy',
      full_name: 'Sofia-Marie Leroy',
      email: 'sofia.leroy@example.com',
      role: 'teacher',
      role_display: 'Teacher',
    })
    renderRoute('/users/3/edit')

    expect(
      await screen.findByRole('heading', { name: 'Edit account' }),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^first name/i))
    await user.type(screen.getByLabelText(/^first name/i), 'Sofia-Marie')
    await user.clear(screen.getByLabelText(/^last name/i))
    await user.type(screen.getByLabelText(/^last name/i), 'Leroy')
    await user.clear(screen.getByLabelText(/^email address/i))
    await user.type(screen.getByLabelText(/^email address/i), 'sofia.leroy@example.com')
    await user.selectOptions(screen.getByLabelText(/^role/i), 'teacher')

    await user.click(
      screen.getByRole('button', { name: 'Save changes' }),
    )

    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith(3, {
        first_name: 'Sofia-Marie',
        last_name: 'Leroy',
        email: 'sofia.leroy@example.com',
        role: 'teacher',
        is_active: true,
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Account management' })).toBeInTheDocument()
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('locks role and deactivation controls on the current account', async () => {
    const user = userEvent.setup()
    mocks.fetchUser.mockResolvedValue(ADMIN)
    mocks.updateProfile.mockResolvedValue({ ...ADMIN, email: 'ada.new@example.com' })
    renderRoute('/users/1/edit')

    expect(
      await screen.findByRole('heading', { name: 'Edit my account' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^role/i)).toBeDisabled()
    expect(
      screen.getByText('You cannot change your own role.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Deactivate account' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Delete account' }),
    ).toBeDisabled()
    expect(
      screen.getByText('You cannot delete your own account.'),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^email address/i))
    await user.type(screen.getByLabelText(/^email address/i), 'ada.new@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Save changes' }),
    )

    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        first_name: 'Ada',
        last_name: 'Admin',
        email: 'ada.new@example.com',
      }),
    )
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('locks the role of a superuser while allowing status changes', async () => {
    mocks.fetchUser.mockResolvedValue(SUPERUSER)
    renderRoute('/users/4/edit')

    expect(
      await screen.findByRole('heading', { name: 'Edit account' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^role/i)).toBeDisabled()
    expect(
      screen.getByText('A superuser role is locked.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Deactivate account' }),
    ).toBeEnabled()
  })

  it('shows a field error returned by the API', async () => {
    const user = userEvent.setup()
    mocks.updateUser.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: 'validation_error',
            message: 'The submitted data is invalid.',
            fields: {
              role: ['At least one active administrator must remain.'],
            },
          },
        },
      },
    })
    renderRoute('/users/3/edit')

    await screen.findByRole('heading', { name: 'Edit account' })
    await user.click(
      screen.getByRole('button', { name: 'Save changes' }),
    )

    expect(
      await screen.findByText('At least one active administrator must remain.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Edit account' }),
    ).toBeInTheDocument()
  })

  it('deletes another account from the edit page', async () => {
    const user = userEvent.setup()
    mocks.deleteUser.mockResolvedValue()
    renderRoute('/users/3/edit')

    await screen.findByRole('heading', { name: 'Edit account' })
    await user.click(
      screen.getByRole('button', { name: 'Delete account' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Delete this account?' }),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete permanently' }),
    )

    await waitFor(() => expect(mocks.deleteUser).toHaveBeenCalledWith(3))
    expect(
      await screen.findByRole('heading', { name: 'Account management' }),
    ).toBeInTheDocument()
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: "Sofia Durand's account has been deleted.",
      }),
    )
  })

  it('shows a dedicated state for a missing account', async () => {
    mocks.fetchUser.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: {
          error: {
            code: 'not_found',
            message: 'The requested resource could not be found.',
          },
        },
      },
    })
    renderRoute('/users/999/edit')

    expect(
      await screen.findByRole('heading', { name: 'Account not found' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'View accounts' }),
    ).toHaveAttribute('href', '/users')
  })
})
