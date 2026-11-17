import { Ban, Heart, Plus, Search, StickyNote, Trash2, X } from 'lucide-react'
import { useDeferredValue, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { MUSCLE_GROUPS, exerciseName, namesMatch } from '@/data/exercises'
import { useExerciseMap, useExercises } from '@/features/exercises/api'
import { currentLanguage } from '@/i18n'
import { cn } from '@/lib/utils'
import { useClientNotes, useDeleteClientNote, useSaveClientNote, type ClientNote, type NoteDraft, type NoteKind } from './api'

const COLLAPSED = 3

/** The trainer's private notes on the client page: wishes, what to avoid, what they like. */
export function ClientNotes({ athleteId }: { athleteId: string }) {
  const { t } = useTranslation()
  const { data: notes, isPending } = useClientNotes(athleteId)
  const [editing, setEditing] = useState<ClientNote | 'new' | null>(null)
  const [expanded, setExpanded] = useState(false)

  // restrictions first: they matter most when picking exercises
  const sorted = useMemo(() => {
    const order: Record<NoteKind, number> = { avoid: 0, prefer: 1, note: 2 }
    return [...(notes ?? [])].sort((a, b) => order[a.kind] - order[b.kind])
  }, [notes])
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED)

  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 py-1 pr-1 pl-4">
        <h2 className="flex-1 text-[15px] font-medium">{t('notes.title')}</h2>
        <Button variant="ghost" size="icon-touch" aria-label={t('notes.add')} onClick={() => setEditing('new')}>
          <Plus />
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="mx-4 mb-3 h-10 rounded-xl" />
      ) : sorted.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="w-full px-4 pb-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('notes.empty')}
        </button>
      ) : (
        <>
          <ul className="divide-y border-t">
            {shown.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setEditing(n)}
                  className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
                >
                  <NoteIcon kind={n.kind} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <NoteTarget note={n} />
                    {n.body ? <span className="line-clamp-3 text-sm whitespace-pre-line">{n.body}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {sorted.length > COLLAPSED ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="w-full border-t px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? t('notes.showLess') : t('notes.showAll', { count: sorted.length })}
            </button>
          ) : null}
        </>
      )}
      <NoteDrawer athleteId={athleteId} note={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

export function NoteIcon({ kind, className }: { kind: NoteKind; className?: string }) {
  const Icon = kind === 'avoid' ? Ban : kind === 'prefer' ? Heart : StickyNote
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-4 shrink-0',
        kind === 'avoid' ? 'text-danger-text' : kind === 'prefer' ? 'text-lime-text' : 'text-muted-foreground',
        className,
      )}
    />
  )
}

/** "Avoid · Bench press" — the kind and what it is about, when it's about something. */
export function NoteTarget({ note }: { note: ClientNote }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { map: exercises } = useExerciseMap()
  if (note.kind === 'note') return null
  const exercise = note.exerciseId ? exercises.get(note.exerciseId) : undefined
  const target = exercise ? exerciseName(exercise, lang) : note.muscle ? t(`muscle.${note.muscle}`) : null
  return (
    <span className={cn('block text-xs font-medium', note.kind === 'avoid' ? 'text-danger-text' : 'text-lime-text')}>
      {t(`notes.kind.${note.kind}`)}
      {target ? ` · ${target}` : ''}
    </span>
  )
}

function NoteDrawer({ athleteId, note, onClose }: { athleteId: string; note: ClientNote | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Drawer open={note !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="font-heading text-lg">{note === 'new' ? t('notes.add') : t('notes.edit')}</DrawerTitle>
          <DrawerDescription>{t('notes.private')}</DrawerDescription>
        </DrawerHeader>
        {/* keyed so every open starts from that note */}
        {note ? <NoteForm key={note === 'new' ? 'new' : note.id} athleteId={athleteId} note={note === 'new' ? null : note} onDone={onClose} /> : null}
      </DrawerContent>
    </Drawer>
  )
}

function NoteForm({ athleteId, note, onDone }: { athleteId: string; note: ClientNote | null; onDone: () => void }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const save = useSaveClientNote(athleteId)
  const remove = useDeleteClientNote(athleteId)
  const { data: exercises } = useExercises()
  const [draft, setDraft] = useState<NoteDraft>(
    note ? { kind: note.kind, exerciseId: note.exerciseId, muscle: note.muscle, body: note.body } : { kind: 'note', exerciseId: null, muscle: null, body: '' },
  )
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const targeted = draft.kind !== 'note'
  const selectedExercise = draft.exerciseId ? exercises?.find((e) => e.id === draft.exerciseId) : undefined
  const matches = useMemo(() => {
    if (!deferredQuery.trim()) return []
    return (exercises ?? [])
      .filter((e) => namesMatch([exerciseName(e, 'uk'), exerciseName(e, 'en')], deferredQuery))
      .sort((a, b) => exerciseName(a, lang).localeCompare(exerciseName(b, lang), lang))
      .slice(0, 6)
  }, [exercises, deferredQuery, lang])

  const valid = draft.body.trim().length > 0 || (targeted && Boolean(draft.exerciseId || draft.muscle))
  const busy = save.isPending || remove.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    save.mutate({ id: note?.id ?? null, draft }, { onSuccess: onDone, onError: () => toast.error(t('notes.saveError')) })
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <SegmentedControl<NoteKind>
        ariaLabel={t('notes.kindLabel')}
        value={draft.kind}
        onChange={(kind) => setDraft({ ...draft, kind })}
        options={[
          { value: 'note', label: t('notes.kind.note') },
          { value: 'avoid', label: t('notes.kind.avoid') },
          { value: 'prefer', label: t('notes.kind.prefer') },
        ]}
      />

      {targeted ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t('notes.targetHint')}</p>
          {selectedExercise ? (
            <div className="flex h-11 items-center gap-2 rounded-xl bg-secondary pr-1 pl-3.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{exerciseName(selectedExercise, lang)}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={t('notes.clearExercise')} onClick={() => setDraft({ ...draft, exerciseId: null })}>
                <X />
              </Button>
            </div>
          ) : (
            <>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {MUSCLE_GROUPS.map((m) => (
                  <Chip key={m} active={draft.muscle === m} onClick={() => setDraft({ ...draft, muscle: draft.muscle === m ? null : m })}>
                    {t(`muscle.${m}`)}
                  </Chip>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('notes.exerciseSearch')}
                  aria-label={t('notes.exerciseSearch')}
                  className="h-11 rounded-xl pl-10"
                />
              </div>
              {matches.length ? (
                <ul className="divide-y rounded-xl border">
                  {matches.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({ ...draft, exerciseId: e.id, muscle: null })
                          setQuery('')
                        }}
                        className="flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left transition-colors hover:bg-secondary/50"
                      >
                        <span className="truncate text-sm font-medium">{exerciseName(e, lang)}</span>
                        <span className="text-xs text-muted-foreground">{t(`muscle.${e.muscle}`)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <Textarea
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        placeholder={t(`notes.placeholder.${draft.kind}`)}
        aria-label={t('notes.bodyLabel')}
        maxLength={1000}
        rows={3}
        className="min-h-24 rounded-xl"
      />

      <Button type="submit" size="xl" disabled={busy || !valid}>
        {t('common.save')}
      </Button>
      {note ? (
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="text-danger-text"
          disabled={busy}
          onClick={() => remove.mutate(note.id, { onSuccess: onDone, onError: () => toast.error(t('notes.saveError')) })}
        >
          <Trash2 aria-hidden />
          {t('notes.delete')}
        </Button>
      ) : null}
    </form>
  )
}
