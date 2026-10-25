import { ShieldAlert } from 'lucide-react'
import { LinkButton } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

export function AccessDenied({ message }) {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Access denied"
      description={
        message ||
        'Your role does not allow this action. Contact an administrator if you think this is a mistake.'
      }
      action={
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton to="/courses">Back to courses</LinkButton>
          <LinkButton to="/dashboard" variant="secondary">
            Dashboard
          </LinkButton>
        </div>
      }
    />
  )
}
