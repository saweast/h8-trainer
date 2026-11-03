import { Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Chip } from '@/components/common/Chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EQUIPMENT, MUSCLE_GROUPS, type Equipment, type MuscleGroup } from '@/data/exercises'
import { useMode } from '@/features/mode/modeContext'
import { parseWeight } from '@/lib/format'
import { exerciseDefaults, useCreateExercise, useSaveExerciseSettings, type Exercise } from './api'

interface CreateExerciseFormProps {
  initialName?: string
  /** Own athlete id, to store personal machine setup notes. */
  athleteId?: string
  onCreated: (exercise: Exercise) => void
}

export function CreateExerciseForm({ initialName = '', athleteId, onCreated }: CreateExerciseFormProps) {
  const { t } = useTranslation()
  const { isTrainer } = useMode()
  const create = useCreateExercise()
  const saveSettings = useSaveExerciseSettings(athleteId)

  const [name, setName] = useState(initialName)
  const [equipment, setEquipment] = useState<Equipment>('machine')
  const [muscle, setMuscle] = useState<MuscleGroup>('legs')
  const defaults = exerciseDefaults(equipment, muscle)
  const [step, setStep] = useState<string | null>(null)
  const [rest, setRest] = useState<string | null>(null)
  const [setup, setSetup] = useState('')
  const [nameError, setNameError] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError(true)
      return
    }
    const weightStepKg = parseWeight(step ?? String(defaults.weightStepKg)) || defaults.weightStepKg
    const restParsed = Number.parseInt(rest ?? String(defaults.defaultRestS), 10)
    const defaultRestS = Number.isFinite(restParsed) ? Math.min(Math.max(restParsed, 0), 1800) : defaults.defaultRestS
    try {
      const exercise = await create.mutateAsync({ name, muscle, equipment, weightStepKg, defaultRestS })
      if (setup.trim() && athleteId) {
        saveSettings.mutate({ exerciseId: exercise.id, setupNotes: setup, restS: null })
      }
      onCreated(exercise)
    } catch {
      toast.error(t('exerciseForm.error'))
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exercise-name">{t('exerciseForm.name')}</Label>
        <Input
          id="exercise-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNameError(false)
          }}
          placeholder={t('exerciseForm.namePlaceholder')}
          maxLength={80}
          aria-invalid={nameError}
          className="h-11 rounded-xl"
        />
        {nameError ? <p className="text-xs text-destructive">{t('exerciseForm.nameRequired')}</p> : null}
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t('exerciseForm.type')}</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((eq) => (
            <Chip key={eq} active={equipment === eq} onClick={() => setEquipment(eq)}>
              {t(`equipment.${eq}`)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t('exerciseForm.muscle')}</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((m) => (
            <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
              {t(`muscle.${m}`)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exercise-step">{t('exerciseForm.weightStep')}</Label>
          <Input
            id="exercise-step"
            inputMode="decimal"
            value={step ?? String(defaults.weightStepKg)}
            onChange={(e) => setStep(e.target.value)}
            className="tabular h-11 rounded-xl"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exercise-rest">{t('exerciseForm.rest')}</Label>
          <Input
            id="exercise-rest"
            inputMode="numeric"
            value={rest ?? String(defaults.defaultRestS)}
            onChange={(e) => setRest(e.target.value.replace(/\D/g, ''))}
            className="tabular h-11 rounded-xl"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exercise-setup">{t('workout.setupNotes')}</Label>
        <Input
          id="exercise-setup"
          value={setup}
          onChange={(e) => setSetup(e.target.value)}
          placeholder={t('workout.setupPlaceholder')}
          maxLength={200}
          className="h-11 rounded-xl"
        />
      </div>

      {isTrainer ? (
        <p className="flex items-center gap-2 rounded-xl bg-trainer-muted px-3 py-2 text-xs text-trainer-text">
          <Users className="size-4" aria-hidden />
          {t('exerciseForm.sharedHint')}
        </p>
      ) : null}

      <Button type="submit" size="xl" disabled={create.isPending}>
        {t('exerciseForm.save')}
      </Button>
    </form>
  )
}
