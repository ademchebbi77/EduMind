import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError } from '../../lib/api'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEMO_PASSWORD = 'EduMind!2026'
const DEMO_ACCOUNTS = [
  { label: 'Student', email: 'student@edumind.local' },
  { label: 'Teacher', email: 'teacher@edumind.local' },
  { label: 'Administrator', email: 'admin@edumind.local' },
]

function validate(values) {
  const errors = {}
  if (!values.email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'That email address is not valid.'
  }
  if (!values.password) {
    errors.password = 'Enter your password.'
  }
  return errors
}

export default function LoginPage() {
  const { login } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const redirectTo = location.state?.from || '/dashboard'

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
      const user = await login(values.email.trim(), values.password)
      addToast({
        type: 'success',
        message: `Welcome, ${user.first_name || user.email}!`,
      })
      navigate(redirectTo, { replace: true })
    } catch (error) {
      const fieldErrors = {
        email: firstFieldError(error.fields, 'email'),
        password: firstFieldError(error.fields, 'password'),
      }
      setErrors(fieldErrors)
      if (!fieldErrors.email && !fieldErrors.password) {
        setFormError(
          firstFieldError(error.fields, 'non_field_errors') ||
            error.message ||
            'Unable to sign in.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemoAccount(email) {
    setValues({ email, password: DEMO_PASSWORD })
    setErrors({})
    setFormError('')
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your courses and learning workspace."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-brand-strong underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
          >
            Create an account
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
          trailing={<Mail className="size-4.5 text-slate-400" aria-hidden="true" />}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="Your password"
          value={values.password}
          onChange={(event) => updateField('password', event.target.value)}
          error={errors.password}
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

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {import.meta.env.DEV ? (
        <details className="mt-6 rounded-xl border border-line bg-mist/70 p-3 text-xs text-slate-600 open:bg-mist/50">
          <summary className="cursor-pointer font-semibold text-ink">
            Demo accounts (local only)
          </summary>
          <p className="mt-3">
            Shared password:{' '}
            <code className="rounded border border-line bg-paper px-1.5 py-0.5 font-semibold text-ink-soft">
              {DEMO_PASSWORD}
            </code>
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => fillDemoAccount(account.email)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 py-1.5 font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand-strong"
                >
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  {account.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </AuthLayout>
  )
}
