import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gamepad2 } from 'lucide-react'
import { joinLiveGame } from '../../api/liveGames'
import { firstFieldError, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'

export default function JoinLivePage() {
  useDocumentTitle('Join a live quiz')
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!/^\d{6}$/.test(pin)) {
      setError('Enter the 6-digit PIN shown on your teacher’s screen.')
      return
    }
    setJoining(true)
    try {
      const game = await joinLiveGame(pin)
      navigate(`/live/${game.id}`)
    } catch (joinError) {
      const normalized = normalizeApiError(joinError, 'Unable to join this game.')
      setError(firstFieldError(normalized.fields, 'pin') || normalized.message)
      setJoining(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <header className="text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-brand/10 text-brand-strong ring-1 ring-brand/15">
          <Gamepad2 className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">Join a live quiz</h1>
        <p className="mt-2 text-sm text-slate-600">Type the PIN displayed by your teacher.</p>
      </header>

      <Card as="form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Game PIN"
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, ''))
            setError('')
          }}
          error={error}
          className="text-center font-display text-2xl tracking-[0.4em]"
          required
        />
        <Button type="submit" variant="accent" loading={joining} className="w-full">
          {joining ? 'Joining…' : 'Join'}
        </Button>
      </Card>
    </div>
  )
}
