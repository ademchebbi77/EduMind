import { useId } from 'react'
import { Contrast, Link2, RotateCcw, Type } from 'lucide-react'
import { useAccessibility } from '../../context/AccessibilityContext'
import { TEXT_SIZES, isCustomized } from '../../lib/accessibility'
import { cx } from '../../lib/cx'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

const SWITCHES = [
  {
    name: 'highContrast',
    icon: Contrast,
    label: 'High contrast',
    description: 'Darker text, stronger borders and plain backgrounds.',
  },
  {
    name: 'readableFont',
    icon: Type,
    label: 'Dyslexia-friendly reading',
    description: 'OpenDyslexic font with wider letter, word and line spacing.',
  },
  {
    name: 'underlineLinks',
    icon: Link2,
    label: 'Underline links',
    description: 'Make every link recognisable without relying on colour.',
  },
]

const PREVIEW_SIZES = { default: 'text-base', large: 'text-lg', 'x-large': 'text-xl' }

function SwitchRow({ name, icon: Icon, label, description, checked, onChange }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-mist text-brand-strong">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-ink">
          {label}
        </label>
        <p id={`${id}-description`} className="mt-0.5 text-xs text-slate-600">
          {description}
        </p>
      </div>
      <span className="relative mt-1 inline-flex shrink-0">
        <input
          id={id}
          name={name}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={`${id}-description`}
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className={cx(
            'flex h-6 w-11 items-center rounded-full p-0.5 transition',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand',
            checked ? 'bg-brand-strong' : 'bg-slate-300',
          )}
        >
          <span
            className={cx(
              'size-5 rounded-full bg-white shadow transition',
              checked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </span>
      </span>
    </div>
  )
}

export function AccessibilityPanel() {
  const { preferences, update, reset, panelOpen, closePanel } = useAccessibility()
  const groupName = useId()

  return (
    <Modal
      open={panelOpen}
      onClose={closePanel}
      title="Accessibility"
      description="Adjust the display to your needs. Changes apply immediately to every page and are remembered on this device."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={reset} disabled={!isCustomized(preferences)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset to defaults
          </Button>
          <Button onClick={closePanel} data-autofocus>
            Done
          </Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Text size</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TEXT_SIZES.map((size, index) => {
              const checked = preferences.textSize === size.value
              return (
                <label
                  key={size.value}
                  className={cx(
                    'flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
                    checked
                      ? 'border-brand-strong bg-brand/[0.08] text-ink'
                      : 'border-line bg-white text-ink-soft hover:border-slate-400',
                  )}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={size.value}
                    checked={checked}
                    onChange={() => update({ textSize: size.value })}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cx('font-display font-semibold leading-none', ['text-lg', 'text-2xl', 'text-3xl'][index])}
                  >
                    Aa
                  </span>
                  <span className="text-xs font-semibold">{size.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          {SWITCHES.map((item) => (
            <SwitchRow
              key={item.name}
              {...item}
              checked={preferences[item.name]}
              onChange={(checked) => update({ [item.name]: checked })}
            />
          ))}
        </div>

        <section aria-label="Preview" className="rounded-xl border border-dashed border-slate-400 bg-mist/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Preview</p>
          <p className={cx('mt-2 leading-relaxed text-ink-soft', PREVIEW_SIZES[preferences.textSize])}>
            Gradient descent adjusts the weights of a model step by step.{' '}
            <a href="#accessibility-preview" onClick={(event) => event.preventDefault()} className="font-semibold text-brand-strong">
              Example link
            </a>
          </p>
        </section>
      </div>
    </Modal>
  )
}
