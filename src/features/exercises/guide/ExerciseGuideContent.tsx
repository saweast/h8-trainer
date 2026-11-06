import { Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { mediaFor, photoUrls, useExerciseGuide, type ExerciseMedia } from '@/data/exerciseMedia'
import { exerciseName } from '@/data/exercises'
import { useUpdateExerciseGuide } from '@/features/exercises/api'
import { useIsMine } from '@/features/templates/api'
import { currentLanguage } from '@/i18n'
import { cn } from '@/lib/utils'
import { youtubeId, youtubeWatchUrl } from '@/lib/youtube'
import type { GuideExercise } from './model'
import { YouTubeEmbed } from './YouTubeEmbed'

/** Photos, muscles, steps and video of an exercise; used in the guide sheet and on its page. */
export default function ExerciseGuideContent({ exercise }: { exercise: GuideExercise }) {
  const media = mediaFor(exercise.slug)
  return media && exercise.slug ? (
    <CatalogGuide exercise={exercise} slug={exercise.slug} media={media} />
  ) : (
    <CustomGuide exercise={exercise} />
  )
}

function CatalogGuide({ exercise, slug, media }: { exercise: GuideExercise; slug: string; media: ExerciseMedia }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { data: guide, isPending, isError } = useExerciseGuide(slug, lang)
  const name = exerciseName(exercise, lang)

  return (
    <div className="flex flex-col gap-5">
      {media.images ? <Photos slug={slug} /> : null}

      {media.primary.length ? (
        <section aria-label={t('guide.muscles')} className="flex flex-wrap gap-1.5">
          {media.primary.map((m) => (
            <span key={m} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
              {t(`muscleDetail.${m}`)}
            </span>
          ))}
          {media.secondary.map((m) => (
            <span key={m} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              {t(`muscleDetail.${m}`)}
            </span>
          ))}
        </section>
      ) : null}

      {isPending ? (
        <div className="flex flex-col gap-2" aria-label={t('guide.loading')}>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-16" />
        </div>
      ) : isError || !guide ? (
        <p className="text-sm text-muted-foreground">{t('guide.loadError')}</p>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed">{guide.summary}</p>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('guide.howTo')}</h3>
            <ol className="flex flex-col gap-2.5">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>
          {guide.tips.length ? (
            <section className="flex flex-col gap-2 rounded-xl bg-warning-muted p-3">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-warning-text">
                <TriangleAlert className="size-4" aria-hidden />
                {t('guide.tips')}
              </h3>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
                {guide.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {media.video ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('guide.video')}</h3>
          <YouTubeEmbed videoId={media.video.id} title={name} />
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {[media.images ? t('guide.credits') : null, media.video ? t('guide.videoCredit', { channel: media.video.channel }) : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )
}

function Photos({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const urls = photoUrls(slug)
  const [open, setOpen] = useState<'start' | 'end' | null>(null)
  const frames = [
    { key: 'start' as const, label: t('guide.start'), src: urls.start },
    { key: 'end' as const, label: t('guide.end'), src: urls.end },
  ]
  const zoomed = frames.find((f) => f.key === open)

  if (zoomed) {
    return (
      <figure className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(null)}
          aria-label={zoomed.label}
          className="overflow-hidden rounded-xl bg-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <img src={zoomed.src} alt={zoomed.label} className="w-full object-contain" />
        </button>
        <figcaption className="text-center text-xs text-muted-foreground">{zoomed.label}</figcaption>
      </figure>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {frames.map((f) => (
        <figure key={f.key} className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(f.key)}
            aria-label={t('guide.enlarge', { label: f.label })}
            className="overflow-hidden rounded-xl bg-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <img src={f.src} alt={f.label} loading="lazy" className="aspect-[3/2] w-full object-cover" />
          </button>
          <figcaption className="text-center text-xs text-muted-foreground">{f.label}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function CustomGuide({ exercise }: { exercise: GuideExercise }) {
  const { t } = useTranslation()
  const isMine = useIsMine()
  const mine = isMine(exercise.ownerId)
  const [editing, setEditing] = useState(false)
  const videoId = youtubeId(exercise.videoUrl)
  const empty = !exercise.description && !videoId

  if (editing && exercise.id) {
    return <CustomGuideForm exercise={exercise} id={exercise.id} onDone={() => setEditing(false)} />
  }
  return (
    <div className="flex flex-col gap-4">
      {exercise.description ? (
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{exercise.description}</p>
      ) : null}
      {videoId ? <YouTubeEmbed videoId={videoId} title={exercise.name} /> : null}
      {mine ? (
        empty ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4">
            <p className="text-sm text-muted-foreground">{t('guide.emptyOwner')}</p>
            <Button variant="secondary" size="touch" onClick={() => setEditing(true)}>
              <Plus aria-hidden />
              {t('guide.add')}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="touch" className="self-start" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t('guide.edit')}
          </Button>
        )
      ) : null}
    </div>
  )
}

function CustomGuideForm({ exercise, id, onDone }: { exercise: GuideExercise; id: string; onDone: () => void }) {
  const { t } = useTranslation()
  const update = useUpdateExerciseGuide()
  const [description, setDescription] = useState(exercise.description ?? '')
  const [link, setLink] = useState(exercise.videoUrl ?? '')
  const [linkError, setLinkError] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const videoId = link.trim() ? youtubeId(link) : null
    if (link.trim() && !videoId) {
      setLinkError(true)
      return
    }
    try {
      await update.mutateAsync({ id, description, videoUrl: videoId ? youtubeWatchUrl(videoId) : null })
      toast.success(t('guide.saved'))
      onDone()
    } catch {
      toast.error(t('guide.saveError'))
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="guide-description">{t('guide.description')}</Label>
        <Textarea
          id="guide-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('guide.descriptionPlaceholder')}
          maxLength={1000}
          rows={5}
          className="rounded-xl text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="guide-video">{t('guide.videoUrl')}</Label>
        <Input
          id="guide-video"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setLinkError(false)
          }}
          placeholder={t('guide.videoUrlPlaceholder')}
          maxLength={200}
          aria-invalid={linkError}
          className={cn('h-11 rounded-xl')}
        />
        {linkError ? <p className="text-xs text-destructive">{t('guide.videoUrlInvalid')}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="touch" onClick={onDone}>
          {t('guide.cancel')}
        </Button>
        <Button type="submit" size="touch" disabled={update.isPending}>
          {t('guide.save')}
        </Button>
      </div>
    </form>
  )
}
