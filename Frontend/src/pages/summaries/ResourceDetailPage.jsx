import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ExternalLink, FileText, Link2, Lock, Pencil, Trash2 } from 'lucide-react'
import { deleteResource, fetchResource } from '../../api/summaries'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/assessments/BackLink'
import { ConfirmDeleteModal } from '../../components/summaries/ConfirmDeleteModal'

export default function ResourceDetailPage() {
  const { resourceId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [resource, setResource] = useState(null)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useDocumentTitle(resource?.title || 'Resource')

  useEffect(() => {
    const controller = new AbortController()
    fetchResource(resourceId, { signal: controller.signal })
      .then(setResource)
      .catch((requestError) => {
        if (!isCanceled(requestError)) setError(normalizeApiError(requestError, 'This resource could not be loaded.'))
      })
    return () => controller.abort()
  }, [resourceId])

  async function remove() {
    setDeleting(true)
    try {
      await deleteResource(resource.id)
      addToast({ type: 'success', message: `"${resource.title}" has been deleted.` })
      navigate('/summaries?tab=resources')
    } catch (deleteError) {
      addToast({ type: 'error', message: normalizeApiError(deleteError, 'Deletion failed.').message })
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Resource unavailable"
        description={error.message}
        action={<LinkButton to="/summaries?tab=resources">Back to resources</LinkButton>}
      />
    )
  }
  if (!resource) return <PageLoader label="Loading the resource…" />

  const href = resource.kind === 'link' ? resource.url : resource.file_url
  const Icon = resource.kind === 'link' ? Link2 : FileText

  return (
    <div className="space-y-6">
      <BackLink to="/summaries?tab=resources" label="Back to resources" />

      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">{resource.course_title}</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            <Icon className="size-8 shrink-0 text-brand" aria-hidden="true" />
            {resource.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge variant="neutral">{resource.kind === 'link' ? 'Web link' : 'File'}</Badge>
            {resource.is_shared ? null : (
              <Badge>
                <Lock className="size-3" aria-hidden="true" />
                Private note
              </Badge>
            )}
            <span>by {resource.author_name}</span>
          </div>
        </div>
        {resource.can_edit ? (
          <div className="flex gap-2">
            <LinkButton to={`/resources/${resource.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </LinkButton>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">Description</h2>
          {resource.description ? (
            <p className="whitespace-pre-wrap text-slate-600">{resource.description}</p>
          ) : (
            <p className="text-sm italic text-slate-500">No description provided.</p>
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">Access</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-600">Type</p>
              <p className="mt-1 text-ink">{resource.kind === 'link' ? 'Web link' : 'File'}</p>
            </div>

            {resource.kind === 'link' ? (
              <div>
                <p className="text-sm font-medium text-slate-600">URL</p>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-brand hover:text-brand-strong hover:underline"
                >
                  {resource.url}
                </a>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-600">File name</p>
                <p className="mt-1 text-ink">{resource.file_name}</p>
              </div>
            )}

            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 font-semibold text-paper shadow-sm transition hover:bg-brand-strong focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {resource.kind === 'link' ? 'Open link' : 'Download file'}
            </a>
          </div>
        </Card>
      </div>

      <ConfirmDeleteModal
        open={confirming}
        title="Delete this resource?"
        description={`"${resource.title}" will be permanently deleted.`}
        deleting={deleting}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
      />
    </div>
  )
}
