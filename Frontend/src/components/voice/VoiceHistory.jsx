import { History, Trash2 } from 'lucide-react'
import { cx } from '../../lib/cx'
import { formatDate } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'

const STATUS_BADGES = {
  transcribing: ['warning', 'Transcribing'],
  transcribed: ['brand', 'To send'],
  answering: ['warning', 'Answering'],
  answered: ['success', 'Answered'],
  failed: ['clay', 'Failed'],
}
// Questions sent to the teacher after an unhelpful AI answer.
const REVIEW_BADGES = {
  pending: ['warning', 'With your teacher'],
  answered: ['sage', 'Verified by the teacher'],
}

export function VoiceHistory({ items, loading, error, activeId, onSelect, onDelete }) {
  return (
    <Card as="aside" aria-labelledby="voice-history-title" className="lg:self-start">
      <h2 id="voice-history-title" className="flex items-center gap-2 text-xl font-semibold text-ink">
        <History className="size-5 text-brand-strong" aria-hidden="true" />
        My questions
      </h2>
      <p className="mt-1 text-xs text-slate-600">Only you can see your questions and answers.</p>

      {loading && !items.length ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-clay">
          {error}
        </p>
      ) : !items.length ? (
        <p className="mt-4 text-sm text-slate-600">Your questions will appear here.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const [variant, label] = STATUS_BADGES[item.status] || ['neutral', item.status]
            const active = item.id === activeId
            const text = item.question_text || item.transcript || item.audio_name
            return (
              <li key={item.id} className="flex items-start gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-current={active ? 'true' : undefined}
                  className={cx(
                    'min-w-0 flex-1 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    active ? 'border-brand/50 bg-brand/[0.06]' : 'border-line bg-white hover:border-slate-300',
                  )}
                >
                  <span dir="auto" className="line-clamp-2 block text-sm font-medium text-ink">
                    {text}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    <Badge variant={variant}>{label}</Badge>
                    {item.review_status ? (
                      <Badge variant={REVIEW_BADGES[item.review_status][0]}>
                        {REVIEW_BADGES[item.review_status][1]}
                      </Badge>
                    ) : null}
                    <span className="truncate">{item.course_title}</span>
                    <span>· {formatDate(item.created_at)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  disabled={item.status === 'transcribing' || item.status === 'answering'}
                  aria-label={`Delete the question “${text.slice(0, 60)}”`}
                  title="Delete"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-clay/10 hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay disabled:opacity-40"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
