import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import ProfilePage from './ProfilePage'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../context/ToastContext', () => ({ useToast: vi.fn() }))

const updateProfile = vi.fn()
const changePassword = vi.fn()
const addToast = vi.fn()

const currentUser = {
  first_name: 'Sofia',
  last_name: 'Student',
  full_name: 'Sofia Student',
  email: 'sofia@example.com',
  role: 'student',
  avatar_url: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  )
}

function passwordFields() {
  return {
    current: screen.getByLabelText(/current password/i),
    next: screen.getByLabelText(/^new password/i),
    confirm: screen.getByLabelText(/confirm new password/i),
  }
}

beforeEach(() => {
  updateProfile.mockReset()
  changePassword.mockReset()
  addToast.mockReset()
  useAuth.mockReturnValue({ user: currentUser, updateProfile, changePassword })
  useToast.mockReturnValue({ addToast })
})

describe('ProfilePage', () => {
  it('prefills the current profile', () => {
    renderPage()

    expect(screen.getByLabelText(/^first name/i)).toHaveValue('Sofia')
    expect(screen.getByLabelText(/^last name/i)).toHaveValue('Student')
    expect(screen.getByLabelText(/email address/i)).toHaveValue('sofia@example.com')
    expect(screen.getByText('Student')).toBeInTheDocument()
    expect(screen.getByText('SS')).toBeInTheDocument()
  })

  it('blocks submission when required fields are empty', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.clear(screen.getByLabelText(/^first name/i))
    await user.clear(screen.getByLabelText(/^last name/i))
    await user.clear(screen.getByLabelText(/email address/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(screen.getByText('Enter your first name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your last name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('saves trimmed values and stays on the page', async () => {
    const user = userEvent.setup()
    renderPage()
    updateProfile.mockResolvedValue({
      first_name: 'Nina',
      last_name: 'Student',
      email: 'nina@example.com',
      role: 'student',
      avatar_url: null,
    })

    await user.clear(screen.getByLabelText(/^first name/i))
    await user.type(screen.getByLabelText(/^first name/i), '  Nina  ')
    await user.clear(screen.getByLabelText(/email address/i))
    await user.type(screen.getByLabelText(/email address/i), ' Nina@Example.com ')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        first_name: 'Nina',
        last_name: 'Student',
        email: 'Nina@Example.com',
      }),
    )
    expect(addToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Your profile has been updated.',
    })
    expect(screen.getByLabelText(/email address/i)).toHaveValue('nina@example.com')
    expect(
      screen.getByRole('heading', { name: 'Edit my profile' }),
    ).toBeInTheDocument()
  })

  it('surfaces server field errors', async () => {
    const user = userEvent.setup()
    renderPage()
    updateProfile.mockRejectedValue({
      code: 'validation_error',
      message: 'The submitted data is invalid.',
      fields: { email: ['An account already exists with this email address.'] },
      status: 400,
    })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(
      await screen.findByText('An account already exists with this email address.'),
    ).toBeInTheDocument()
  })

  it('previews and uploads a selected avatar', async () => {
    const user = userEvent.setup()
    renderPage()
    updateProfile.mockResolvedValue({
      first_name: 'Sofia',
      last_name: 'Student',
      email: 'sofia@example.com',
      role: 'student',
      avatar_url: '/api/auth/me/avatar/?v=new',
    })
    const avatar = new File([new Uint8Array([137, 80, 78, 71])], 'avatar.png', {
      type: 'image/png',
    })

    await user.upload(screen.getByLabelText('Profile photo'), avatar)

    expect(
      screen.getByAltText('Preview of the new profile photo'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ avatar }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByAltText('Preview of the new profile photo'),
      ).not.toBeInTheDocument(),
    )
  })

  it('rejects an unsupported avatar format before upload', () => {
    renderPage()
    const input = screen.getByLabelText('Profile photo')
    const avatar = new File([new Uint8Array([71, 73, 70])], 'avatar.gif', {
      type: 'image/gif',
    })

    fireEvent.change(input, { target: { files: [avatar] } })

    expect(
      screen.getByText('Choose a JPEG, PNG or WebP image.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByAltText('Preview of the new profile photo'),
    ).not.toBeInTheDocument()
  })

  it('rejects an avatar larger than 5 MB', () => {
    renderPage()
    const input = screen.getByLabelText('Profile photo')
    const avatar = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      'avatar.png',
      { type: 'image/png' },
    )

    fireEvent.change(input, { target: { files: [avatar] } })

    expect(
      screen.getByText('The image must not exceed 5 MB.'),
    ).toBeInTheDocument()
  })

  it('displays a server error for the avatar', async () => {
    const user = userEvent.setup()
    renderPage()
    updateProfile.mockRejectedValue({
      code: 'validation_error',
      message: 'The submitted data is invalid.',
      fields: { avatar: ['The file content is not a valid image.'] },
      status: 400,
    })
    const avatar = new File([new Uint8Array([137, 80, 78, 71])], 'avatar.png', {
      type: 'image/png',
    })

    await user.upload(screen.getByLabelText('Profile photo'), avatar)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(
      await screen.findByText('The file content is not a valid image.'),
    ).toBeInTheDocument()
  })

  it('validates the password form before submitting', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      screen.getByRole('button', { name: /change password/i }),
    )

    expect(screen.getByText('Enter your current password.')).toBeInTheDocument()
    expect(screen.getByText('Choose a new password.')).toBeInTheDocument()
    expect(
      screen.getByText('Confirm your new password.'),
    ).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('rejects a password identical to the current one', async () => {
    const user = userEvent.setup()
    renderPage()
    const { current, next, confirm } = passwordFields()

    await user.type(current, 'StrongPass123!')
    await user.type(next, 'StrongPass123!')
    await user.type(confirm, 'StrongPass123!')
    await user.click(
      screen.getByRole('button', { name: /change password/i }),
    )

    expect(
      screen.getByText('Your new password must be different from the current one.'),
    ).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('changes the password and clears the form', async () => {
    const user = userEvent.setup()
    renderPage()
    changePassword.mockResolvedValue({
      detail: 'Your password has been updated.',
    })
    const { current, next, confirm } = passwordFields()

    await user.type(current, 'OldStrongPass123!')
    await user.type(next, 'NewStrongPass456!')
    await user.type(confirm, 'NewStrongPass456!')
    await user.click(
      screen.getByRole('button', { name: /change password/i }),
    )

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        current_password: 'OldStrongPass123!',
        new_password: 'NewStrongPass456!',
        new_password_confirm: 'NewStrongPass456!',
      }),
    )
    expect(addToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Your password has been updated.',
    })
    expect(current).toHaveValue('')
    expect(next).toHaveValue('')
    expect(confirm).toHaveValue('')
  })

  it('surfaces a server error on the current password', async () => {
    const user = userEvent.setup()
    renderPage()
    changePassword.mockRejectedValue({
      code: 'validation_error',
      message: 'The submitted data is invalid.',
      fields: { current_password: ['The current password is incorrect.'] },
      status: 400,
    })
    const { current, next, confirm } = passwordFields()

    await user.type(current, 'WrongPass123!')
    await user.type(next, 'NewStrongPass456!')
    await user.type(confirm, 'NewStrongPass456!')
    await user.click(
      screen.getByRole('button', { name: /change password/i }),
    )

    expect(
      await screen.findByText('The current password is incorrect.'),
    ).toBeInTheDocument()
  })
})
