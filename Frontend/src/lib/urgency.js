const URGENCY_BADGES = {
  high:   { variant: 'warning', label: 'Urgent' },
  medium: { variant: 'brand',   label: 'Prioritaire' },
}

/**
 * Traduit le score d'urgence renvoyé par l'API en badge.
 * Les annonces de niveau "low" n'affichent aucun badge pour éviter le bruit visuel.
 */
export function urgencyBadge(urgency) {
  const badge = URGENCY_BADGES[urgency?.level]
  if (!badge) return null
  return { ...badge, title: urgency.reasons?.length ? urgency.reasons.join(' · ') : undefined }
}

/**
 * Score chiffré, affiché en complément du badge (y compris pour les annonces
 * de niveau faible, afin que chaque score reste lisible).
 */
export function urgencyScore(urgency) {
  if (!urgency || typeof urgency.score !== 'number') return null
  return {
    value: urgency.score,
    text: `Urgence ${urgency.score}/100`,
    title: urgency.reasons?.length ? urgency.reasons.join(' · ') : undefined,
  }
}
