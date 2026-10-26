import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Download, ImageIcon, Lightbulb, Lock, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { deleteIllustration, deleteSummary, fetchResources, fetchSummary, generateIllustration } from '../../api/summaries'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { exportSummaryToPDF } from '../../lib/pdfExport'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/assessments/BackLink'
import { AudioPlayer } from '../../components/summaries/AudioPlayer'
import { ConfirmDeleteModal } from '../../components/summaries/ConfirmDeleteModal'
import { CourseChat } from '../../components/summaries/CourseChat'
import { SummaryContent } from '../../components/summaries/SummaryContent'

/** Explanatory picture: Gemini writes the prompt, then the image service draws it. */
function Illustration({ summary, onChange, canGenerateIllustration = false }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)

  a