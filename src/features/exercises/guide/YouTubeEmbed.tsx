import { ExternalLink, Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { youtubeEmbedUrl, youtubeThumbUrl, youtubeWatchUrl } from '@/lib/youtube'

/**
 * A preview image that turns into the YouTube player on tap, so nothing from YouTube loads
 * until the user asks for it (youtube-nocookie domain for the player itself).
 */
export function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(videoId)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={t('guide.play')}
            className="group absolute inset-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <img src={youtubeThumbUrl(videoId)} alt="" loading="lazy" className="size-full object-cover opacity-90" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-14 place-items-center rounded-full bg-black/70 text-white transition-transform group-hover:scale-105">
                <Play className="ml-0.5 size-6 fill-current" aria-hidden />
              </span>
            </span>
          </button>
        )}
      </div>
      <a
        href={youtubeWatchUrl(videoId)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ExternalLink className="size-4" aria-hidden />
        {t('guide.openYoutube')}
      </a>
    </div>
  )
}
