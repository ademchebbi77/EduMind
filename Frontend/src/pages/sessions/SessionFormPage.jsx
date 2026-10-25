import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, FileQuestion, RotateCcw } from 'lucide-react'
import { createSession, fetchSession, updateSession } from '../../api/sessions'
import { fetchUsers } from '../../api/users'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'

export default function SessionFormPage() {
  const { sessionId } = useParams()
  const isEdit = Boolean(sessionId)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  useDocumentTitle(isEdit ? 'Modifier la session' : 'Nouvelle session')

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'

  const [reload, setReload]       = useState(0)
  const [fetchResult, setFetchResult] = useState({ key: null, session: null, error: null })
  const [teachers, setTeachers]   = useState([])

  const [values, setValues] = useState({
    title: '',
    description: '',
    session_type: isTeacher ? 'course' : 'training',
    status: 'scheduled',
    meeting_link: '',
    starts_at: '',
    ends_at: '',
    assigned_teachers: [],
  })
  const [errors, setErrors]     = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving]     = useState(false)

  const requestKey = `${sessionId ?? 'new'}:${reload}`

  // Charger les teachers pour l'admin (sessions de type formation)
  useEffect(() => {
    if (!isAdmin) return
    fetchUsers({ role: 'teacher' })
      .then((data) => setTeachers(data.results || []))
      .catch(() => {})
  }, [isAdmin])

  // Charger la session en mode édition
  useEffect(() => {
    if (!isEdit) return undefined
    const controller = new AbortController()
    fetchSession(sessionId, { signal: controller.signal })
      .then((payload) => {
        setFetchResult({ key: requestKey, session: payload, error: null })
        setValues({
          title:              payload.title,
          description:        payload.description || '',
          session_type:       payload.session_type,
          status:             payload.status,
          meeting_link:       payload.meeting_link || '',
          starts_at:          toLocalDateTimeInput(payload.starts_at),
          ends_at:            toLocalDateTimeInput(payload.ends_at),
          assigned_teachers:  payload.assigned_teachers || [],
        })
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setFetchResult({ key: requestKey, session: null, error: normalizeApiError(err) })
      })
    return () => controller.abort()
  }, [isEdit, sessionId, requestKey])

  function toLocalDateTimeInput(isoString) {
    if (!isoString) return ''
    const date = new Date(isoString)
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function updateField(name, value) {
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  function toggleTeacher(id) {
    setValues((v) => ({
      ...v,
      assigned_teachers: v.assigned_teachers.includes(id)
        ? v.assigned_teachers.filter((t) => t !== id)
        : [...v.assigned_teachers, id],
    }))
  }

  function validate() {
    const e = {}
    if (!values.title.trim())      e.title      = 'Le titre est requis.'
    if (!values.starts_at)         e.starts_at  = 'La date de début est requise.'
    if (!values.ends_at)           e.ends_at    = 'La date de fin est requise.'
    if (values.starts_at && values.ends_at && values.ends_at <= values.starts_at)
      e.ends_at = 'La fin doit être après le début.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSaving(true)
    const payload = {
      title:             values.title.trim(),
      description:       values.description.trim(),
      session_type:      values.session_type,
      status:            values.status,
      meeting_link:      values.meeting_link.trim(),
      starts_at:         new Date(values.starts_at).toISOString(),
      ends_at:           new Date(values.ends_at).toISOString(),
      assigned_teachers: values.assigned_teachers,
    }

    try {
      const saved = isEdit
        ? await updateSession(sessionId, payload)
        : await createSession(payload)

      addToast({
        type: 'success',
        message: isEdit ? `Session "${saved.title}" mise à jour.` : `Session "${saved.title}" créée.`,
      })
      navigate(`/sessions/${saved.id}`, { replace: isEdit })
    } catch (err) {
      const error = normalizeApiError(err, 'Enregistrement échoué.')
      const fieldErrs = {
        title:       firstFieldError(error.fields, 'title'),
        starts_at:   firstFieldError(error.fields, 'starts_at'),
        ends_at:     firstFieldError(error.fields, 'ends_at'),
        meeting_link: firstFieldError(error.fields, 'meeting_link'),
        session_type: firstFieldError(error.fields, 'session_type'),
      }
      setErrors(fieldErrs)
      if (!Object.values(fieldErrs).some(Boolean)) {
        setFormError(
          firstFieldError(error.fields, 'non_field_errors') || error.message || 'Enregistrement échoué.'
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const loadingSession = isEdit && fetchResult.key !== requestKey
  const loadError = loadingSession ? null : fetchResult.error

  if (loadingSession) return <PageLoader label="Chargement de la session…" />

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link to="/sessions" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-strong">
          <ArrowLeft className="size-4" /> Retour aux sessions
        </Link>
        <div role="alert">
          <EmptyState
            icon={FileQuestion}
            title="Session introuvable"
            description={loadError.message}
            action={
              <Button variant="secondary" onClick={() => setReload((c) => c + 1)}>
                <RotateCcw className="size-4" /> Réessayer
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/sessions" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-strong">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour aux sessions
      </Link>

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          {isEdit ? 'Modifier' : 'Nouvelle session'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          {isEdit ? 'Modifier la session' : 'Créer une session en ligne'}
        </h1>
      </header>

      {formError && (
        <div role="alert" className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="space-y-5">
              <h2 className="text-xl font-semibold text-ink">Informations générales</h2>

              <Input
                label="Titre de la session"
                name="title"
                value={values.title}
                onChange={(e) => updateField('title', e.target.value)}
                error={errors.title}
                maxLength={200}
                disabled={saving}
                required
              />

              <Textarea
                label="Description"
                name="description"
                rows={4}
                value={values.description}
                onChange={(e) => updateField('description', e.target.value)}
                disabled={saving}
              />

              {/* Type : teacher ne peut choisir que "course" */}
              {isAdmin && (
                <Select
                  label="Type de session"
                  name="session_type"
                  value={values.session_type}
                  onChange={(e) => updateField('session_type', e.target.value)}
                  error={errors.session_type}
                  disabled={saving}
                >
                  <option value="course">Cours en ligne</option>
                  <option value="training">Formation</option>
                </Select>
              )}

              <Input
                label="Lien de réunion"
                name="meeting_link"
                type="url"
                placeholder="https://meet.google.com/..."
                value={values.meeting_link}
                onChange={(e) => updateField('meeting_link', e.target.value)}
                error={errors.meeting_link}
                hint="Zoom, Google Meet, Microsoft Teams, etc."
                disabled={saving}
              />
            </Card>

            <Card className="space-y-5">
              <h2 className="text-xl font-semibold text-ink">
                <CalendarDays className="mr-2 inline size-5 text-brand-strong" aria-hidden="true" />
                Date et heure
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Début"
                  name="starts_at"
                  type="datetime-local"
                  value={values.starts_at}
                  onChange={(e) => updateField('starts_at', e.target.value)}
                  error={errors.starts_at}
                  disabled={saving}
                  required
                />
                <Input
                  label="Fin"
                  name="ends_at"
                  type="datetime-local"
                  value={values.ends_at}
                  onChange={(e) => updateField('ends_at', e.target.value)}
                  error={errors.ends_at}
                  disabled={saving}
                  required
                />
              </div>
            </Card>

            {/* Teachers assignés (formations admin uniquement) */}
            {isAdmin && values.session_type === 'training' && teachers.length > 0 && (
              <Card className="space-y-4">
                <h2 className="text-xl font-semibold text-ink">Enseignants assignés</h2>
                <p className="text-sm text-slate-600">
                  Sélectionnez les enseignants qui animeront cette formation. La session apparaîtra dans leur calendrier.
                </p>
                <div className="space-y-2">
                  {teachers.map((teacher) => (
                    <label key={teacher.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-mist">
                      <input
                        type="checkbox"
                        checked={values.assigned_teachers.includes(teacher.id)}
                        onChange={() => toggleTeacher(teacher.id)}
                        className="size-4 rounded accent-brand"
                        disabled={saving}
                      />
                      <span className="text-sm text-ink">
                        {teacher.full_name}
                        <span className="ml-1.5 text-xs text-slate-500">{teacher.email}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {isAdmin && (
              <Card>
                <h2 className="text-xl font-semibold text-ink">Statut</h2>
                <div className="mt-4">
                  <Select
                    label="Statut de la session"
                    name="status"
                    value={values.status}
                    onChange={(e) => updateField('status', e.target.value)}
                    disabled={saving}
                  >
                    <option value="scheduled">Planifiée</option>
                    <option value="ongoing">En cours</option>
                    <option value="ended">Terminée</option>
                    <option value="cancelled">Annulée</option>
                  </Select>
                </div>
              </Card>
            )}

            <Card className="bg-gradient-to-b from-white to-brand/[0.04]">
              <h2 className="text-xl font-semibold text-ink">Enregistrer</h2>
              <div className="mt-5 space-y-3">
                <Button type="submit" loading={saving} className="w-full">
                  {saving ? 'Enregistrement…' : isEdit ? 'Sauvegarder' : 'Créer la session'}
                </Button>
                <LinkButton to="/sessions" variant="secondary" className="w-full">
                  Annuler
                </LinkButton>
              </div>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  )
}
