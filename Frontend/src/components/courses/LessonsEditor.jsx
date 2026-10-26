import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  createLesson,
  deleteLesson,
  fetchLessons,
  reorderLessons,
  updateLesson,
} from '../../api/courses'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { fileExtension, formatBytes } from '../../lib/format'
import { validateVideoUrl } from '../../lib/video'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Field'

const FILE_TYPE_LABELS = {
  pdf: 'PDF',
  video: 'Video',
  audio: 'Audio',
}

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'avi']

function fileKind(name) {
  const extension = fileExtension(name)
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video'
  if (extension === 'pdf') return 'pdf'
  return 'audio'
}

function emptyRow(key) {
  return {
    key,
    id: null,
    title: '',
    description: '',
    duration: '',
    file: null,
    videoUrl: '',
    existing_file_type: null,
    existing_has_file: false,
    existing_video_url: '',
    titleError: null,
    fileError: null,
    videoError: null,
    durationError: null,
  }
}

function validateRow(row) {
  const next = { ...row }
  next.titleError = row.title.trim() ? null : 'Enter a lesson title.'
  if (row.title.trim().length > 200) {
    next.titleError = 'The title cannot exceed 200 characters.'
  }

  const hasFile = Boolean(row.file || row.existing_has_file)
  const hasVideo = Boolean(row.videoUrl.trim())
  next.fileError =
    hasFile || hasVideo ? null : 'Upload a file or provide a YouTube/Vimeo link.'
  next.videoError = validateVideoUrl(row.videoUrl)

  next.durationError =
    row.duration.trim() !== '' &&
    (!Number.isInteger(Number(row.duration)) || Number(row.duration) < 0)
      ? 'Enter a whole number of minutes.'
      : null
  return next
}

function buildLessonFormData(row) {
  const formData = new FormData()
  formData.append('title', row.title.trim())
  formData.append('description', row.description.trim())
  formData.append('video_url', row.videoUrl.trim())
  if (row.duration.trim() !== '') {
    formData.append('duration_minutes', String(Number(row.duration)))
  }
  if (row.file) formData.append('file', row.file)
  return formData
}

function contentLabel(row) {
  const hasFile = Boolean(row.file || row.existing_has_file)
  const hasVideo = Boolean(row.videoUrl.trim())
  const kind = row.file ? fileKind(row.file.name) : row.existing_file_type

  if (hasFile && hasVideo) {
    return `${FILE_TYPE_LABELS[kind] || 'File'} + external video`
  }
  if (hasVideo) return 'External video'
  if (hasFile) return `${FILE_TYPE_LABELS[kind] || 'File'} file online`
  return null
}

const LessonsEditor = forwardRef(function LessonsEditor(
  { courseId, disabled = false, accept, error, validateFile },
  ref,
) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const nextKeyRef = useRef(1)
  const originalIdsRef = useRef([])

  useEffect(() => {
    if (!courseId) return undefined

    const controller = new AbortController()
    setLoading(true)
    setLoadError('')

    fetchLessons(courseId, { signal: controller.signal })
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : payload.results ?? []
        originalIdsRef.current = list.map((item) => item.id)
        setRows(
          list.map((item) => ({
            ...emptyRow(nextKeyRef.current++),
            id: item.id,
            title: item.title,
            description: item.description || '',
            duration:
              item.duration_minutes !== null && item.duration_minutes !== undefined
                ? String(item.duration_minutes)
                : '',
            videoUrl: item.video_url || '',
            existing_file_type: item.file_type,
            existing_has_file: Boolean(item.file_url),
            existing_video_url: item.video_url || '',
          })),
        )
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setLoadError(normalizeApiError(requestError, 'Unable to load lessons.').message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [courseId, reload])

  function updateRow(key, patch) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows((current) => [...current, emptyRow(nextKeyRef.current++)])
  }

  function removeRow(key) {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  function moveRow(key, direction) {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key)
      const target = index + direction
      if (index === -1 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row)
      return next
    })
  }

  function handleFileChange(key, file) {
    const fileError = validateFile ? validateFile(file) : null
    updateRow(key, {
      file: fileError ? null : file,
      fileError: fileError || null,
    })
  }

  const validateRows = useCallback(() => {
    const validated = rows.map(validateRow)
    setRows(validated)
    return validated.every(
      (row) => !row.titleError && !row.fileError && !row.videoError && !row.durationError,
    )
  }, [rows])

  const save = useCallback(
    async (saveCourseId) => {
      const validated = rows.map(validateRow)
      setRows(validated)
      if (
        validated.some(
          (row) => row.titleError || row.fileError || row.videoError || row.durationError,
        )
      ) {
        return { ok: false }
      }

      setSaving(true)
      try {
        const working = validated.map((row) => ({ ...row }))
        for (const row of working) {
          if (row.id) {
            await updateLesson(saveCourseId, row.id, buildLessonFormData(row))
          } else {
            const created = await createLesson(saveCourseId, buildLessonFormData(row))
            row.id = created.id
          }
        }

        const originalIds = originalIdsRef.current
        const removedIds = originalIds.filter((id) => !working.some((row) => row.id === id))
        for (const id of removedIds) {
          await deleteLesson(saveCourseId, id)
        }

        const orderedIds = working.map((row) => row.id)
        const orderChanged = orderedIds.some((id, index) => originalIds[index] !== id)
        if (orderChanged && orderedIds.length) {
          await reorderLessons(saveCourseId, orderedIds)
        }

        originalIdsRef.current = orderedIds
        setRows(
          working.map((row) => ({
            ...row,
            file: null,
            existing_has_file: Boolean(row.file || row.existing_has_file),
            existing_file_type:
              !row.file && !row.existing_has_file && row.videoUrl.trim()
                ? 'video'
                : row.existing_file_type,
            existing_video_url: row.videoUrl.trim(),
            titleError: null,
            fileError: null,
            videoError: null,
            durationError: null,
          })),
        )
        return { ok: true }
      } catch (requestError) {
        return {
          ok: false,
          message: normalizeApiError(requestError, 'Saving the lessons failed.').message,
        }
      } finally {
        setSaving(false)
      }
    },
    [rows],
  )

  useImperativeHandle(
    ref,
    () => ({
      save,
      validateRows,
      hasRows: () => rows.length > 0,
      getFirstFile: () => rows.find((row) => row.file)?.file ?? null,
    }),
    [save, validateRows, rows],
  )

  return (
    <div className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          Loading lessons…
        </p>
      ) : null}

      {loadError ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3">
          <p className="text-sm font-medium text-clay">{loadError}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setReload((current) => current + 1)}
            disabled={disabled}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : null}

      {!loading && !loadError && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-paper/60 px-6 py-8 text-center">
          <p className="text-sm text-slate-500">
            No lessons yet. Add your first lesson to get started.
          </p>
        </div>
      ) : null}

      {!loading && !loadError && rows.length > 0 ? (
        <ol className="space-y-4">
          {rows.map((row, index) => {
            const label = contentLabel(row)
            return (
              <li
                key={row.key}
                className="rounded-2xl border border-line bg-paper p-4"
                aria-label={`Lesson ${index + 1}: ${row.title || 'Untitled'}`}
              >
                <div className="mb-4 flex items-center gap-2">
                  <GripVertical className="size-5 shrink-0 text-slate-300" aria-hidden="true" />
                  <Badge variant="neutral">Lesson {index + 1}</Badge>
                  {!row.id ? <Badge variant="neutral">New</Badge> : null}
                  {label ? (
                    <span className="text-xs text-slate-500">{label}</span>
                  ) : null}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveRow(row.key, -1)}
                      disabled={disabled || saving || index === 0}
                      aria-label={`Move lesson ${index + 1} up`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-mist hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                    >
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(row.key, 1)}
                      disabled={disabled || saving || index === rows.length - 1}
                      aria-label={`Move lesson ${index + 1} down`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-mist hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                    >
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={disabled || saving}
                      aria-label={`Remove lesson ${index + 1}`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-clay/10 hover:text-clay disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <Input
                    label="Lesson title"
                    value={row.title}
                    onChange={(event) =>
                      updateRow(row.key, {
                        title: event.target.value,
                        titleError: null,
                      })
                    }
                    error={row.titleError}
                    maxLength={200}
                    disabled={disabled || saving}
                    required
                  />
                  <Input
                    label="Duration (min)"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={row.duration}
                    onChange={(event) =>
                      updateRow(row.key, {
                        duration: event.target.value,
                        durationError: null,
                      })
                    }
                    error={row.durationError}
                    hint="Optional."
                    disabled={disabled || saving}
                  />
                </div>

                <div className="mt-4">
                  <Textarea
                    label="Lesson description"
                    rows={2}
                    value={row.description}
                    onChange={(event) => updateRow(row.key, { description: event.target.value })}
                    hint="Optional. Shown at the top of the lesson player."
                    disabled={disabled || saving}
                  />
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-ink">
                    Lesson content
                    <span className="ml-1 text-clay" aria-hidden="true">
                      *
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Upload a file, add a YouTube or Vimeo link, or combine both.
                  </p>

                  {row.file ? (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
                      <FileText className="size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                        {row.file.name} · {formatBytes(row.file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateRow(row.key, { file: null, fileError: null })}
                        disabled={disabled || saving}
                        aria-label={`Remove file from lesson ${index + 1}`}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-clay/10 hover:text-clay disabled:pointer-events-none disabled:opacity-40"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}

                  <label
                    className={`mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand-strong ${
                      disabled || saving ? 'pointer-events-none opacity-50' : ''
                    }`}
                  >
                    <UploadCloud className="size-4" aria-hidden="true" />
                    {row.file || row.existing_has_file ? 'Replace file' : 'Choose file'}
                    <input
                      type="file"
                      accept={accept}
                      className="sr-only"
                      disabled={disabled || saving}
                      onChange={(event) => {
                        const [file] = event.target.files
                        event.target.value = ''
                        if (file) handleFileChange(row.key, file)
                      }}
                    />
                  </label>

                  {row.fileError ? (
                    <p role="alert" className="mt-1 text-xs font-medium text-clay">
                      {row.fileError}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <Input
                      label="Video link"
                      type="url"
                      value={row.videoUrl}
                      onChange={(event) =>
                        updateRow(row.key, {
                          videoUrl: event.target.value,
                          videoError: null,
                          fileError: null,
                        })
                      }
                      error={row.videoError}
                      hint="YouTube or Vimeo. Optional when a file is uploaded."
                      placeholder="https://www.youtube.com/watch?v=…"
                      disabled={disabled || saving}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      {!loading && !loadError ? (
        <Button
          type="button"
          variant="secondary"
          onClick={addRow}
          disabled={disabled || saving}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add lesson
        </Button>
      ) : null}

      {saving ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          Saving lessons…
        </p>
      ) : null}
    </div>
  )
})

export default LessonsEditor
