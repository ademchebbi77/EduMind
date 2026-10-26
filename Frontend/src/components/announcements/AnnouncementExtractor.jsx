import { useId, useState } from 'react'
import { ChevronDown, ScanText, Wand2 } from 'lucide-react'
import { extractAnnouncementFields } from '../../api/announcements'
import { firstFieldError, normalizeApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import {
  EXTRACTION_FIELDS,
  buildUpdates,
  confidenceLevel,
  defaultSelection,
  findOverwrites,
} from '../../lib/announcementExtraction'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Textarea } from '../ui/Field'
import { Modal } from '../ui/Modal'

const MAX_LENGTH = 5000

/**
 * Carte repliable : l'utilisateur colle un texte, l'analyse locale propose les
 * champs avec une confiance, il coche ceux à appliquer et confirme avant de
 * remplacer une valeur déjà saisie.
 */
export function AnnouncementExtractor({ values, onApply, disabled = false }) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState([])
  const [overwrites, setOverwrites] = useState([])

  async function analyze() {
    setError('')
    if (text.trim().length < 15) {
      setError('Le texte est trop court pour être analysé (15 caractères minimum).')
      return
    }
    setAnalyzing(true)
    try {
      const data = await extractAnnouncementFields(text)
      setResult(data)
      setSelected(defaultSelection(data.fields))
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, "L'analyse du texte a échoué.")
      setError(firstFieldError(normalized.fields, 'text') || normalized.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function toggle(name) {
    setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }

  function apply(force = false) {
    const updates = buildUpdates(result.fields, selected)
    const replaced = findOverwrites(values, updates)
    if (replaced.length && !force) {
      setOverwrites(replaced) // demander confirmation d'abord
      return
    }
    setOverwrites([])
    onApply(updates, result.fields)
  }

  const updates = result ? buildUpdates(result.fields, selected) : {}
  const willReplace = new Set(findOverwrites(values, updates).map((item) => item.formField))

  return (
    <Card className="space-y-5 border-brand/25">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-strong">
            <Wand2 className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-lg font-semibold text-ink">Remplir automatiquement à partir d'un texte</span>
            <span className="block text-sm text-slate-600">
              Analyse locale du texte : aucune donnée n'est envoyée à un service externe.
            </span>
          </span>
        </span>
        <ChevronDown className={cx('size-5 shrink-0 text-slate-500 transition', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open ? (
        <div id={panelId} className="space-y-5">
          <Textarea
            label="Texte de l'annonce"
            rows={6}
            maxLength={MAX_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
            error={error || undefined}
            hint={`Collez une description libre : titre, date, heure, lien, public, nombre de places… (${text.length}/${MAX_LENGTH})`}
            disabled={disabled || analyzing}
          />
          <div className="flex justify-end">
            <Button variant="accent" onClick={analyze} loading={analyzing} disabled={disabled || !text.trim()}>
              <ScanText className="size-4" aria-hidden="true" />
              {analyzing ? 'Analyse…' : 'Analyser le texte'}
            </Button>
          </div>

          {result ? (
            <section aria-label="Champs détectés" className="space-y-3">
              <p className="text-sm font-medium text-ink-soft" aria-live="polite">
                {result.detected_count} champ{result.detected_count > 1 ? 's' : ''} détecté{result.detected_count > 1 ? 's' : ''} sur{' '}
                {EXTRACTION_FIELDS.length}. Cochez ceux à appliquer au formulaire.
              </p>
              <ul className="divide-y divide-line rounded-xl border border-line bg-white">
                {EXTRACTION_FIELDS.map(({ name, formField, label }) => {
                  const field = result.fields[name]
                  const level = confidenceLevel(field.confidence)
                  const checkboxId = `${panelId}-${name}`
                  return (
                    <li key={name} className="flex gap-3 px-4 py-3">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 rounded accent-brand"
                        checked={selected.includes(name)}
                        onChange={() => toggle(name)}
                        disabled={!field.detected || disabled}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={checkboxId} className={cx('text-sm font-semibold', field.detected ? 'text-ink' : 'text-slate-600')}>
                            {label}
                          </label>
                          {field.detected ? (
                            <Badge variant={level.variant}>
                              Confiance {level.label.toLowerCase()} · {field.confidence} %
                            </Badge>
                          ) : (
                            <Badge>Non détecté</Badge>
                          )}
                          {willReplace.has(formField) ? <Badge variant="clay">Remplacera la valeur actuelle</Badge> : null}
                        </div>
                        {field.detected ? (
                          <p className={cx('break-words text-sm text-ink-soft', name === 'content' && 'line-clamp-3 whitespace-pre-line')}>
                            {field.label}
                          </p>
                        ) : null}
                        {field.detected ? <p className="text-xs text-slate-500">{field.source}</p> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setResult(null)} disabled={disabled}>
                  Effacer l'analyse
                </Button>
                <Button onClick={() => apply()} disabled={disabled || !Object.keys(updates).length}>
                  Appliquer la sélection ({Object.keys(updates).length})
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={overwrites.length > 0}
        onClose={() => setOverwrites([])}
        title="Remplacer les valeurs existantes ?"
        description="Ces champs du formulaire sont déjà remplis. Confirmez pour les remplacer par les valeurs détectées."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverwrites([])}>
              Annuler
            </Button>
            <Button variant="accent" onClick={() => apply(true)} data-autofocus>
              Remplacer et appliquer
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm">
          {overwrites.map((item) => (
            <li key={item.formField} className="rounded-lg border border-line bg-white px-3 py-2">
              <p className="font-semibold text-ink">{item.label}</p>
              <p className="truncate text-slate-600">
                Actuel : « {item.current} » → Nouveau : « {item.next} »
              </p>
            </li>
          ))}
        </ul>
      </Modal>
    </Card>
  )
}
