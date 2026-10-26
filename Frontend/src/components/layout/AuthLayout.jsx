import { Link } from 'react-router-dom'
import { BookOpenCheck, ShieldCheck, Sparkles } from 'lucide-react'
import { AcademicMotif } from '../ui/AcademicMotif'
import { Logo } from '../ui/Logo'
import { AccessibilityButton } from '../accessibility/AccessibilityButton'

const HIGHLIGHTS = [
  {
    icon: BookOpenCheck,
    title: 'All your courses, one space',
    description: 'PDF and audio, organised and accessible in a few clicks.',
  },
  {
    icon: ShieldCheck,
    title: 'Controlled access',
    description: 'Each role has the permissions suited to its responsibilities.',
  },
  {
    icon: Sparkles,
    title: 'Built for learning',
    description: 'A clear, fast and accessible interface on every screen.',
  },
]

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-dvh bg-mist">
      <a href="#auth-content" className="skip-link">
        Skip to form
      </a>

      <div className="grid min-h-dvh lg:grid-cols-[1.08fr_1fr]">
        <section className="relative hidden overflow-hidden bg-ink px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-brand" />
          <div
            aria-hidden="true"
            className="absolute -right-40 -top-40 size-[28rem] rounded-full border border-white/10"
          />
          <AcademicMotif className="pointer-events-none absolute -bottom-10 -right-20 w-[34rem] text-white/[0.09]" />

          <div className="relative">
            <Logo light showTagline to="/login" />
          </div>

          <div className="relative max-w-lg py-10">
            <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
              <span className="h-px w-8 bg-gold/60" aria-hidden="true" />
              Learning platform
            </p>
            <h1 className="mt-5 font-display text-[2.75rem] font-semibold leading-[1.08] tracking-tight text-paper">
              Learn with clarity,
              <span className="block text-gold">teach with confidence.</span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/65">
              EduMind AI brings your course materials and teams together in a
              secure space built for student success.
            </p>

            <span className="academic-rule mt-7 bg-gold" aria-hidden="true" />

            <ul className="mt-8 space-y-5">
              {HIGHLIGHTS.map(({ icon: Icon, title: itemTitle, description }) => (
                <li key={itemTitle} className="flex gap-3.5">
                  <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-gold">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-paper">{itemTitle}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-white/55">
                      {description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-[11px] uppercase tracking-[0.16em] text-white/55">
            EduMind AI — a responsible learning environment.
          </p>
        </section>

        <main className="relative flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 size-56 rounded-full bg-brand/[0.06] blur-3xl"
          />
          <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
            <AccessibilityButton />
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <Logo showTagline to="/login" />
            </div>

            <div className="surface relative overflow-hidden p-6 sm:p-8">
              <div
                aria-hidden="true"
                className="absolute -right-10 -top-10 size-32 rounded-full border border-brand/10"
              />
              <header className="relative mb-6">
                <span className="academic-rule mb-5" aria-hidden="true" />
                <h2
                  id="auth-content"
                  className="font-display text-3xl font-semibold tracking-tight text-ink"
                >
                  {title}
                </h2>
                {subtitle ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{subtitle}</p>
                ) : null}
              </header>

              <div className="relative">{children}</div>
            </div>

            {footer ? (
              <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>
            ) : null}

            <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
              By continuing, you agree to EduMind AI&apos;s terms of use.{' '}
              <Link
                to="/login"
                className="font-medium text-brand-strong underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
              >
                Learn more
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
