import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function BackLink({ to = '/assessments', label = 'Back to quizzes & exercises' }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
