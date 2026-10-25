import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Input } from './Field'
import { Modal } from './Modal'

describe('Button', () => {
  it('exposes its busy state and blocks interaction while loading', () => {
    render(<Button loading>Save</Button>)

    const button = screen.getByRole('button', { name: /save/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Input', () => {
  it('links its label, error message and invalid state', () => {
    render(
      <Input
        label="Email address"
        name="email"
        value=""
        onChange={() => {}}
        error="Enter your email address."
      />,
    )

    const input = screen.getByLabelText(/email address/i)
    const error = screen.getByRole('alert')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', error.id)
    expect(error).toHaveTextContent('Enter your email address.')
  })
})

describe('Modal', () => {
  it('renders an accessible dialog and closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Modal open onClose={onClose} title="Delete course" description="Permanent action.">
        <p>Content</p>
      </Modal>,
    )

    expect(
      screen.getByRole('dialog', { name: /delete course/i }),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
