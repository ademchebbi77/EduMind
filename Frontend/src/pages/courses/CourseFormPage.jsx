import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  FileQuestion,
  Lock,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import {
  createCourse,
  fetchCategories,
  fetchCourse,
  updateCourse,
  updateCourseFields,
} from '../../api/courses'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { canEditCourse, canManageCourses } from '../../lib/roles'
import { fileExtension } from '../../lib/format'
import { useAppConfig } from '../../hooks/useAppConfig'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'
import { AccessDenied } from '../../components/courses/AccessDenied'
import { FileDropzone } from '../../components/courses/FileDropzone'
import { FilePreview } from '../../components/courses/FilePreview'
import { TagInput } from '../../components/courses/TagInput'
import { ThumbnailUpload } from '../../components/courses/ThumbnailUpload'

const FALLBACK_THUMBNAIL_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp']
const FALLBACK_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024
const VIDEO_URL_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com']

function validateSelectedFile(file, config) {
  if (!config) return 'Upload rules are not available yet.'

  const extension = fileExtension(file.name)
  const formats = config.allowed_extensions.map((value) => value.toUpperCase()).join(', ')

  if (!config.allowed_extensions.includes(extension)) {
    return `Unsupported format. Choose a file: ${formats}.`
  }
  if (file.size <= 0) return 'This file is empty.'

  const isVideo = (config.video_extensions || ['mp4', 'webm', 'avi']).includes(extension)
  const maxBytes = isVideo
    ? config.max_video_upload_size_bytes ?? config.max_upload_size_bytes
    : config.max_upload_size_bytes
  const maxMb = isVideo
    ? config.max_video_upload_size_mb ?? config.max_upload_size_mb
    : config.max_upload_size_mb

  if (file.size > maxBytes) {
    return `The file exceeds the maximum size of ${maxMb} MB.`
  }
  return null
}

function validateThumbnailFile(file, config) {
  const extensions =
    config?.thumbnail_extensions?.length
      ? config.thumbnail_extensions
      : FALLBACK_THUMBNAIL_EXTENSIONS
  const maxBytes = config?.thumbnail_max_size_bytes ?? FALLBACK_THUMBNAIL_MAX_BYTES
  const maxMb = config?.thumbnail_max_size_mb ?? 2
  const formats = extensions.map((value) => value.toUpperCase()).join(', ')

  if (file.size <= 0) return 'This image is empty.'
  if (!extensions.includes(fileExtension(file.name))) {
    return `Unsupported image format. Choose a file: ${formats}.`
  }
  if (file.size > maxBytes) {
    return `The thumbnail exceeds the maximum size of ${maxMb} MB.`
  }
  return null
}

function validateVideoUrl(value) {
  const trimmed = value.trim()
  if (!trimmed) return null

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'Enter a valid YouTube or Vimeo URL.'
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Enter a valid YouTube or Vimeo URL.'
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const supported = VIDEO_URL_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  )

  return supported ? null : 'Only YouTube and Vimeo links are supported.'
}

function fieldErrors(fields) {
  return {
    title: firstFieldError(fields, 'title'),
    description: firstFieldError(fields, 'description'),
    category: firstFieldError(fields, 'category'),
    tags: firstFieldError(fields, 'tags'),
    thumbnail: firstFieldError(fields, 'thumbnail'),
    file: firstFieldError(fields, 'file'),
    video_url: firstFieldError(fields, 'video_url'),
    max_students: firstFieldError(fields, 'max_students'),
  }
}

const EMPTY_VALUES = {
  title: '',
  description: '',
  category: '',
  tags: [],
  videoUrl: '',
  maxStudents: '',
}

export default function CourseFormPage() {
  const { courseId } = useParams()
  const isEdit = Boolean(courseId)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const { config, loading: configLoading, error: configError, retry: retryConfig } = useAppConfig()

  useDocumentTitle(isEdit ? 'Edit a course' : 'Publish a course')

  const [reload, setReload] = useState(0)
  const [fetchResult, setFetchResult] = useState({ key: null, course: null, error: null })

  const [values, setValues] = useState(EMPTY_VALUES)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const previewUrlRef = useRef(null)

  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState(null)
  const [removeThumbnail, setRemoveThumbnail] = useState(false)

  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState('')

  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(null)

  const requestKey = `${courseId ?? 'new'}:${reload}`

  useEffect(() => {
    const controller = new AbortController()

    fetchCategories({ ordering: 'name', pageSize: 50 }, { signal: controller.signal })
      .then((payload) => {
        setCategories(Array.isArray(payload) ? payload : payload.results ?? [])
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setCategoriesError(
          normalizeApiError(requestError, 'Unable to load categories.').message,
        )
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!isEdit) return undefined

    const controller = new AbortController()

    fetchCourse(courseId, { signal: controller.signal })
      .then((payload) => {
        setFetchResult({ key: requestKey, course: payload, error: null })
        setValues({
          title: payload.title,
          description: payload.description || '',
          category: payload.category ? String(payload.category) : '',
          tags: Array.isArray(payload.tags) ? payload.tags : [],
          videoUrl: payload.video_url || '',
          maxStudents:
            payload.max_students !== null && payload.max_students !== undefined
              ? String(payload.max_students)
              : '',
        })
        setExistingThumbnailUrl(payload.thumbnail_url || null)
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setFetchResult({
          key: requestKey,
          course: null,
          error: normalizeApiError(requestError, 'Unable to load this course.'),
        })
      })

    return () => controller.abort()
  }, [isEdit, courseId, requestKey])

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  const loadingCourse = isEdit && fetchResult.key !== requestKey
  const course = loadingCourse ? null : fetchResult.course
  const loadError = loadingCourse ? null : fetchResult.error

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function updatePreview(file) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = file ? URL.createObjectURL(file) : null
    setPreviewUrl(previewUrlRef.current)
  }

  function handleFileSelect(file) {
    const fileError = validateSelectedFile(file, config)
    if (fileError) {
      setSelectedFile(null)
      updatePreview(null)
      setErrors((current) => ({ ...current, file: fileError }))
      return
    }
    setSelectedFile(file)
    updatePreview(file)
    setErrors((current) => ({ ...current, file: undefined }))
  }

  function removeSelectedFile() {
    setSelectedFile(null)
    updatePreview(null)
  }

  function handleThumbnailSelect(file) {
    const thumbnailError = validateThumbnailFile(file, config)
    if (thumbnailError) {
      setThumbnailFile(null)
      setErrors((current) => ({ ...current, thumbnail: thumbnailError }))
      return
    }
    setThumbnailFile(file)
    setRemoveThumbnail(false)
    setErrors((current) => ({ ...current, thumbnail: undefined }))
  }

  function handleThumbnailRemove() {
    setThumbnailFile(null)
    setRemoveThumbnail(true)
    setErrors((current) => ({ ...current, thumbnail: undefined }))
  }

  function validateForm() {
    const nextErrors = {}

    if (!values.title.trim()) {
      nextErrors.title = 'Enter the course title.'
    } else if (values.title.trim().length > 200) {
      nextErrors.title = 'The title cannot exceed 200 characters.'
    }

    if (!isEdit && !selectedFile && !values.videoUrl.trim()) {
      nextErrors.file = 'Select a file or provide a video link.'
    } else if (selectedFile) {
      const fileError = validateSelectedFile(selectedFile, config)
      if (fileError) nextErrors.file = fileError
    }

    const videoUrlError = validateVideoUrl(values.videoUrl)
    if (videoUrlError) nextErrors.video_url = videoUrlError

    const joinedTags = values.tags.join(',')
    if (values.tags.some((tag) => tag.length > 50)) {
      nextErrors.tags = 'Each tag must be at most 50 characters.'
    } else if (joinedTags.length > 500) {
      nextErrors.tags = 'Tags cannot exceed 500 characters in total.'
    }

    if (values.maxStudents !== '') {
      const maxStudents = Number(values.maxStudents)
      if (!Number.isInteger(maxStudents) || maxStudents < 1) {
        nextErrors.max_students = 'Enter a whole number of at least 1.'
      }
    }

    if (thumbnailFile) {
      const thumbnailError = validateThumbnailFile(thumbnailFile, config)
      if (thumbnailError) nextErrors.thumbnail = thumbnailError
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (!validateForm()) return

    const formData = new FormData()
    formData.append('title', values.title.trim())
    formData.append('description', values.description.trim())
    formData.append('video_url', values.videoUrl.trim())
    formData.append('tags', values.tags.join(', '))
    if (values.category) formData.append('category', values.category)
    if (values.maxStudents !== '') {
      formData.append('max_students', String(Number(values.maxStudents)))
    }
    if (selectedFile) formData.append('file', selectedFile)
    if (thumbnailFile) formData.append('thumbnail', thumbnailFile)

    const clearFields = {}
    if (isEdit) {
      if (!values.category && course?.category) clearFields.category = null
      if (removeThumbnail && !thumbnailFile) clearFields.thumbnail = null
      if (
        values.maxStudents === '' &&
        course?.max_students !== null &&
        course?.max_students !== undefined
      ) {
        clearFields.max_students = null
      }
    }

    setSaving(true)
    setProgress(0)

    function handleUploadProgress(uploadEvent) {
      if (!uploadEvent.total) return
      setProgress(Math.min(100, Math.round((uploadEvent.loaded / uploadEvent.total) * 100)))
    }

    try {
      let saved = isEdit
        ? await updateCourse(courseId, formData, { onUploadProgress: handleUploadProgress })
        : await createCourse(formData, { onUploadProgress: handleUploadProgress })

      if (isEdit && Object.keys(clearFields).length) {
        saved = await updateCourseFields(courseId, clearFields)
      }

      addToast({
        type: 'success',
        message: isEdit
          ? `Course “${saved.title}” has been updated.`
          : `Course “${saved.title}” has been published.`,
      })
      navigate(`/courses/${saved.id}`, { replace: isEdit })
    } catch (submitError) {
      const error = normalizeApiError(submitError, 'Saving the course failed.')
      const nextFieldErrors = fieldErrors(error.fields)
      setErrors(nextFieldErrors)
      if (!Object.values(nextFieldErrors).some(Boolean)) {
        setFormError(
          firstFieldError(error.fields, 'non_field_errors') ||
            error.message ||
            'Saving the course failed.',
        )
      }
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  if (isEdit && loadingCourse) {
    return <PageLoader label="Loading course…" />
  }

  if (isEdit && loadError) {
    return (
      <div className="space-y-6">
        <Link
          to="/courses"
          className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to catalogue
        </Link>
        {loadError.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Course not found"
            description="This course does not exist or has been deleted."
            action={<LinkButton to="/courses">View catalogue</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to load the course"
              description={loadError.message}
              action={
                <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
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

  if (!canManageCourses(user?.role) || (isEdit && !canEditCourse(user, course))) {
    return <AccessDenied />
  }

  if (configLoading) {
    return <PageLoader label="Preparing the form…" />
  }

  if (configError) {
    return (
      <div role="alert">
        <EmptyState
          icon={FileQuestion}
          title="Upload rules unavailable"
          description={configError.message}
          action={
            <Button variant="secondary" onClick={retryConfig}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  const cancelTarget = isEdit ? `/courses/${courseId}` : '/courses'
  const accept = config.allowed_extensions.map((extension) => `.${extension}`).join(',')
  const formats = config.allowed_extensions.map((extension) => extension.toUpperCase())
  const videoExtensions = config.video_extensions || ['mp4', 'webm', 'avi']
  const thumbnailExtensions =
    config.thumbnail_extensions?.length
      ? config.thumbnail_extensions
      : FALLBACK_THUMBNAIL_EXTENSIONS
  const thumbnailHint = `${thumbnailExtensions
    .map((value) => value.toUpperCase())
    .join(', ')} · max ${config.thumbnail_max_size_mb ?? 2} MB.`

  const selectedExtension = selectedFile ? fileExtension(selectedFile.name) : ''
  const selectedKind = selectedFile
    ? videoExtensions.includes(selectedExtension)
      ? 'video'
      : selectedExtension === 'pdf'
        ? 'pdf'
        : 'audio'
    : null

  const showExistingFile =
    isEdit &&
    course &&
    !selectedFile &&
    (course.has_file ??
      (course.type !== 'video' || !course.video_url))

  return (
    <div className="space-y-6">
      <Link
        to={cancelTarget}
        className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {isEdit ? 'Back to course' : 'Back to catalogue'}
      </Link>

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          {isEdit ? 'Update' : 'New resource'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {isEdit ? 'Edit course' : 'Publish a course'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          {isEdit
            ? 'Adjust the course details or replace its material. Students will see the update immediately.'
            : 'Add a PDF, audio or video resource to the catalogue. The course format is detected automatically.'}
        </p>
      </header>

      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
        >
          {formError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="space-y-5">
              <h2 className="text-xl font-semibold text-ink">Course details</h2>

              <Input
                label="Course title"
                name="title"
                value={values.title}
                onChange={(event) => updateField('title', event.target.value)}
                error={errors.title}
                hint="A clear title helps students find the resource."
                maxLength={200}
                disabled={saving}
                required
              />

              <Textarea
                label="Description"
                name="description"
                rows={6}
                value={values.description}
                onChange={(event) => updateField('description', event.target.value)}
                error={errors.description}
                hint="Optional. Summarise the content and learning objectives."
                disabled={saving}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Select
                  label="Category"
                  name="category"
                  value={values.category}
                  onChange={(event) => updateField('category', event.target.value)}
                  error={errors.category}
                  hint={categoriesError || 'Optional. Help students browse the catalogue.'}
                  disabled={saving}
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.name}
                    </option>
                  ))}
                </Select>

                <Input
                  label="Maximum students"
                  name="max_students"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={values.maxStudents}
                  onChange={(event) => updateField('maxStudents', event.target.value)}
                  error={errors.max_students}
                  hint="Optional. Leave empty for unlimited places."
                  disabled={saving}
                />
              </div>

              <TagInput
                label="Tags"
                value={values.tags}
                onChange={(tags) => updateField('tags', tags)}
                error={errors.tags}
                hint="Press Enter or comma to add a tag. Duplicates are ignored."
                disabled={saving}
              />
            </Card>

            <Card className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Course material</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Add a file, a YouTube or Vimeo link, or both. The course type follows the
                  uploaded file when one is provided.
                </p>
              </div>

              {showExistingFile ? (
                <FilePreview
                  fileName="Current material"
                  kind={course.type}
                  url={course.file_url}
                  existing
                  subtitle={`${course.type_display || course.type} file online`}
                />
              ) : null}

              {selectedFile ? (
                <FilePreview
                  fileName={selectedFile.name}
                  fileSize={selectedFile.size}
                  kind={selectedKind}
                  url={previewUrl}
                  onRemove={removeSelectedFile}
                />
              ) : null}

              <FileDropzone
                onFileSelect={handleFileSelect}
                accept={accept}
                formats={formats}
                maxSizeMb={config.max_video_upload_size_mb ?? config.max_upload_size_mb}
                disabled={saving}
                error={errors.file}
              />

              {isEdit && selectedFile ? (
                <p className="text-xs text-slate-500">
                  This file will replace the current material when you save.
                </p>
              ) : null}

              <Input
                label="Video link"
                name="video_url"
                type="url"
                value={values.videoUrl}
                onChange={(event) => updateField('videoUrl', event.target.value)}
                error={errors.video_url}
                hint="YouTube or Vimeo URL. You can combine it with an uploaded file."
                placeholder="https://www.youtube.com/watch?v=…"
                disabled={saving}
              />
            </Card>

            <Card className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Thumbnail</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Optional cover image shown in the catalogue and on the course page.
                </p>
              </div>

              <ThumbnailUpload
                file={thumbnailFile}
                existingUrl={removeThumbnail ? null : existingThumbnailUrl}
                onSelect={handleThumbnailSelect}
                onRemove={handleThumbnailRemove}
                error={errors.thumbnail}
                hint={thumbnailHint}
                disabled={saving}
              />

              {isEdit && removeThumbnail && !thumbnailFile ? (
                <p className="text-xs text-clay">The current thumbnail will be removed on save.</p>
              ) : null}
            </Card>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <h2 className="text-xl font-semibold text-ink">Good to know</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
                  <span>
                    Accepted formats: <strong className="text-ink-soft">{formats.join(', ')}</strong>.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
                  <span>
                    Maximum size:{' '}
                    <strong className="text-ink-soft">{config.max_upload_size_mb} MB</strong> for
                    documents and audio,{' '}
                    <strong className="text-ink-soft">
                      {config.max_video_upload_size_mb ?? config.max_upload_size_mb} MB
                    </strong>{' '}
                    for video.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
                  <span>
                    Thumbnail: <strong className="text-ink-soft">{thumbnailHint}</strong>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                  <span>Files are private and only served to signed-in users.</span>
                </li>
                <li className="flex gap-2.5">
                  <Lock className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden="true" />
                  <span>
                    You can only manage courses you own, unless you are an administrator.
                  </span>
                </li>
              </ul>
            </Card>

            <Card className="bg-gradient-to-b from-white to-brand/[0.04]">
              <h2 className="text-xl font-semibold text-ink">Save</h2>

              {progress !== null ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>Uploading file…</span>
                    <span>{progress} %</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="File upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    className="h-2 overflow-hidden rounded-full bg-slate-200"
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                <Button type="submit" loading={saving} className="w-full">
                  {saving
                    ? `Saving…${progress !== null ? ` ${progress} %` : ''}`
                    : isEdit
                      ? 'Save changes'
                      : 'Publish course'}
                </Button>
                <LinkButton to={cancelTarget} variant="secondary" className="w-full">
                  Cancel
                </LinkButton>
              </div>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  )
}
