import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { createSummary, fetchSummary, updateSummary } from '../../api/summaries'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { useCourseOptions } from '../../hooks/useCourseOptions'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { validateSummary } from '../../lib/summaries'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/assessments/BackLink'

const EMPTY = { course: '', title: '', content: '', key_concepts: [] }

export default function SummaryFormPage() {
  const { summaryId } = useParams()
  const isEdit = Boolean(summaryId)
  useDocumentTitle(isEdit ? 'Edit summary' : 'New summary')
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { courses } = useCourseOptions()

  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEdit) return undefined
    const controller = new AbortController()
    fetchSummary(summaryId, { signal: controller.signal })
      .then((summary) => {
        setValues({
          course: String(summary.course),
          title: summary.title,
          content: summary.content,
          key_concepts: summary.key_concepts,
        })
        setLoading(false)
      })
      .catch((requestError) => {
        if (!isCanceled(requestError)) setLoadError(normalizeApiError(requestError, 'This summary could not be loaded.'))
      })
    return () => controller.abort()
  }, [isEdit, summaryId])

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function setConcept(index, name, value) {
    setField(
      'key_concepts',
      values.key_concepts.map((concept, position) => (position === index ? { ...concept, [name]: value } : concept)),
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const found = validateSummary(values)
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    const payload = { ...values, course: Number(values.course) }
    try {
      const saved = isEdit ? await updateSummary(summaryId, payload) : await createSummary(payload)
      addToast({ type: 'success', message: isEdit ? 'Summary updated.' : 'Summary created.' })
      navigate(`/summaries/${saved.id}`)
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'The summary could not be saved.')
      const fieldErrors = {}
      for (const name of ['course', 'title', 'content', 'key_concepts']) {
        const message = firstFieldError(normalized.fields, name)
        if (message) fieldErrors[name] = message
      }
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) addToast({ type: 'error', message: normalized.message })
      setSaving(false)
    }
  }

  if (loadError) {
    return <EmptyState icon={AlertTriangle} title="Summary unavailable" description={loadError.message} action={<LinkButton to="/summaries">Back</LinkButton>} />
  }
  if (loading) return <PageLoader label="Loading the summary…" />

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink to={isEdit ? `/summaries/${summaryId}` : '/summaries'} label={isEdit ? 'Back to the summary' : 'Back to summaries'} />
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{isEdit ? 'Edit the summary' : 'New summary'}</h1>

      <form noValidate onSubmit={handleSubmit} className="space-y-6">
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
          <Textarea
            label="Summary"
            required
            rows={14}
            value={values.content}
            error={errors.content}
            hint='Start a line with "## " for a section title and with "- " for a bullet point.'
            onChange={(event) => setField('content', event.target.value)}
          />
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Key concepts</h2>
              <p className="text-sm text-slate-600">The important notions of the course, with a short definition.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setField('key_concepts', [...values.key_concepts, { term: '', definition: '' }])}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>

          {values.key_concepts.map((concept, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <Input label={`Term ${index + 1}`} maxLength={120} value={concept.term} onChange={(event) => setConcept(index, 'term', event.target.value)} />
              <Input label="Definition" maxLength={600} value={concept.definition} onChange={(event) => setConcept(index, 'definition', event.target.value)} />
              <Button
                variant="ghost"
                onClick={() => setField('key_concepts', values.key_concepts.filter((_, position) => position !== index))}
                aria-label={`Remove concept ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {errors.key_concepts ? (
            <p role="alert" className="text-sm font-medium text-clay">
              {errors.key_concepts}
            </p>
          ) : null}
        </Card>

        <div className="flex justify-end gap-2">
          <LinkButton to={isEdit ? `/summaries/${summaryId}` : '/summaries'} variant="secondary">
            Cancel
          </LinkButton>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Create the summary'}
          </Button>
        </div>
      </form>
    </div>
  )
}
