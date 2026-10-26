export const TRANSCRIPT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'el', label: 'Greek' },
  { code: 'tr', label: 'Turkish' },
  { code: 'vi', label: 'Vietnamese' },
]

export const TRANSCRIPT_STAGE_LABELS = {
  queued: 'Waiting to start…',
  extracting_audio: 'Extracting the audio track…',
  transcribing: 'Transcribing the audio…',
  formatting: 'Formatting the transcript…',
}

const TIMESTAMP_PATTERN = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/

export function defaultTranscriptLanguage() {
  const code = (navigator.language || '').slice(0, 2).toLowerCase()
  return TRANSCRIPT_LANGUAGES.some((language) => language.code === code)
    ? code
    : 'en'
}

export function isSupportedTranscriptLanguage(code) {
  return TRANSCRIPT_LANGUAGES.some((language) => language.code === code)
}

export function parseTranscriptParagraphs(text) {
  const paragraphs = []

  for (const rawLine of (text || '').split(/\n+/)) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(TIMESTAMP_PATTERN)
    if (match) {
      paragraphs.push({ timestamp: match[1], text: match[2] })
    } else if (paragraphs.length) {
      paragraphs[paragraphs.length - 1].text =
        `${paragraphs[paragraphs.length - 1].text} ${line}`.trim()
    } else {
      paragraphs.push({ timestamp: null, text: line })
    }
  }

  return paragraphs
}
