import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError } from '../../lib/api'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLE_HINTS = {
  student: 'Access the materials shared by your teachers.',
  teacher: 'Publish and manage your own courses.',
}

function validate(values) {
  const errors = {}

  if (!values.first_name.trim()) errors.first_name = 'Enter your first name.'
  if (!values.last_name.trim()) errors.last_name = 'Enter your last name.'

  if (!values.email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'That email address is not valid.'
  }

  if (!values.password) {
    errors.password = 'Choose a password.'
  } else if (values.password.length < 8) {
    errors.password = 'Your password must be at least 8 characters long.'
  } else if (/^\d+$/.test(values.password)) {
    errors.password = 'Your password cannot be made up only of numbers.'
  }

  if (!values.password_confirm) {
    errors.password_confirm = 'Confirm your password.'
  } else if (values.password_confirm !== values.password) {
    errors.password_confirm = 'The two passwords do not match.'
  }

  return errors
}

export default function RegisterPage() {
  const { register } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [values, setValues] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirm: '',
    role: 'student',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    try {
      const user = await register({
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim(),
        password: values.password,
        password_confirm: values.password_confirm,
        role: values.role,
      })
      addToast({
        type: 'success',
        message: `Your account is ready. Welcome, ${user.first_name || user.email}!`,
      })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      const fields = {
        first_name: firstFieldError(error.fields, 'first_name'),
        last_name: firstFieldError(error.fields, 'last_name'),
        email: firstFieldError(error.fields, 'email'),
        password: firstFieldError(error.fields, 'password'),
        password_confirm: firstFieldError(error.fields, 'password_confirm'),
        role: firstFieldError(error.fields, 'role'),
      }
      setErrors(fields)
      const hasFieldError = Object.values(fields).some(Boolean)
      if (!hasFieldError) {
        setFormError(
          firstFieldError(error.fields, 'non_field_errors') ||
            error.message ||
            'Unable to create your account.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Join your learning workspace in seconds."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-brand-strong underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError ? (
          <div
            role="alert"
            className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
          >
            {formError}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            name="first_name"
            autoComplete="given-name"
            value={values.first_name}
            onChange={(event) => updateField('first_name', event.target.value)}
            error={errors.first_name}
            required
          />
          <Input
            label="Last name"
            name="last_name"
            autoComplete="family-name"
            value={values.last_name}
            onChange={(event) => updateField('last_name', event.target.value)}
            error={errors.last_name}
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
          required
        />

        <Select
          label="I am signing up as"
          name="role"
          value={values.role}
          onChange={(event) => updateField('role', event.target.value)}
          hint={ROLE_HINTS[values.role]}
          error={errors.role}
          required
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </Select>

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(event) => updateField('password', event.target.value)}
          error={errors.password}
          hint="At least 8 characters. Avoid overly simple passwords."
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={
                showPassword ? 'Hide password' : 'Show password'
              }
              aria-pressed={showPassword}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-mist hover:text-ink-soft"
            >
              {showPassword ? (
                <EyeOff className="size-4.5" aria-hidden="true" />
              ) : (
                <Eye className="size-4.5" aria-hidden="true" />
              )}
            </button>
          }
        />

        <Input
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          name="password_confirm"
          autoComplete="new-password"
          value={values.password_confirm}
          onChange={(event) => updateField('password_confirm', event.target.value)}
          error={errors.password_confirm}
          required
        />

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create my account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
