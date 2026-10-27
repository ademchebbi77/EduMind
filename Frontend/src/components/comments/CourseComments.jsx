import { useEffect, useState } from 'react'
import { CornerDownRight, MessageSquare, Pencil, Reply, Trash2 } from 'lucide-react'
import {
  createCourseComment,
  deleteCourseComment,
  deleteCourseCommentReply,
  fetchCourseComments,
  replyToCourseComment,
  updateCourseComment,
} from '../../api/courseComments'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { formatDateTime, pluralize } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Textarea } from '../ui/Field'
import { ConfirmDeleteModal } from '../summaries/ConfirmDeleteModal'

export const MAX_COMMENT_LENGTH = 2000

/** A text box with Save / Cancel, used to write or edit a comment or a reply. */
function TextEditor({ label, initialValue = '', submitLabel, onSubmit, onCancel, fieldName }) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const text = value.trim()
    if (!text) {
      setError('Write something first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(text)
      setValue('')
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Unable to save.')
      setError(firstFieldError(normalized.fields, fieldName) || normalized.message)
      setSaving(false)
      return
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <Textarea
        label={label}
        name={fieldName}
        rows={3}
        maxLength={MAX_COMMENT_LENGTH}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setError('')
        }}
        error={error}
        hint={`${value.length} / ${MAX_COMMENT_LENGTH}`}
      />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

function CommentItem({ comment, onChange, onAskDelete }) {
  const [mode, setMode] = useState(null) // 'edit' | 'reply' | null

  async function saveText(text) {
    onChange(await updateCourseComment(comment.id, text))
    setMode(null)
  }

  async function saveReply(text) {
    onChange(await replyToCourseComment(comment.id, text))
    setMode(null)
  }

  return (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">
          {comment.author_name}
          {comment.is_mine ? <span className="ml-2 text-xs font-medium text-slate-500">(you)</span> : null}
        </p>
        <p className="text-xs text-slate-500">
          {formatDateTime(comment.created_at)}
          {comment.edited_at ? ' · edited' : ''}
        </p>
      </div>

      {mode === 'edit' ? (
        <div className="mt-3">
          <TextEditor
            label="Edit your comment"
            fieldName="text"
            initialValue={comment.text}
            submitLabel="Save"
            onSubmit={saveText}
            onCancel={() => setMode(null)}
          />
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{comment.text}</p>
      )}

      {mode !== 'edit' ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {comment.can_reply && !comment.reply && mode !== 'reply' ? (
            <Button variant="ghost" size="sm" onClick={() => setMode('reply')}>
              <Reply className="size-4" aria-hidden="true" />
              Reply
            </Button>
          ) : null}
          {comment.can_edit ? (
            <Button variant="ghost" size="sm" onClick={() => setMode('edit')}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          ) : null}
          {comment.can_delete ? (
            <Button variant="ghost" size="sm" onClick={() => onAskDelete(comment, 'comment')}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}

      {comment.reply && mode !== 'reply' ? (
        <div className="mt-3 ml-2 rounded-xl border-l-4 border-brand bg-brand/[0.05] p-4 sm:ml-6">
          <div className="flex flex-wrap items-center gap-2">
            <CornerDownRight className="size-4 text-brand-strong" aria-hidden="true" />
            <Badge variant="brand">Teacher's reply</Badge>
            <span className="text-sm font-semibold text-ink">{comment.replied_by_name}</span>
            <span className="text-xs text-slate-500">{formatDateTime(comment.replied_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{comment.reply}</p>
          {comment.can_reply ? (
            <div className="mt-2 flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setMode('reply')}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit reply
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onAskDelete(comment, 'reply')}>
                <Trash2 className="size-4" aria-hidden="true" />
                Delete reply
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'reply' ? (
        <div className="mt-3 ml-2 sm:ml-6">
          <TextEditor
            label={comment.reply ? 'Edit your reply' : 'Your reply'}
            fieldName="reply"
            initialValue={comment.reply}
            submitLabel={comment.reply ? 'Save reply' : 'Send reply'}
            onSubmit={saveReply}
            onCancel={() => setMode(null)}
          />
        </div>
      ) : null}
    </li>
  )
}

/** Comments of a course: students write them, the course teacher replies. */
export function CourseComments({ courseId }) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [result, setResult] = useState({ key: null, comments: [], count: 0, next: false, error: '' })
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [toDelete, setToDelete] = useState(null) // { comment, target: 'comment' | 'reply' }
  const [deleting, setDeleting] = useState(false)

  const requestKey = String(courseId)

  useEffect(() => {
    const controller = new AbortController()
    fetchCourseComments(courseId, {}, { signal: controller.signal })
      .then((data) =>
        setResult({ key: requestKey, comments: data.results, count: data.count, next: Boolean(data.next), error: '' }),
      )
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          comments: [],
          count: 0,
          next: false,
          error: normalizeApiError(requestError, 'Unable to load the comments.').message,
        })
      })
    return () => controller.abort()
  }, [courseId, requestKey])

  const loading = result.key !== requestKey
  const isStudent = user?.role === 'student'

  async function loadMore() {
    setLoadingMore(true)
    try {
      const data = await fetchCourseComments(courseId, { page: page + 1 })
      setPage(page + 1)
      setResult((current) => ({
        ...current,
        comments: [...current.comments, ...data.results.filter((item) => !current.comments.some((c) => c.id === item.id))],
        next: Boolean(data.next),
      }))
    } catch (requestError) {
      addToast({ type: 'error', message: normalizeApiError(requestError, 'Unable to load more comments.').message })
    } finally {
      setLoadingMore(false)
    }
  }

  async function addComment(text) {
    const comment = await createCourseComment(courseId, text)
    setResult((current) => ({ ...current, comments: [comment, ...current.comments], count: current.count + 1 }))
    addToast({ type: 'success', message: 'Your comment has been posted.' })
  }

  function replaceComment(updated) {
    setResult((current) => ({
      ...current,
      comments: current.comments.map((item) => (item.id === updated.id ? updated : item)),
    }))
  }

  async function confirmDelete() {
    const { comment, target } = toDelete
    setDeleting(true)
    try {
      if (target === 'reply') {
        replaceComment(await deleteCourseCommentReply(comment.id))
      } else {
        await deleteCourseComment(comment.id)
        setResult((current) => ({
          ...current,
          comments: current.comments.filter((item) => item.id !== comment.id),
          count: Math.max(0, current.count - 1),
        }))
      }
      addToast({ type: 'success', message: target === 'reply' ? 'Reply deleted.' : 'Comment deleted.' })
      setToDelete(null)
    } catch (requestError) {
      addToast({ type: 'error', message: normalizeApiError(requestError, 'Unable to delete.').message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card aria-labelledby="course-comments-title">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="course-comments-title" className="inline-flex items-center gap-2 text-xl font-semibold text-ink">
          <MessageSquare className="size-5 text-brand-strong" aria-hidden="true" />
          Comments
          {!loading && !result.error ? (
            <span className="text-base font-normal text-slate-500"> ({result.count})</span>
          ) : null}
        </h2>
        <span className="academic-rule" aria-hidden="true" />
      </div>

      {isStudent ? (
        <div className="mb-6">
          <TextEditor label="Add a comment" fieldName="text" submitLabel="Post comment" onSubmit={addComment} />
        </div>
      ) : (
        <p className="mb-6 text-sm text-slate-500">
          Students comment on this course; the course teacher can reply.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500" role="status">
          Loading comments…
        </p>
      ) : result.error ? (
        <p role="alert" className="text-sm font-medium text-clay">
          {result.error}
        </p>
      ) : result.comments.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet.{isStudent ? ' Be the first to share your thoughts.' : ''}</p>
      ) : (
        <>
          <ul className="space-y-3" aria-label={`${result.count} ${pluralize(result.count, 'comment')}`}>
            {result.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onChange={replaceComment}
                onAskDelete={(item, target) => setToDelete({ comment: item, target })}
              />
            ))}
          </ul>
          {result.next ? (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Show more comments
              </Button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDeleteModal
        open={Boolean(toDelete)}
        title={toDelete?.target === 'reply' ? 'Delete this reply?' : 'Delete this comment?'}
        description={
          toDelete?.target === 'reply'
            ? 'The comment stays; only your reply is removed.'
            : 'The comment and its reply will be removed for everyone.'
        }
        deleting={deleting}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </Card>
  )
}
