import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  FileQuestion,
  Lock,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react'
import { deleteUser, fetchUser, updateUser } from '../../api/users'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { ROLE_BADGE_VARIANTS, ROLE_LABELS, roleLabel } from '../../lib/roles'
import { initialsOf } from '../../lib/user'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { UserDeleteModal } from '../../components/admin/UserDeleteModal'
import { UserStatusModal } from '../../components/admin/UserStatusModal'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function valuesFrom(account) {
  return {
    firstName: account.first_name || '',
    lastName: account.last_name || '',
    email: account.email || '',
    role: account.role,
  }
}

function validateValues(values) {
  const errors = {}
  if (!values.firstName.trim()) {
    errors.firstName = 'Enter the first name.'
  }
  if (!values.lastName.trim()) {
    errors.lastName = 'Enter the last name.'
  }
  if (!values.email.trim()) {
    errors.email = 'Enter the email address.'
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'That email address is not valid.'
  }
  if (!values.role) {
    errors.role = 'Choose a role.'
  }
  return errors
}

export default function UserEditPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user: currentUser, updateProfile } = useAuth()
  const { addToast } = useToast()

  useDocumentTitle('Edit an account')

  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, account: null, error: null })
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const requestKey = `${userId}:${reload}`

  useEffect(() => {
    const controller = new AbortController()

    fetchUser(userId, { signal: controller.signal })
      .then((payload) => {
        setResult({ key: requestKey, account: payload, error: null })
        setValues(valuesFrom(payload))
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          account: null,
          error: normalizeApiError(
            requestError,
            'Unable to load this account.',
          ),
        })
      })

    return () => controller.abort()
  }, [userId, requestKey])

  const loading = result.key !== requestKey
  const account = loading ? null : result.account
  const loadError = loading ? null : result.error

  const isSelf = Boolean(account && currentUser && account.id === currentUser.id)
  const roleLocked = Boolean(isSelf || account?.is_superuser)
  const statusLocked = isSelf

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const nextErrors = validateValues(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    try {
      const profile = {
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        email: values.email.trim(),
      }
      const saved = isSelf
        ? await updateProfile(profile)
        : await updateUser(account.id, {
            ...profile,
            role: values.role,
            is_active: account.is_active,
          })

      addToast({
        type: 'success',
        message: `${saved.full_name}'s account has been updated.`,
      })
      navigate('/users', { replace: true })
    } catch (submitError) {
      const normalized = normalizeApiError(
        submitError,
        'Account update failed.',
      )
      const fieldErrors = {
        firstName: firstFieldError(normalized.fields, 'first_name'),
        lastName: firstFieldError(normalized.fields, 'last_name'),
        email: firstFieldError(normalized.fields, 'email'),
        role: firstFieldError(normalized.fields, 'role'),
      }
      setErrors(fieldErrors)

      if (!Object.values(fieldErrors).some(Boolean)) {
        setFormError(
          firstFieldError(normalized.fields, 'non_field_errors') ||
            normalized.message ||
            'Account update failed.',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange() {
    if (!account) return
    const nextActive = !account.is_active

    setChangingStatus(true)
    try {
      const updated = await updateUser(account.id, { is_active: nextActive })
      setResult((current) => ({ ...current, account: updated }))
      addToast({
        type: 'success',
        message: nextActive
          ? `${updated.full_name}'s account has been reactivated.`
          : `${updated.full_name}'s account has been deactivated.`,
      })
      setStatusModalOpen(false)
    } catch (statusError) {
      const normalized = normalizeApiError(
        statusError,
        'Status update failed.',
      )
      addToast({
        type: 'error',
        message:
          firstFieldError(normalized.fields, 'is_active') ||
          firstFieldError(normalized.fields, 'role') ||
          firstFieldError(normalized.fields, 'non_field_errors') ||
          normalized.message,
      })
    } finally {
      setChangingStatus(false)
    }
  }

  async function handleDelete() {
    if (!account) return

    setDeleting(true)
    try {
      await deleteUser(account.id)
      addToast({
        type: 'success',
        message: `${account.full_name}'s account has been deleted.`,
      })
      navigate('/users', { replace: true })
    } catch (deleteError) {
      const normalized = normalizeApiError(
        deleteError,
        'Account deletion failed.',
      )
      addToast({
        type: 'error',
        message:
          firstFieldError(normalized.fields, 'non_field_errors') ||
          normalized.message,
      })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <PageLoader label="Loading account…" />
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link
          to="/users"
          className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to accounts
        </Link>

        {loadError.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Account not found"
            description="This account does not exist or has been deleted."
            action={<LinkButton to="/users">View accounts</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to load the account"
              description={loadError.message}
              action={
                <Button
                  variant="secondary"
                  onClick={() => setReload((current) => current + 1)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Try again
                </Button>
              }
            />
          </div>
        )}
      </div>
    )
  }

  const roleHint = isSelf
    ? 'You cannot change your own role.'
    : account.is_superuser
      ? 'A superuser role is locked.'
      : 'The role determines which actions are allowed on the platform.'

  return (
    <div className="space-y-6">
      <Link
        to="/users"
        className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to accounts
      </Link>

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          Administration
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {isSelf ? 'Edit my account' : 'Edit account'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Update this user's details, role, and access.
            </p>
          </div>
          <Badge
            variant={ROLE_BADGE_VARIANTS[account.role] || 'neutral'}
            className="self-start sm:self-auto"
          >
            {roleLabel(account.role)}
          </Badge>
        </div>
      </header>

      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
        >
          {formError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
          <Card className="space-y-5">
            <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center">
              <span
                className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-xl font-semibold text-brand-strong ring-1 ring-brand/15"
                aria-hidden="true"
              >
                {initialsOf(account)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-ink">
                  {account.full_name}
                </p>
                <p className="truncate text-sm text-slate-500">{account.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Joined on {formatDate(account.date_joined)}
                </p>
              </div>
              {isSelf ? <Badge variant="brand">Your account</Badge> : null}
            </div>

            <div>
              <h2 className="text-xl font-semibold text-ink">
                Personal information
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                The name and email address are used to identify the user.
              </p>
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
              value={values.email}
              onChange={(event) => updateField('email', event.target.value)}
              error={errors.email}
              hint="This address is also the sign-in identifier."
              disabled={saving}
              required
            />

            <div className="border-t border-line pt-5">
              <h2 className="text-xl font-semibold text-ink">Role and access</h2>
              <p className="mt-1 text-sm text-slate-600">
                The role controls which features this user can access.
              </p>
            </div>

            <Select
              label="Role"
              name="role"
              value={values.role}
              onChange={(event) => updateField('role', event.target.value)}
              error={errors.role}
              hint={roleHint}
              disabled={roleLocked || saving}
              required
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            <div className="rounded-xl border border-line bg-mist/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Account status</p>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-600">
                    {account.is_active
                      ? 'This account can sign in and use the platform.'
                      : 'This account is blocked and cannot sign in.'}
                  </p>
                </div>
                <Badge variant={account.is_active ? 'success' : 'warning'} dot>
                  {account.is_active ? 'Active' : 'Deactivated'}
                </Badge>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {statusLocked
                    ? 'You cannot deactivate your own account.'
                    : 'Status changes take effect immediately.'}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={account.is_active ? 'danger' : 'accent'}
                  onClick={() => setStatusModalOpen(true)}
                  disabled={statusLocked || saving}
                >
                  {account.is_active ? (
                    <UserX className="size-4" aria-hidden="true" />
                  ) : (
                    <UserCheck className="size-4" aria-hidden="true" />
                  )}
                  {account.is_active ? 'Deactivate account' : 'Reactivate account'}
                </Button>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <LinkButton to="/users" variant="secondary">
                Cancel
              </LinkButton>
              <Button type="submit" loading={saving} disabled={changingStatus}>
                Save changes
              </Button>
            </div>
          </Card>
        </form>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="border-clay/25">
            <h2 className="text-xl font-semibold text-ink">Delete account</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The account will be permanently deleted, along with all its courses and
              their PDF or audio files.
            </p>
            {isSelf ? (
              <p className="mt-3 text-xs text-slate-500">
                You cannot delete your own account.
              </p>
            ) : null}
            <Button
              variant="danger"
              size="sm"
              className="mt-4"
              onClick={() => setDeleteModalOpen(true)}
              disabled={isSelf || saving || changingStatus}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete account
            </Button>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold text-ink">Account protections</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                <span>At least one active administrator must always remain.</span>
              </li>
              <li className="flex gap-2.5">
                <Lock className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden="true" />
                <span>
                  An administrator cannot change their own role or deactivate
                  their account.
                </span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
                <span>
                  The password and profile photo cannot be changed here.
                </span>
              </li>
            </ul>
          </Card>
        </aside>
      </div>

      <UserStatusModal
        account={account}
        open={statusModalOpen}
        changing={changingStatus}
        onClose={() => {
          if (!changingStatus) setStatusModalOpen(false)
        }}
        onConfirm={handleStatusChange}
      />

      <UserDeleteModal
        account={account}
        open={deleteModalOpen}
        deleting={deleting}
        onClose={() => {
          if (!deleting) setDeleteModalOpen(false)
        }}
        onConfirm={handleDelete}
      />
    </div>
  )
}
