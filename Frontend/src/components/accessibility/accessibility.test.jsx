import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AccessibilityProvider } from '../../context/AccessibilityContext'
import {
  STORAGE_KEY,
  applyPreferences,
  loadPreferences,
  sanitizePreferences,
} from '../../lib/accessibility'
import { AccessibilityButton } from './AccessibilityButton'
import { AccessibilityPanel } from './AccessibilityPanel'

const root = document.documentElement

function renderPanel() {
  return render(
    <AccessibilityProvider>
      <AccessibilityButton variant="sidebar" />
      <AccessibilityPanel />
    </AccessibilityProvider>,
  )
}

function clearRoot() {
  delete root.dataset.textSize
  delete root.dataset.contrast
}

beforeEach(() => {
  window.localStorage.clear()
  clearRoot()
})

afterEach(clearRoot)

describe('accessibility preferences', () => {
  it('ignores invalid or removed stored values', () => {
    expect(
      sanitizePreferences({ textSize: 'huge', highContrast: 'yes', reduceMotion: true }),
    ).toEqual({ textSize: 'default', highContrast: false })
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadPreferences().textSize).toBe('default')
  })

  it('applies and removes attributes on the root element', () => {
    applyPreferences({ textSize: 'large', highContrast: true })
    expect(root.dataset.textSize).toBe('large')
    expect(root.dataset.contrast).toBe('high')

    applyPreferences({ textSize: 'default', highContrast: false })
    expect(root.dataset.textSize).toBe('default')
    expect(root.dataset.contrast).toBeUndefined()
  })
})

describe('AccessibilityPanel', () => {
  it('opens from the button with text size and high contrast only', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /accessibility/i }))

    const dialog = screen.getByRole('dialog', { name: 'Accessibility' })
    expect(within(dialog).getAllByRole('radio').map((radio) => radio.value)).toEqual([
      'default',
      'large',
      'x-large',
    ])
    expect(within(dialog).getByRole('radio', { name: /default/i })).toBeChecked()
    expect(within(dialog).getAllByRole('switch')).toHaveLength(1)
    expect(within(dialog).getByRole('switch', { name: /high contrast/i })).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: /reset to defaults/i })).toBeDisabled()
  })

  it('applies the settings immediately and remembers them', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /accessibility/i }))

    await user.click(screen.getByRole('radio', { name: /extra large/i }))
    await user.click(screen.getByRole('switch', { name: /high contrast/i }))

    expect(root.dataset).toMatchObject({ textSize: 'x-large', contrast: 'high' })
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({
      textSize: 'x-large',
      highContrast: true,
    })
  })

  it('restores saved settings and can reset them', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 'large', highContrast: true }))
    renderPanel()

    expect(root.dataset.contrast).toBe('high')
    const button = screen.getByRole('button', { name: /accessibility/i })
    expect(button).toHaveTextContent(/custom settings active/i)

    await user.click(button)
    expect(screen.getByRole('switch', { name: /high contrast/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /reset to defaults/i }))

    expect(root.dataset.contrast).toBeUndefined()
    expect(root.dataset.textSize).toBe('default')
    expect(screen.getByRole('radio', { name: /^default/i })).toBeChecked()
  })

  it('closes with Escape and the Done button', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /accessibility/i }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /accessibility/i }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders nothing outside the provider', () => {
    const { container } = render(<AccessibilityButton />)
    expect(container).toBeEmptyDOMElement()
  })
})
