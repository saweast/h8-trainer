const ID = /^[\w-]{11}$/
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'])

/**
 * The video id of a YouTube link (watch, youtu.be, shorts, embed, live), or null for anything
 * else — including look-alike hosts such as youtube.com.evil.io.
 */
export function youtubeId(input: string | null | undefined): string | null {
  if (!input) return null
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!HOSTS.has(url.hostname.toLowerCase())) return null

  let id: string | null = null
  if (url.hostname.endsWith('youtu.be')) {
    id = url.pathname.split('/')[1] ?? null
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v')
  } else {
    const [, kind, value] = url.pathname.split('/')
    if (kind === 'shorts' || kind === 'embed' || kind === 'live' || kind === 'v') id = value ?? null
  }
  return id && ID.test(id) ? id : null
}

/** The canonical https link the database accepts (see the exercises.video_url check). */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`
}

export function youtubeThumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}
