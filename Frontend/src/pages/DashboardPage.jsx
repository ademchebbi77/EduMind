import {
  ArrowRight,
  BookOpen,
  FileText,
  Headphones,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { LinkButton } from '../components/ui/Button'
import { AcademicMotif } from '../components/ui/AcademicMotif'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { canManageCourses, roleLabel } from '../lib/roles'

const ROLE_GUIDANCE = {
  student:
    'You can browse courses and download their materials. Creating and editing courses is reserved for teachers and administrators.',
  teacher:
    'You can create courses and manage only the ones you own. Other teachers’ courses remain available to read.',
  admin:
    'You have full permissions on courses and can manage accounts from the administration area.',
}

const FORMAT_TONES = {
  brand: 'bg-brand/10 text-brand-strong ring-brand/15',
  sage: 'bg-sage/10 text-sage ring-sage/15',
  clay: 'bg-clay/10 text-clay ring-clay/15',
}

const FORMATS = [
  {
    icon: FileText,
    tone: 'brand',
    title: 'PDF materials',
    description: 'Read your documents directly in the browser.',
  },
  {
    icon: Headphones,
    tone: 'sage',
    title: 'Audio resources',
    description: 'Listen to podcasts and recordings with track navigation.',
  },
  {
    icon: ShieldCheck,
    tone: 'clay',
    title: 'Secure access',
    description: 'Your files stay private and are only served to signed-in users.',
  },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const canManage = canManageCourses(user?.role)
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-ink p-7 text-white shadow-xl shadow-ink/10 sm:p-10">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-brand" />
        <AcademicMotif className="pointer-events-none absolute -bottom-14 -right-24 hidden w-[28rem] text-white/[0.08] md:block" />

        <div className="relative max-w-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="onDark">{roleLabel(user?.role)}</Badge>
            <span className="text-xs font-medium first-letter:uppercase text-white/55">{today}</span>
          </div>

          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
            Hello, {user?.first_name || 'there'}.
          </h1>
          <span className="academic-rule mt-5 bg-gold" aria-hidden="true" />
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65">
            Find your learning materials and keep making progress in a space
            designed for focused, confident study.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <LinkButton to="/courses" variant="accent">
              Explore courses
              <ArrowRight className="size-4" aria-hidden="true" />
            </LinkButton>
            {canManage ? (
              <LinkButton
                to="/courses/new"
                variant="secondary"
                className="border-white/15 bg-white/10 text-paper hover:border-white/25 hover:bg-white/15"
              >
                <Plus className="size-4" aria-hidden="true" />
                Publish a course
              </LinkButton>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-access-title">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 id="quick-access-title" className="text-xl font-semibold text-ink">
              Quick access
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              The essentials of your learning workspace.
            </p>
          </div>
          <span className="academic-rule hidden sm:block" aria-hidden="true" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {FORMATS.map(({ icon: Icon, tone, title, description }) => (
            <Card
              key={title}
              className="h-full transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className={`mb-4 inline-flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ${FORMAT_TONES[tone]}`}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden bg-gradient-to-br from-white via-white to-sage/5">
          <div className="flex items-start gap-4">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-sage/10 text-sage ring-1 ring-inset ring-sage/15">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">Course catalogue</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Search courses by title or description, filter by format and open
                PDF or audio materials with ease.
              </p>
              <div className="mt-4">
                <LinkButton to="/courses" variant="secondary" size="sm">
                  Open catalogue
                  <ArrowRight className="size-4" aria-hidden="true" />
                </LinkButton>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-4">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-clay/10 text-clay ring-1 ring-inset ring-clay/15">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">Your role</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {ROLE_GUIDANCE[user?.role] ||
                  'Your role determines which actions are available in the workspace.'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
