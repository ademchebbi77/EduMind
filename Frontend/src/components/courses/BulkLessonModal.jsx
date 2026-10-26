import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  Trash2,
} from 'lucide-react'
import { cx } from '../../lib/cx'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Field'
import { Modal } from '../ui/Modal'

const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

const DIFFICULTY_VARIANTS = {
  beginner: 'sage',
  intermediate: 'brand',
  advanced: 'clay',
}

const FILE_TYPE_LABELS = {
  pdf: 'PDF',
  audio: 'Audio',
  video: 'Video',
}

function draftFromLesson(lesson, file, key) {
  return {
    key,
    file,
    fileName: lesson.file_name,
    fileType: lesson.file_type,
    title: lesson.title || '',
    description: lesson.description || '',
    duration:
      lesson.duration_minutes === null || lesson.duration_minutes === undefined
        ? ''
        : String(lesson.duration_minutes),
    difficulty: lesson.difficulty || '',
    confidence: typeof lesson.confidence === 'number' ? lesson.confidence : null,
    warnings: Array.isArray(lesson.warnings) ? lesson.warnings : [],
    titleError: null,
    durationError: null,
  }
}

function buildDrafts(lessons, files) {
  const pool = new Map()
  ;(files || []).forEach((file) => {
    const list = pool.get(file.name) || []
    list.push(file)
    pool.set(file.name, list)
  })

  return (lessons || []).map((lesson, index) => {
    const candidates = pool.get(lesson.file_name)
    const file = candidates?.length ? candidates.shift() : (files || [])[index] || null
    return draftFromLesson(lesson, file, `${lesson.file_name}-${index}`)
  })
}

function validateDraft(draft) {
  const next = { ...draft }
  next.titleError = draft.title.trim() ? null : 'Enter a lesson title.'
  next.durationError =
    draft.duration.trim() !== '' &&
    (!Number.isInteger(Number(draft.duration)) || Number(draft.duration) < 0)
      ? 'Enter a whole number of minutes.'
      : null
  return next
}

function FailedFiles({ failed }) {
  if (!failed.length) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="size-4" aria-hidden="true" />
        {failed.length} file{failed.length === 1 ? '' : 's'} could not be analyzed
      </p>
      <ul className="mt-2 space-y-1 text-xs text-amber-900">
        {failed.map((item, index) => (
          <li key={`${item.file_name}-${index}`}>
            <span className="font-medium">{item.file_name}</span>
            {item.error ? ` — ${item.error}` : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BulkLessonReview({ lessons, failed, files, onAdd, onCancel }) {
  const [drafts, setDrafts] = useState(() => buildDrafts(lessons, files))
  const [dragKey, setDragKey] = useState(null)

  function updateDraft(key, patch) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    )
  }

  function removeDraft(key) {
    setDrafts((current) => current.filter((draft) => draft.key !== key))
  }

  function moveDraft(fromKey, toIndex) {
    setDrafts((current) => {
      const fromIndex = current.findIndex((draft) => draft.key === fromKey)
      if (fromIndex === -1 || toIndex < 0 || toIndex >= current.length) return current
      const next = [...current]
      const [draft] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, draft)
      return next
    })
  }

  function moveBy(key, direction) {
    setDrafts((current) => {
      const index = current.findIndex((draft) => draft.key === key)
      const target = index + direction
      if (index === -1 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [draft] = next.splice(index, 1)
      next.splice(target, 0, draft)
      return next
    })
  }

  function handleAdd() {
    const validated = drafts.map(validateDraft)
    setDrafts(validated)
    if (validated.some((draft) => draft.titleError || draft.durationError)) return
    onAdd(validated)
  }

  return (
    <div className="space-y-4">
      <FailedFiles failed={failed} />

      {drafts.length === 0 ? (
        <p className="text-sm text-slate-600">
          None of the files produced a lesson. Remove the problematic files and try again.
        </p>
      ) : (
        <ol className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {drafts.map((draft, index) => (
            <li
              key={draft.key}
              draggable
              onDragStart={() => setDragKey(draft.key)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragKey) moveDraft(dragKey, index)
                setDragKey(null)
              }}
              onDragEnd={() => setDragKey(null)}
              aria-label={`Generated lesson ${index + 1}: ${draft.title || 'Untitled'}`}
              className={cx(
                'rounded-xl border border-line bg-paper p-3 transition',
                dragKey === draft.key && 'opacity-50',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <GripVertical
                  className="size-4 shrink-0 cursor-grab text-slate-400"
                  aria-hidden="true"
                />
                <Badge variant="neutral">Lesson {index + 1}</Badge>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                  <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{draft.fileName}</span>
                </span>
                {draft.fileType ? (
                  <Badge variant="neutral">
                    {FILE_TYPE_LABELS[draft.fileType] || draft.fileType}
                  </Badge>
                ) : null}
                {draft.difficulty ? (
                  <Badge variant={DIFFICULTY_VARIANTS[draft.difficulty] || 'neutral'}>
                    {DIFFICULTY_LABELS[draft.difficulty] || draft.difficulty}
                  </Badge>
                ) : null}
                {draft.confidence !== null ? (
                  <span className="text-xs text-slate-500">
                    {Math.round(draft.confidence * 100)}% confidence
                  </span>
                ) : null}

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveBy(draft.key, -1)}
                    disabled={index === 0}
                    aria-label={`Move generated lesson ${index + 1} up`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-mist hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBy(draft.key, 1)}
                    disabled={index === drafts.length - 1}
                    aria-label={`Move generated lesson ${index + 1} down`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-mist hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.key)}
                    aria-label={`Remove generated lesson ${index + 1}`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-clay/10 hover:text-clay"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Input
                  label="Lesson title"
                  value={draft.title}
                  onChange={(event) =>
                    updateDraft(draft.key, {
                      title: event.target.value,
                      titleError: null,
                    })
                  }
                  error={draft.titleError}
                  maxLength={200}
                  required
                />
                <Input
                  label="Duration (min)"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={draft.duration}
                  onChange={(event) =>
                    updateDraft(draft.key, {
                      duration: event.target.value,
                      durationError: null,
                    })
                  }
                  error={draft.durationError}
                />
              </div>

              <div className="mt-3">
                <Textarea
                  label="Lesson description"
                  rows={2}
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft(draft.key, { description: event.target.value })
                  }
                />
              </div>

              {draft.warnings.length ? (
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {draft.warnings.map((warning) => (
                    <li key={warning} className="flex gap-1.5">
                      <AlertTriangle
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleAdd} disabled={drafts.length === 0}>
          Add all lessons
        </Button>
      </div>
    </div>
  )
}

export default function BulkLessonModal({
  open,
  batchKey = 0,
  files = [],
  result,
  loading = false,
  error = '',
  onClose,
  onAdd,
}) {
  const title = loading
    ? 'Analyzing your files…'
    : `AI generated lessons (${result?.lessons?.length ?? 0})`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Review before adding. Nothing is saved until you save the course."
      size="xl"
    >
      {loading ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600" aria-live="polite">
            Analyzing {files.length} file{files.length === 1 ? '' : 's'} with local AI. This
            can take a few seconds.
          </p>
          <div
            role="progressbar"
            aria-label="Analyzing files"
            className="h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
          </div>
          <ul className="space-y-1 text-sm text-slate-500">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                <FileText className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{file.name}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="space-y-4">
          <div
            role="alert"
            className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
          >
            {error}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && !error && result ? (
        <BulkLessonReview
          key={batchKey}
          lessons={result.lessons}
          failed={result.failed}
          files={files}
          onAdd={onAdd}
          onCancel={onClose}
        />
      ) : null}
    </Modal>
  )
}
