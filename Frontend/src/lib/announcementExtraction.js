// Champs proposés par l'analyse locale du texte, dans l'ordre d'affichage.
// `name` = clé renvoyée par l'API, `formField` = clé du formulaire d'annonce.
export const EXTRACTION_FIELDS = [
  { name: 'title', formField: 'title', label: 'Titre' },
  { name: 'content', formField: 'content', label: 'Contenu' },
  { name: 'target_audience', formField: 'target_audience', label: 'Audience cible' },
  { name: 'category', formField: 'category_override', label: 'Catégorie' },
  { name: 'event_date', formField: 'event_date', label: 'Date' },
  { name: 'event_time', formField: 'event_time', label: 'Heure' },
  { name: 'meeting_link', formField: 'event_link', label: 'Lien de réunion' },
  { name: 'capacity', formField: 'capacity', label: 'Nombre de places' },
  { name: 'related_session', formField: 'related_session', label: 'Session liée' },
]

// Valeurs du formulaire vide : les garder n'est pas « une valeur existante ».
const FORM_DEFAULTS = { target_audience: 'all' }

// Seuil à partir duquel un champ détecté est coché par défaut.
export const DEFAULT_SELECTION_THRESHOLD = 50

export function confidenceLevel(score) {
  if (score >= 80) return { label: 'Élevée', variant: 'success' }
  if (score >= 50) return { label: 'Moyenne', variant: 'warning' }
  return { label: 'Faible', variant: 'clay' }
}

/** Valeur telle que le formulaire l'attend (chaînes, '' = vide ou illimité). */
export function formValueOf(name, field) {
  if (name === 'capacity' || name === 'related_session') {
    return field.value === null || field.value === undefined ? '' : String(field.value)
  }
  return field.value ?? ''
}

export function defaultSelection(fields) {
  return EXTRACTION_FIELDS.filter(({ name }) => {
    const field = fields[name]
    return field?.detected && field.confidence >= DEFAULT_SELECTION_THRESHOLD
  }).map(({ name }) => name)
}

/** { champ du formulaire: nouvelle valeur } pour les champs cochés et détectés. */
export function buildUpdates(fields, selected) {
  const updates = {}
  for (const { name, formField } of EXTRACTION_FIELDS) {
    if (selected.includes(name) && fields[name]?.detected) {
      updates[formField] = formValueOf(name, fields[name])
    }
  }
  return updates
}

function hasValue(formField, value) {
  const text = String(value ?? '').trim()
  return text !== '' && text !== (FORM_DEFAULTS[formField] ?? '')
}

/** Champs déjà remplis qu'une application remplacerait par une autre valeur. */
export function findOverwrites(current, updates) {
  return EXTRACTION_FIELDS.filter(({ formField }) => {
    if (!(formField in updates)) return false
    return hasValue(formField, current[formField]) && String(current[formField]) !== String(updates[formField])
  }).map(({ formField, label }) => ({
    formField,
    label,
    current: String(current[formField]),
    next: String(updates[formField]),
  }))
}

/** Date (AAAA-MM-JJ) et heure (HH:MM) locales d'une date ISO, comme le formulaire. */
export function localSchedule(isoDate) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return { event_date: '', event_time: '' }
  const pad = (number) => String(number).padStart(2, '0')
  return {
    event_date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    event_time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}
