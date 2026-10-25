import { ArrowLeft, Compass } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { AcademicMotif } from '../components/ui/AcademicMotif'
import { LinkButton } from '../components/ui/Button'
import { BrandMark } from '../components/ui/Logo'

export default function NotFoundPage() {
  const { user } = useAuth()

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-mist px-5 py-16 text-center">
      <AcademicMotif
        bookmark={false}
        className="pointer-events-none absolute -bottom-24 -left-20 hidden w-[32rem] text-ink/[0.05] sm:block"
      />

      <div className="relative">
        <BrandMark className="size-14 rounded-2xl [&>svg]:size-8" />
        <span className="academic-rule mx-auto mt-8" aria-hidden="true" />
        <p className="font-display mt-4 text-7xl font-semibold tracking-tight text-brand-strong sm:text-8xl">
          404
        </p>
        <div className="mt-3 flex items-center justify-center gap-2 text-slate-500">
          <Compass className="size-5" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-ink">This page does not exist</h1>
        </div>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
          The link may be outdated or the page may have moved. Return to your
          workspace to find your courses.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton to={user ? '/dashboard' : '/login'}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {user ? 'Back to dashboard' : 'Go to sign in'}
          </LinkButton>
          {user ? (
            <LinkButton to="/courses" variant="secondary">
              Browse courses
            </LinkButton>
          ) : null}
        </div>
      </div>
    </main>
  )
}
