import { useState } from 'react'
import { CheckCircle2, LogOut, Users } from 'lucide-react'
import { enrollInCourse, unenrollFromCourse } from '../../api/courses'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { normalizeApiError } from '../../lib/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { cx } from '../../lib/cx'

export function EnrollmentButton({
  course,
  onChange,
  size = 'md',
  showBadge = true,
  className,
}) {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!course || user?.role !== 'student') return null

  const enrolled = Boolean(course.is_enrolled)
  const count = course.enrolled_count ?? 0
  const maxStudents = course.max_students ?? null
  const isFull = maxStudents !== null && count >= maxStudents

  async function handleEnroll() {
    setBusy(true)
    try {
      await enrollInCourse(course.id)
      const nextCount = count + 1
      const nextFull = maxStudents !== null && nextCount >= maxStudents
      addToast({ type: 'success', message: `You are now enrolled in “${course.title}”.` })
      onChange?.({
        is_enrolled: true,
        can_enroll: false,
        is_full: nextFull,
        enrolled_count: nextCount,
      })
    } catch (error) {
      addToast({
        type: 'error',
        message: normalizeApiError(error, 'Enrollment failed.').message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleUnenroll() {
    setBusy(true)
    try {
      await unenrollFromCourse(course.id)
      const nextCount = Math.max(0, count - 1)
      const nextFull = maxStudents !== null && nextCount >= maxStudents
      setConfirmOpen(false)
      addToast({ type: 'success', message: `You have left “${course.title}”.` })
      onChange?.({
        is_enrolled: false,
        can_enroll: !nextFull,
        is_full: nextFull,
        enrolled_count: nextCount,
      })
    } catch (error) {
      addToast({
        type: 'error',
        message: normalizeApiError(error, 'Unable to leave this course.').message,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {enrolled ? (
        <>
          {showBadge ? (
            <Badge variant="success" dot>
              Enrolled
            </Badge>
          ) : null}
          <Button
            variant="ghost"
            size={size}
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="text-slate-600 hover:text-clay"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Leave course
          </Button>
        </>
      ) : isFull ? (
        <Button variant="secondary" size={size} disabled>
          <Users className="size-4" aria-hidden="true" />
          Full
        </Button>
      ) : (
        <Button variant="accent" size={size} onClick={handleEnroll} loading={busy}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Enroll
        </Button>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false)
        }}
        title="Leave this course?"
        description={`You will lose access to “${course.title}” and its progress. You can enroll again later if places remain.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Keep my place
            </Button>
            <Button variant="danger" onClick={handleUnenroll} loading={busy}>
              Leave course
            </Button>
          </>
        }
      />
    </div>
  )
}
