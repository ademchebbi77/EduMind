import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { firstFieldError } from '../lib/api'
import { ROLE_BADGE_VARIANTS, roleLabel } from '../lib/roles'
import { initialsOf } from '../lib/user'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { Badge } from '../components/ui/Badge'
import { Button, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Field'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const AVATAR_MAX_MB = 5
const AVATAR_MAX_BYTES = AVATAR_MAX_MB * 1024 * 1024

function profileValues(user) {
  return {
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    email: user?.email || '',
  }
}

function validateProfile(values) {
  const errors = {}
  if (!values.firstName.trim()) {
    errors.firstName = 'Enter your first name.'
  }
  if (!values.lastName.trim()) {
    errors.lastName = 'Enter your last name.'
  }
  if (!values.email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'That email address is not valid.'
  }
  return errors
}

function validatePassword(values) {
  const errors = {}
  if (!values.currentPassword) {
    errors.currentPassword = 'Enter your current password.'
  }
  if (!values.newPassword) {
    errors.newPassword = 'Choose a new password.'
  } else if (values.newPassword.length < 8) {
    errors.newPassword = 'Your password must be at least 8 characters long.'
  } else if (/^\d+$/.test(values.newPassword)) {
    errors.newPassword = 'Your password cannot be made up only of numbers.'
  } else if (values.newPassword === values.currentPassword) {
    errors.newPassword = 'Your new password must be different from the current one.'
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirm your new password.'
  } else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'The two passwords do not match.'
  }
  return errors
}

export default function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth()
  const { addToast } = useToast()
  useDocumentTitle('Edit my profile')

  const [values, setValues] = useState(() => profileValues(user))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef(null)
  const previewUrlRef = useRef('')

  const [passwordValues, setPasswordValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordFormError, setPasswordFormError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function revokePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
    }
  }

  function clearAvatarSelection() {
    setAvatarFile(null)
    setAvatarPreview('')
    setAvatarError('')
    revokePreview()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !AVATAR_EXTENSIONS.includes(extension)) {
      setAvatarError('Choose a JPEG, PNG or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError(`The image must not exceed ${AVATAR_MAX_MB} MB.`)
      event.target.value = ''
      return
    }

    revokePreview()
    previewUrlRef.current = URL.createObjectURL(file)
    setAvatarFile(file)
    setAvatarPreview(previewUrlRef.current)
    setAvatarError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const nextErrors = validateProfile(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSaving(true)
    try {
      const payload = {
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        email: values.email.trim(),
      }
      if (avatarFile) payload.avatar = avatarFile

      const updated = await updateProfile(payload)
      setValues(profileValues(updated))
      if (avatarFile) clearAvatarSelection()
      addToast({
        type: 'success',
        message: 'Your profile has been updated.',
      })
    } catch (error) {
      const fieldErrors = {
        firstName: firstFieldError(error.fields, 'first_name'),
        lastName: firstFieldError(error.fields, 'last_name'),
        email: firstFieldError(error.fields, 'email'),
      }
      setErrors(fieldErrors)

      const avatarMessage = firstFieldError(error.fields, 'avatar')
      if (avatarMessage) setAvatarError(avatarMessage)

      const hasFieldError =
        fieldErrors.firstName || fieldErrors.lastName || fieldErrors.email || avatarMessage
      if (!hasFieldError) {
        setFormError(
          firstFieldError(error.fields, 'non_field_errors') ||
            error.message ||
            'Profile update failed.',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  function updatePasswordField(name, value) {
    setPasswordValues((current) => ({ ...current, [name]: value }))
    setPasswordErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordFormError('')

    const nextErrors = validatePassword(passwordValues)
    setPasswordErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setChangingPassword(true)
    try {
      await changePassword({
        current_password: passwordValues.currentPassword,
        new_password: passwordValues.newPassword,
        new_password_confirm: passwordValues.confirmPassword,
      })
      setPasswordValues({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordErrors({})
      setShowPasswords(false)
      addToast({
        type: 'success',
        message: 'Your password has been updated.',
      })
    } catch (error) {
      const fieldErrors = {
        currentPassword: firstFieldError(error.fields, 'current_password'),
        newPassword: firstFieldError(error.fields, 'new_password'),
        confirmPassword: firstFieldError(error.fields, 'new_password_confirm'),
      }
      setPasswordErrors(fieldErrors)
      if (!Object.values(fieldErrors).some(Boolean)) {
        setPasswordFormError(
          firstFieldError(error.fields, 'non_field_errors') ||
            error.message ||
            'Password change failed.',
        )
      }
    } finally {
      setChangingPassword(false)
    }
  }

  const avatarSrc = avatarPreview || user?.avatar_url || ''
  const passwordType = showPasswords ? 'text' : 'password'

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to dashboard
      </Link>

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          My account
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Edit my profile
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Update your photo, personal details and password. Your role cannot be
          changed from this page.
        </p>
      </header>

      <div className="grid max-w-5xl gap-6 xl:grid-cols-2">
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={saving || undefined}
          className="h-full"
        >
          <div className="flex h-full flex-col gap-3">
            {formError ? (
              <div
                role="alert"
                className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
              >
                {formError}
              </div>
            ) : null}

            <Card className="flex flex-1 flex-col gap-5">
              <h2 className="text-xl font-semibold text-ink">
                Personal information
              </h2>

              <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={
                      avatarPreview
                        ? 'Preview of the new profile photo'
                        : 'Current profile photo'
                    }
                    className="size-20 shrink-0 rounded-full object-cover ring-1 ring-line"
                  />
                ) : (
                  <span
                    className="flex size-20 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-2xl font-semibold text-brand-strong ring-1 ring-brand/20"
                    aria-hidden="true"
                  >
                    {initialsOf(user)}
                  </span>
                )}

                <div className="min-w-0 flex-1 space-y-1.5">
                  <label
                    htmlFor="avatar"
                    className="block text-sm font-medium text-ink"
                  >
                    Profile photo
                  </label>
                  <p id="avatar-hint" className="text-xs text-slate-500">
                    JPEG, PNG or WebP image. {AVATAR_MAX_MB} MB maximum.
                  </p>                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      ref={fileInputRef}
                      id="avatar"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      onChange={handleAvatarChange}
                      disabled={saving}
                      aria-invalid={avatarError ? true : undefined}
                      aria-describedby={avatarError ? 'avatar-error' : 'avatar-hint'}
                      className="block w-full max-w-xs cursor-pointer rounded-xl border border-line bg-white text-sm text-slate-600 file:mr-3 file:cursor-pointer file:border-0 file:bg-mist file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-ink-soft hover:file:bg-line/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {avatarPreview ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearAvatarSelection}
                        disabled={saving}
                      >
                        Clear selection
                      </Button>
                    ) : null}
                  </div>
                  {avatarError ? (
                    <p
                      id="avatar-error"
                      role="alert"
                      className="text-xs font-medium text-clay"
                    >
                      {avatarError}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-mist/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">Account role</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    The role linked to your account cannot be changed.
                  </p>
                </div>
                <Badge variant={ROLE_BADGE_VARIANTS[user?.role] || 'neutral'}>
                  {roleLabel(user?.role)}
                </Badge>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="First name"
                  name="first_name"
                  autoComplete="given-name"
                  value={values.firstName}
                  onChange={(event) => updateField('firstName', event.target.value)}
                  error={errors.firstName}
                  disabled={saving}
                  required
                />
                <Input
                  label="Last name"
                  name="last_name"
                  autoComplete="family-name"
                  value={values.lastName}
                  onChange={(event) => updateField('lastName', event.target.value)}
                  error={errors.lastName}
                  disabled={saving}
                  required
                />
              </div>

              <Input
                label="Email address"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={values.email}
                onChange={(event) => updateField('email', event.target.value)}
                error={errors.email}
                hint="This address is also used to sign in."
                disabled={saving}
                required
              />

              <div className="mt-auto flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
                <LinkButton to="/dashboard" variant="secondary">
                  Cancel
                </LinkButton>
                <Button type="submit" loading={saving}>
                  Save changes
                </Button>
              </div>
            </Card>
          </div>
        </form>

        <Card
          as="form"
          onSubmit={handlePasswordSubmit}
          noValidate
          aria-busy={changingPassword || undefined}
          className="flex h-full flex-col gap-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-ink">Password</h2>
            <button
              type="button"
              onClick={() => setShowPasswords((current) => !current)}
              aria-pressed={showPasswords}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-mist hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {showPasswords ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
              {showPasswords ? 'Hide' : 'Show'}
            </button>
          </div>

          {passwordFormError ? (
            <div
              role="alert"
              className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
            >
              {passwordFormError}
            </div>
          ) : null}

          <Input
            label="Current password"
            type={passwordType}
            name="current_password"
            autoComplete="current-password"
            value={passwordValues.currentPassword}
            onChange={(event) =>
              updatePasswordField('currentPassword', event.target.value)
            }
            error={passwordErrors.currentPassword}
            disabled={changingPassword}
            required
          />

          <div className="grid gap-5">
            <Input
              label="New password"
              type={passwordType}
              name="new_password"
              autoComplete="new-password"
              value={passwordValues.newPassword}
              onChange={(event) =>
                updatePasswordField('newPassword', event.target.value)
              }
              error={passwordErrors.newPassword}
              hint="At least 8 characters."
              disabled={changingPassword}
              required
            />
            <Input
              label="Confirm new password"
              type={passwordType}
              name="new_password_confirm"
              autoComplete="new-password"
              value={passwordValues.confirmPassword}
              onChange={(event) =>
                updatePasswordField('confirmPassword', event.target.value)
              }
              error={passwordErrors.confirmPassword}
              disabled={changingPassword}
              required
            />
          </div>

          <div className="mt-auto flex justify-end border-t border-line pt-5">
            <Button type="submit" variant="secondary" loading={changingPassword}>
              Change password
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
