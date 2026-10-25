import { Badge } from '../ui/Badge'
import { DIFFICULTY_BADGE_VARIANTS, difficultyLabel } from '../../lib/assessments'

export function DifficultyBadge({ difficulty, label }) {
  return (
    <Badge variant={DIFFICULTY_BADGE_VARIANTS[difficulty] || 'neutral'} dot>
      {label || difficultyLabel(difficulty)}
    </Badge>
  )
}
