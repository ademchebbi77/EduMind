import { Badge } from '../ui/Badge'

export function CategoryBadge({ name, className }) {
  if (!name) return null
  return (
    <Badge variant="brand" className={className}>
      {name}
    </Badge>
  )
}
