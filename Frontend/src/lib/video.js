const VIDEO_URL_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com']

function hostOf(value) {
  return new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, '')
}

export function validateVideoUrl(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return null

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'Enter a valid YouTube or Vimeo URL.'
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Enter a valid YouTube or Vimeo URL.'
  }

  const host = hostOf(trimmed)
  const supported = VIDEO_URL_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  )

  return supported ? null : 'Only YouTube and Vimeo links are supported.'
}

export function toEmbedUrl(value) {
  if (!value) return null

  try {
    const parsed = new URL(value.trim())
    const host = hostOf(value)

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const id =
        parsed.searchParams.get('v') ||
        parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const id = parsed.pathname.match(/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }

    return null
  } catch {
    return null
  }
}
