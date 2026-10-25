export const ANNOUNCEMENT_CATEGORIES = [
  { key: 'formation', label: 'Formation', variant: 'brand' },
  { key: 'evaluation', label: 'Évaluation', variant: 'clay' },
  { key: 'administratif', label: 'Administratif', variant: 'neutral' },
  { key: 'evenement', label: 'Événement', variant: 'sage' },
  { key: 'rappel', label: 'Rappel', variant: 'warning' },
  { key: 'autre', label: 'Autre', variant: 'neutral' },
]

const BY_KEY = Object.fromEntries(ANNOUNCEMENT_CATEGORIES.map((item) => [item.key, item]))

export function categoryMeta(category) {
  if (!category?.key) return null
  return BY_KEY[category.key] || { key: category.key, label: category.label, variant: 'neutral' }
}

export function categoryTitle(category) {
  if (!category?.key) return undefined
  if (!category.keywords?.length) return category.label
  return `${category.label} · mots-clés : ${category.keywords.join(', ')}`
}
