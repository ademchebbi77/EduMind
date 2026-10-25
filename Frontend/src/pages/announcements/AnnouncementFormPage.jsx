import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion, RotateCcw } from 'lucide-react'
import { createAnnouncement, fetchAnnouncement, updateAnnouncement } from '../../api/announcements'
import { fetchSessions } from '../../api/sessions'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'

export default function AnnouncementFormPage() {
  const { announcementId } = useParams()
  const isEdit = Boolean(announcementId)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  useDocumentTitle(isEdit ? 'Modifier l\'annonce' : 'Nouvelle annonce')

  const [reload, setReload]     = useState(0)
  const [fetchResult, setFetchResult] = useState({ key: null, announcement: null, error: null })
  const [sessions, setSessions] = useState([])

  const [values, setValues] = useState({
    title: '',
    content: '',
    target_audience: 'all',
    related_session: '',
    is_pinned: false,
  })
  const [errors, setErrors]     = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving]     = useState(false)

  const requestKey = `${announcementId ?? 'new'}:${reload}`

  // Charger les sessions pour lier une annonce
  useEffect(() => {
    fetchSessions({ ordering: 'starts_at' }, {})
      .then((data) => setSessions(data.results || []))
      .catch(() => {})
  }, [])

  // Charger l'annonce en mode édition
  useEffect(() => {
    if (!isEdit) return undefined
    const controller = new AbortController()
    fetchAnnouncement(announcementId, { signal: controller.signal })
      .then((payload) => {
        setFetchResult({ key: requestKey, announcement: payload, error: null })
        setValues({
          title:            payload.title,
          content:          payload.content,
          target_audience:  payload.target_audience,
          related_session:  payload.related_session || '',
          is_pinned:        payload.is_pinned,
        })
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setFetchResult({ key: requestKey, announcement: null, error: normalizeApiError(err) })
      })
    return () => controller.abort()
  }, [isEdit, announcementId, requestKey])

  function updateField(name, value) {
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  function validate() {
    const e = {}
    if (!values.title.trim())   e.title   = 'Le titre est requis.'
    if (!values.content.trim()) e.content = 'Le contenu est requis.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSaving(true)
    const payload = {
      title:           values.title.trim(),
      content:         values.content.trim(),
      target_audience: values.target_audience,
      related_session: values.related_session || null,
      is_pinned:       values.is_pinned,
    }

    try {
      const saved = isEdit
        ? await updateAnnouncement(announcementId, payload)
        : await createAnnouncement(payload)

      addToast({
        type: 'success',
        message: isEdit ? `Annonce "${saved.title}" mise à jour.` : `Annonce "${saved.title}" publiée.`,
      })
      navigate('/announcements', { replace: isEdit })
    } catch (err) {
      const error = normalizeApiError(err, 'Enregistrement échoué.')
      const fieldErrs = {
        title:   firstFieldError(error.fields, 'title'),
        content: firstFieldError(error.fields, 'content'),
      }
      setErrors(fieldErrs)
      if (!Object.values(fieldErrs).some(Boolean)) {
        setFormError(firstFieldError(error.fields, 'non_field_errors') || error.message || 'Enregistrement échoué.')
      }
    } finally {
      setSaving(false)
    }
  }

  const loadingAnn = isEdit && fetchResult.key !== requestKey
  const loadError  = loadingAnn ? null : fetchResult.error

  if (loadingAnn) return <PageLoader label="Chargement de l'annonce…" />

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link to="/announcements" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-strong">
          <ArrowLeft className="size-4" /> Retour aux annonces
        </Link>
        <div role="alert">
          <EmptyState icon={FileQuestion} title="Annonce introuvable" description={loadError.message}
            action={<Button variant="secondary" onClick={() => setReload((c) => c + 1)}><RotateCcw className="size-4" /> Réessayer</Button>} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/announcements" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-strong">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour aux annonces
      </Link>

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          {isEdit ? 'Modifier' : 'Nouvelle annonce'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          {isEdit ? "Modifier l'annonce" : 'Publier une annonce'}
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
              <h2 className="text-xl font-semibold text-ink">Contenu de l'annonce</h2>

              <Input
                label="Titre"
                name="title"
                value={values.title}
                onChange={(e) => updateField('title', e.target.value)}
                error={errors.title}
                maxLength={200}
                disabled={saving}
                required
              />

              <Textarea
                label="Contenu"
                name="content"
                rows={8}
                value={values.content}
                onChange={(e) => updateField('content', e.target.value)}
                error={errors.content}
                hint="Décrivez l'annonce en détail."
                disabled={saving}
                required
              />
            </Card>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card className="space-y-5">
              <h2 className="text-xl font-semibold text-ink">Paramètres</h2>

              <Select
                label="Audience cible"
                name="target_audience"
                value={values.target_audience}
                onChange={(e) => updateField('target_audience', e.target.value)}
                disabled={saving}
              >
                <option value="all">Tous les utilisateurs</option>
                <option value="students">Étudiants seulement</option>
                <option value="teachers">Enseignants seulement</option>
              </Select>

              {sessions.length > 0 && (
                <Select
                  label="Session liée (optionnel)"
                  name="related_session"
                  value={values.related_session}
                  onChange={(e) => updateField('related_session', e.target.value)}
                  disabled={saving}
                >
                  <option value="">Aucune session liée</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.session_type === 'training' ? 'Formation' : 'Cours en ligne'})
                    </option>
                  ))}
                </Select>
              )}

              {user?.role === 'admin' && (
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={values.is_pinned}
                    onChange={(e) => updateField('is_pinned', e.target.checked)}
                    className="size-4 rounded accent-brand"
                    disabled={saving}
                  />
                  <span className="text-sm font-medium text-ink">Épingler cette annonce</span>
                </label>
              )}
            </Card>

            <Card className="bg-gradient-to-b from-white to-brand/[0.04]">
              <h2 className="text-xl font-semibold text-ink">Publier</h2>
              <div className="mt-5 space-y-3">
                <Button type="submit" loading={saving} className="w-full">
                  {saving ? 'Enregistrement…' : isEdit ? 'Sauvegarder' : 'Publier l\'annonce'}
                </Button>
                <LinkButton to="/announcements" variant="secondary" className="w-full">
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
