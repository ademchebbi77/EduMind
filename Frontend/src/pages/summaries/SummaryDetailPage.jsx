import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Download, ImageIcon, Lightbulb, Lock, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { deleteIllustration, deleteSummary, fetchSummary, generateIllustration } from '../../api/summaries'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { exportSummaryToPDF } from '../../lib/pdfExport'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/assessments/BackLink'
import { AudioPlayer } from '../../components/summaries/AudioPlayer'
import { ConfirmDeleteModal } from '../../components/summaries/ConfirmDeleteModal'
import { CourseChat } from '../../components/summaries/CourseChat'
import { SummaryContent } from '../../components/summaries/SummaryContent'

/** Explanatory picture: Gemini writes the prompt, then the image service draws it. */
function Illustration({ summary, onChange }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)

  async function run(action, message) {
    setBusy(true)
    try {
      onChange(await action(summary.id))
      if (message) addToast({ type: 'success', message })
    } catch (requestError) {
      addToast({ type: 'error', message: normalizeApiError(requestError, 'The illustration could not be created.').message })
    } finally {
      setBusy(false)
    }
  }

  if (!summary.illustration_url && !summary.can_edit) return null

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <ImageIcon className="size-5 text-brand" aria-hidden="true" />
          Illustration
        </h2>
        {summary.can_edit ? (
          <div className="flex gap-2">
            <Button variant="accent" size="sm" loading={busy} onClick={() => run(generateIllustration, 'Illustration created.')}>
              <Sparkles className="size-4" aria-hidden="true" />
              {busy ? 'Drawing… (up to a minute)' : summary.illustration_url ? 'New illustration' : 'Generate an illustration'}
            </Button>
            {summary.illustration_url && summary.can_edit ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(deleteIllustration)} aria-label="Remove the illustration">
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {summary.illustration_url ? (
        <figure className="space-y-2">
          <img
            src={summary.illustration_url}
            alt={`Illustration of the summary "${summary.title}"`}
            className="w-full rounded-xl border border-line bg-mist object-cover"
          />
          {summary.illustration_prompt ? (
            <figcaption className="text-xs text-slate-600">
              <span className="font-semibold">Prompt written by Gemini:</span> {summary.illustration_prompt}
            </figcaption>
          ) : null}
        </figure>
      ) : (
        <p className="text-sm text-slate-600">
          Gemini reads the summary and describes a picture that explains it, then an image generator draws it.
        </p>
      )}
    </Card>
  )
}

export default function SummaryDetailPage() {
  const { summaryId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  useDocumentTitle(summary?.title || 'Summary')

  useEffect(() => {
    const controller = new AbortController()
    fetchSummary(summaryId, { signal: controller.signal })
      .then(setSummary)
      .catch((requestError) => {
        if (!isCanceled(requestError)) setError(normalizeApiError(requestError, 'This summary could not be loaded.'))
      })
    return () => controller.abort()
  }, [summaryId])

  async function remove() {
    setDeleting(true)
    try {
      await deleteSummary(summary.id)
      addToast({ type: 'success', message: `"${summary.title}" has been deleted.` })
      navigate('/summaries')
    } catch (deleteError) {
      addToast({ type: 'error', message: normalizeApiError(deleteError, 'Deletion failed.').message })
      setDeleting(false)
    }
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      await exportSummaryToPDF(summary)
      addToast({ type: 'success', message: 'PDF downloaded successfully!' })
    } catch (exportError) {
      console.error('PDF export error:', exportError)
      addToast({ type: 'error', message: 'Failed to generate PDF. Please try again.' })
    } finally {
      setExporting(false)
    }
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Summary unavailable"
        description={error.message}
        action={<LinkButton to="/summaries">Back to summaries</LinkButton>}
      />
    )
  }
  if (!summary) return <PageLoader label="Loading the summary…" />

  return (
    <div className="space-y-6">
      <BackLink to="/summaries" label="Back to summaries" />

      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">{summary.course_title}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{summary.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {summary.source === 'ai' ? (
              <Badge variant="brand">
                <Sparkles className="size-3" aria-hidden="true" />
                Generated by AI
              </Badge>
            ) : (
              <Badge>Written manually</Badge>
            )}
            {summary.is_shared ? null : (
              <Badge>
                <Lock className="size-3" aria-hidden="true" />
                Private note
              </Badge>
            )}
            <span>by {summary.author_name}</span>
          </div>
          {summary.tags && summary.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.tags.map((tag, index) => (
                <Badge key={index} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="accent" 
            onClick={handleExportPDF} 
            loading={exporting}
            disabled={exporting}
            aria-label="Télécharger le résumé au format PDF"
          >
            <Download className="size-4" aria-hidden="true" />
            {exporting ? 'Generating PDF...' : 'Download PDF'}
          </Button>
          {summary.can_edit ? (
            <>
              <LinkButton to={`/summaries/${summary.id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </LinkButton>
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" aria-hidden="true" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <AudioPlayer text={summary.content} language={summary.language} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <SummaryContent text={summary.content} />
          </Card>

          {summary.key_concepts.length ? (
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
                <Lightbulb className="size-5 text-brand" aria-hidden="true" />
                Key concepts
              </h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {summary.key_concepts.map((concept, index) => (
                  <div key={`${concept.term}-${index}`} className="rounded-xl border border-line bg-white p-4">
                    <dt className="font-semibold text-ink">{concept.term}</dt>
                    <dd className="mt-1 text-sm text-slate-600">{concept.definition}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Illustration summary={summary} onChange={setSummary} />
          <CourseChat summaryId={summary.id} />
        </div>
      </div>

      <ConfirmDeleteModal
        open={confirming}
        title="Delete this summary?"
        description={`"${summary.title}", its illustration and its conversations will be permanently deleted.`}
        deleting={deleting}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
      />
    </div>
  )
}
