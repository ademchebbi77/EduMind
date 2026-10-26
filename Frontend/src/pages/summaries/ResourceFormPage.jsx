import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { createResource, fetchResource, updateResource } from '../../api/summaries'
import { useToast } from '../../context/ToastContext'
import { cx } from '../../lib/cx'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { useCourseOptions } from '../../hooks/useCourseOptions'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { validateResource } from '../../lib/summaries'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/assessments/BackLink'

const EMPTY = { course: '', title: '', description: '', kind: 'link', url: '' }
const KINDS = [
  { value: 'link', label: 'Web link' },
  { value: 'file', label: 'File (PDF, audio, video)' },
]

export default function ResourceFormPage() {
  const { resourceId } = useParams()
  const isEdit = Boolean(resourceId)
  useDocumentTitle(isEdit ? 'Edit resource' : 'New resource')
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { courses } = useCourseOptions()

  const [values, setValues] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [currentFile, setCurrentFile] = useState('') // name of the file already stored
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEdit) return undefined
    const controller = new AbortController()
    fetchResource(resourceId, { signal: controller.signal })
      .then((resource) => {
        setValues({
          course: String(resource.course),
          title: resource.title,
          description: resource.description,
          kind: resource.kind,
          url: resource.url,
        })
        setCurrentFile(resource.file_name)
        setLoading(false)
      })
      .catch((requestError) => {
        if (!isCanceled(requestError)) setLoadError(normalizeApiError(requestError, 'This resource could not be loaded.'))
      })
    return () => controller.abort()
  }, [isEdit, resourceId])

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const found = validateResource(values, { file, hasFile: Boolean(currentFile) })
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    try {
      if (isEdit) await updateResource(resourceId, values, file)
      else await createResource(values, file)
      addToast({ type: 'success', message: isEdit ? 'Resource updated.' : 'Resource added.' })
      navigate('/summaries?tab=resources')
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'The resource could not be saved.')
      const fieldErrors = {}
      for (const name of ['course', 'title', 'description', 'url', 'file']) {
        const message = firstFieldError(normalized.fields, name)
        if (message) fieldErrors[name] = message
      }
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) addToast({ type: 'error', message: normalized.message })
      setSaving(false)
    }
  }

  if (loadError) {
    return <EmptyState icon={AlertTriangle} title="Resource unavailable" description={loadError.message} action={<LinkButton to="/summaries?tab=resources">Back</LinkButton>} />
  }
  if (loading) return <PageLoader label="Loading the resource…" />

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink to="/summaries?tab=resources" label="Back to resources" />
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{isEdit ? 'Edit the resource' : 'New resource'}</h1>

      <form noValidate onSubmit={handleSubmit}>
        <Card className="space-y-5">
          <Select label="Course" required value={values.course} error={errors.course} onChange={(event) => setField('course', event.target.value)}>
            <option value="">Choose a course</option>
            {courses.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.title}
              </option>
            ))}
          </Select>
          <Input label="Title" required maxLength={200} value={values.title} error={errors.title} onChange={(event) => setField('title', event.target.value)} />
          <Textarea label="Description" rows={3} value={values.description} error={errors.description} onChange={(event) => setField('description', event.target.value)} />

          <fieldset>
            <legend className="text-sm font-medium text-ink">Type</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {KINDS.map((kind) => (
                <label
                  key={kind.value}
                  className={cx(
                    'cursor-pointer rounded-xl border px-4 py-2 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand',
                    values.kind === kind.value ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink-soft hover:border-slate-300',
                  )}
                >
                  <input type="radio" name="kind" value={kind.value} checked={values.kind === kind.value} onChange={() => setField('kind', kind.value)} className="sr-only" />
                  {kind.label}
                </label>
              ))}
            </div>
          </fieldset>

          {values.kind === 'link' ? (
            <Input label="Web address" type="url" required placeholder="https://…" value={values.url} error={errors.url} onChange={(event) => setField('url', event.target.value)} />
          ) : (
            <Input
              label="File"
              type="file"
              required={!currentFile}
              accept=".pdf,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.avi"
              error={errors.file}
              hint={currentFile ? `Current file: ${currentFile}. Choose another one to replace it.` : 'PDF, audio or video.'}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="py-2"
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <LinkButton to="/summaries?tab=resources" variant="secondary">
              Cancel
            </LinkButton>
            <Button type="submit" loading={saving}>
              {isEdit ? 'Save changes' : 'Add the resource'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
