import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildUpdates,
  confidenceLevel,
  defaultSelection,
  findOverwrites,
  formValueOf,
  localSchedule,
} from '../../lib/announcementExtraction'
import AnnouncementFormPage from '../../pages/announcements/AnnouncementFormPage'
import { AnnouncementExtractor } from './AnnouncementExtractor'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  extractAnnouncementFields: vi.fn(),
  createAnnouncement: vi.fn(),
  fetchAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  fetchSessions: vi.fn(),
}))

vi.mock('../../api/announcements', () => ({
  extractAnnouncementFields: mocks.extractAnnouncementFields,
  createAnnouncement: mocks.createAnnouncement,
  fetchAnnouncement: mocks.fetchAnnouncement,
  updateAnnouncement: mocks.updateAnnouncement,
}))
vi.mock('../../api/sessions', () => ({ fetchSessions: mocks.fetchSessions }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'teacher' } }) }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ addToast: mocks.addToast }) }))

const NONE = { value: null, label: '', confidence: 0, detected: false, source: 'Non détecté' }
const FIELDS = {
  title: { value: 'Atelier Python', label: 'Atelier Python', confidence: 85, detected: true, source: 'Première ligne du texte' },
  content: { value: 'Un atelier pratique.', label: 'Un atelier pratique.', confidence: 90, detected: true, source: 'Texte complet' },
  target_audience: { value: 'students', label: 'Étudiants seulement', confidence: 90, detected: true, source: '« réservé aux étudiants »' },
  category: { value: 'formation', label: 'Formation', confidence: 69, detected: true, source: 'Mots-clés : atelier' },
  event_date: { value: '2026-11-12', label: '12/11/2026', confidence: 95, detected: true, source: '« 12 novembre 2026 »' },
  event_time: { value: '14:30', label: '14h30', confidence: 90, detected: true, source: '« 14h30 »' },
  meeting_link: NONE,
  capacity: { value: 25, label: '25', confidence: 40, detected: true, source: '« 25 personnes »' },
  related_session: {
    value: 7,
    label: 'Atelier Python (session)',
    confidence: 72,
    detected: true,
    source: 'Similarité TF-IDF 0.72',
    session_type: 'training',
    starts_at: '2026-11-12T14:30:00',
    meeting_link: 'https://meet.google.com/abc-defg-hij',
  },
}
const RESPONSE = { fields: FIELDS, detected_count: 8 }
const TEXT = 'Atelier Python\nUn atelier pratique réservé aux étudiants le 12 novembre 2026 à 14h30.'
const EMPTY_FORM = {
  title: '', content: '', target_audience: 'all', category_override: '', related_session: '',
  is_pinned: false, event_date: '', event_time: '', event_link: '', capacity: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchSessions.mockResolvedValue({ results: [] })
})

describe('announcementExtraction helpers', () => {
  it('maps confidence scores to levels', () => {
    expect(confidenceLevel(95).label).toBe('Élevée')
    expect(confidenceLevel(60).label).toBe('Moyenne')
    expect(confidenceLevel(20).label).toBe('Faible')
  })

  it('selects detected fields with enough confidence by default', () => {
    expect(defaultSelection(FIELDS)).toEqual([
      'title', 'content', 'target_audience', 'category', 'event_date', 'event_time', 'related_session',
    ])
  })

  it('builds form values for the selected fields only', () => {
    expect(buildUpdates(FIELDS, ['category', 'capacity', 'meeting_link', 'related_session'])).toEqual({
      category_override: 'formation',
      capacity: '25',
      related_session: '7',
    })
    expect(formValueOf('capacity', { value: null })).toBe('') // illimité
  })

  it('finds values that would be overwritten', () => {
    const current = { ...EMPTY_FORM, title: 'Mon titre', target_audience: 'all', event_time: '14:30' }
    const updates = { title: 'Atelier Python', target_audience: 'students', event_time: '14:30' }
    expect(findOverwrites(current, updates)).toEqual([
      { formField: 'title', label: 'Titre', current: 'Mon titre', next: 'Atelier Python' },
    ])
  })

  it('converts a session start to local date and time', () => {
    expect(localSchedule('2026-11-12T14:30:00')).toEqual({ event_date: '2026-11-12', event_time: '14:30' })
    expect(localSchedule('not a date')).toEqual({ event_date: '', event_time: '' })
  })
})

describe('AnnouncementExtractor', () => {
  async function openAndAnalyze(user, values = EMPTY_FORM, onApply = vi.fn()) {
    mocks.extractAnnouncementFields.mockResolvedValue(RESPONSE)
    render(<AnnouncementExtractor values={values} onApply={onApply} />)
    const toggle = screen.getByRole('button', { name: /remplir automatiquement/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.type(screen.getByLabelText("Texte de l'annonce"), TEXT)
    await user.click(screen.getByRole('button', { name: /analyser le texte/i }))
    await screen.findByText(/8 champs détectés sur 9/i)
    return onApply
  }

  it('is collapsed by default and validates short texts locally', async () => {
    const user = userEvent.setup()
    render(<AnnouncementExtractor values={EMPTY_FORM} onApply={vi.fn()} />)
    expect(screen.queryByLabelText("Texte de l'annonce")).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /remplir automatiquement/i }))
    await user.type(screen.getByLabelText("Texte de l'annonce"), 'Trop court')
    await user.click(screen.getByRole('button', { name: /analyser le texte/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/trop court/i)
    expect(mocks.extractAnnouncementFields).not.toHaveBeenCalled()
  })

  it('previews fields with confidence and applies the selection', async () => {
    const user = userEvent.setup()
    const onApply = await openAndAnalyze(user)

    expect(mocks.extractAnnouncementFields).toHaveBeenCalledWith(TEXT)
    expect(screen.getByText('Étudiants seulement')).toBeInTheDocument()
    expect(screen.getByText('Confiance élevée · 95 %')).toBeInTheDocument()
    expect(screen.getByText('Confiance faible · 40 %')).toBeInTheDocument()
    expect(screen.getByLabelText('Lien de réunion')).toBeDisabled() // non détecté
    expect(screen.getByLabelText('Nombre de places')).not.toBeChecked() // confiance faible

    await user.click(screen.getByLabelText('Catégorie')) // décocher
    await user.click(screen.getByRole('button', { name: /appliquer la sélection \(6\)/i }))

    expect(onApply).toHaveBeenCalledWith(
      {
        title: 'Atelier Python',
        content: 'Un atelier pratique.',
        target_audience: 'students',
        event_date: '2026-11-12',
        event_time: '14:30',
        related_session: '7',
      },
      FIELDS,
    )
  })

  it('asks for confirmation before overwriting existing values', async () => {
    const user = userEvent.setup()
    const onApply = await openAndAnalyze(user, { ...EMPTY_FORM, title: 'Mon brouillon' })

    expect(screen.getByText('Remplacera la valeur actuelle')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /appliquer la sélection/i }))

    const dialog = await screen.findByRole('dialog', { name: /remplacer les valeurs existantes/i })
    expect(within(dialog).getByText(/« Mon brouillon » → Nouveau : « Atelier Python »/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /appliquer la sélection/i }))
    await user.click(await screen.findByRole('button', { name: /remplacer et appliquer/i }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0].title).toBe('Atelier Python')
  })

  it('shows the server validation message', async () => {
    const user = userEvent.setup()
    const error = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'permission_denied', message: "Vous n'avez pas la permission." } } },
    })
    mocks.extractAnnouncementFields.mockRejectedValue(error)
    render(<AnnouncementExtractor values={EMPTY_FORM} onApply={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /remplir automatiquement/i }))
    await user.type(screen.getByLabelText("Texte de l'annonce"), TEXT)
    await user.click(screen.getByRole('button', { name: /analyser le texte/i }))
    expect(await screen.findByText(/permission/i)).toBeInTheDocument()
  })
})

describe('AnnouncementFormPage with the extractor', () => {
  it('fills the form, adds the matched session and completes the link from it', async () => {
    const user = userEvent.setup()
    mocks.extractAnnouncementFields.mockResolvedValue(RESPONSE)
    mocks.createAnnouncement.mockResolvedValue({ id: 3, title: 'Atelier Python' })
    const { container } = render(
      <MemoryRouter initialEntries={['/announcements/new']}>
        <Routes>
          <Route path="/announcements/new" element={<AnnouncementFormPage />} />
          <Route path="/announcements" element={<p>Liste des annonces</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /remplir automatiquement/i }))
    await user.type(screen.getByLabelText("Texte de l'annonce"), TEXT)
    await user.click(screen.getByRole('button', { name: /analyser le texte/i }))
    await user.click(await screen.findByRole('button', { name: /appliquer la sélection/i }))

    const formField = (name) => container.querySelector(`form [name="${name}"]`)
    expect(formField('title')).toHaveValue('Atelier Python')
    expect(formField('content')).toHaveValue('Un atelier pratique.')
    expect(formField('target_audience')).toHaveValue('students')
    expect(formField('category_override')).toHaveValue('formation')
    expect(formField('event_date')).toHaveValue('2026-11-12')
    expect(formField('event_time')).toHaveValue('14:30')
    expect(formField('related_session')).toHaveValue('7')
    expect(formField('capacity')).toHaveValue(null) // confiance faible : non cochée
    // Le lien n'était pas dans le texte : il vient de la session liée.
    expect(formField('event_link')).toHaveValue('https://meet.google.com/abc-defg-hij')
    expect(mocks.addToast).toHaveBeenCalledWith({ type: 'success', message: '7 champs appliqués au formulaire.' })

    await user.click(screen.getByRole('button', { name: /publier l'annonce/i }))
    await waitFor(() =>
      expect(mocks.createAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Atelier Python',
          target_audience: 'students',
          category_override: 'formation',
          related_session: '7',
          event_date: '2026-11-12',
          event_time: '14:30',
          meeting_link: 'https://meet.google.com/abc-defg-hij',
          capacity: null,
        }),
      ),
    )
  })
})
