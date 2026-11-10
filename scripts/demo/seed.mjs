// Demo data for recording the flow videos — local Supabase only (see env.mjs).
// Run after `supabase db reset`: npm run demo:seed
//
// Cast
//   Олена Коваль   trainer
//   Андрій Мельник client with an account: history, an active week plan (2 weeks done, with
//                  feedback the trainer hasn't read yet), a package (10, 6 used), a gym membership
//   Ірина Бондар   client with an account: package almost used up (expiring filter)
//   Марко Ткач     offline client of Олена with history, plus a separate fresh account that
//                  accepts the invite in the invite flow
//   Софія Литвин   solo user, no trainer: 4 weeks of history, body measurements
//   Тарас Шевчук   plain user who becomes a trainer in the admin flow
//   Адмін h8       admin
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env.mjs'

export const CAST = {
  olena: { email: 'olena@demo.h8', name: 'Олена Коваль' },
  andrii: { email: 'andrii@demo.h8', name: 'Андрій Мельник' },
  iryna: { email: 'iryna@demo.h8', name: 'Ірина Бондар' },
  marko: { email: 'marko@demo.h8', name: 'Марко Ткач' },
  sofia: { email: 'sofia@demo.h8', name: 'Софія Литвин' },
  taras: { email: 'taras@demo.h8', name: 'Тарас Шевчук' },
  admin: { email: 'admin@demo.h8', name: 'Адмін h8' },
}

const { url, anonKey, serviceKey } = localEnv()
// Realtime is never used here; Node 20 has no global WebSocket, so give it an inert transport.
const opts = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: class NoRealtime {} } }
const admin = createClient(url, serviceKey, opts)

async function must(promise, what) {
  const { data, error } = await promise
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

const uuid = () => crypto.randomUUID()

/** n days ago at hh:mm local time */
function day(n, hh = 18, mm = 0) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hh, mm, 0, 0)
  return d
}
const isoDate = (d) => d.toISOString().slice(0, 10)
const plusMinutes = (d, m) => new Date(d.getTime() + m * 60_000)

/** "20x10w, 50x5w, 80x8x3" → [{w, r, warmup}] (w = warm-up marker, bodyweight "0x12x4") */
function S(text) {
  return text.split(',').flatMap((tok) => {
    const t = tok.trim()
    const warmup = t.endsWith('w')
    const [w, r, n = 1] = t.replace(/w$/, '').split('x').map(Number)
    return Array.from({ length: n }, () => ({ w, r, ...(warmup ? { warmup: true } : {}) }))
  })
}

async function createUser({ email, name }) {
  const created = await must(
    admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: name } }),
    `create ${email}`,
  )
  const db = createClient(url, anonKey, opts)
  await must(db.auth.signInWithPassword({ email, password: DEMO_PASSWORD }), `sign in ${email}`)
  const [athlete] = await must(admin.from('athletes').select('id').eq('user_id', created.user.id), 'athlete')
  return { id: created.user.id, athleteId: athlete.id, db, name }
}

let EX = new Map()
const ex = (slug) => {
  const id = EX.get(slug)
  if (!id) throw new Error(`unknown exercise ${slug}`)
  return id
}

/**
 * Inserts a finished workout as `by` (RLS applies, so charging a package needs the trainer).
 * exercises: [{ slug, sets: 'spec', rowId?, difficulty?, feedback? }]
 */
async function workout(by, { athleteId, title, start, minutes = 65, membershipId = null, plan = null, exercises }) {
  const id = uuid()
  await must(
    by.db.from('workouts').insert({
      id,
      athlete_id: athleteId,
      title,
      started_at: start.toISOString(),
      finished_at: plusMinutes(start, minutes).toISOString(),
      membership_id: membershipId,
      created_by: by.id,
      ...(plan ? { plan_id: plan.planId, plan_day_id: plan.dayId, plan_week: plan.week } : {}),
    }),
    `workout ${title}`,
  )
  const wes = exercises.map((e, i) => ({ id: uuid(), workout_id: id, exercise_id: ex(e.slug), position: i, plan_row_id: e.rowId ?? null }))
  await must(by.db.from('workout_exercises').insert(wes), 'workout exercises')
  let minute = 3
  const sets = exercises.flatMap((e, i) =>
    S(e.sets).map((s, j) => ({
      workout_exercise_id: wes[i].id,
      position: j + 1,
      weight_kg: s.w,
      reps: s.r,
      is_warmup: Boolean(s.warmup),
      completed_at: plusMinutes(start, (minute += 2)).toISOString(),
    })),
  )
  await must(by.db.from('sets').insert(sets), 'sets')
  return { id, exerciseIds: wes.map((w) => w.id) }
}

async function feedback(by, workoutExerciseId, difficulty, text = null) {
  await must(
    by.db.from('workout_exercises').update({ difficulty, athlete_feedback: text }).eq('id', workoutExerciseId),
    'feedback',
  )
}

export async function seed() {
  EX = new Map((await must(admin.from('exercises').select('id, slug').not('slug', 'is', null), 'catalog')).map((e) => [e.slug, e.id]))

  const u = {}
  for (const [key, person] of Object.entries(CAST)) u[key] = await createUser(person)
  const { olena, andrii, iryna, sofia, admin: adminUser } = u

  await must(admin.from('profiles').update({ can_be_trainer: true, is_trainer: true }).eq('id', olena.id), 'trainer')
  await must(admin.from('profiles').update({ is_admin: true }).eq('id', adminUser.id), 'admin')
  await must(
    admin.from('trainer_athletes').insert([
      { trainer_id: olena.id, athlete_id: andrii.athleteId, created_at: day(45).toISOString() },
      { trainer_id: olena.id, athlete_id: iryna.athleteId, created_at: day(30).toISOString() },
    ]),
    'links',
  )

  // Софія: solo, 4 weeks, two alternating days ---------------------------------------------
  const benchW = [40, 42.5, 45, 47.5]
  const squatW = [50, 52.5, 55, 57.5]
  for (let i = 0; i < 4; i++) {
    await workout(sofia, {
      athleteId: sofia.athleteId,
      title: 'Верх',
      start: day(26 - i * 7, 8, 30),
      minutes: 55,
      exercises: [
        { slug: 'barbell_bench_press', sets: `20x12w, ${benchW[i]}x8x3` },
        { slug: 'dumbbell_row', sets: `${12 + i * 2}x10x3` },
        { slug: 'lateral_raise', sets: `${5 + (i > 1 ? 1 : 0)}x15x3` },
      ],
    })
    await workout(sofia, {
      athleteId: sofia.athleteId,
      title: 'Ноги',
      start: day(23 - i * 7, 8, 30),
      minutes: 60,
      exercises: [
        { slug: 'back_squat', sets: `20x10w, ${squatW[i]}x8x3` },
        { slug: 'romanian_deadlift', sets: `${40 + i * 5}x10x3` },
        { slug: 'leg_extension', sets: `${25 + i * 5}x12x3` },
      ],
    })
  }
  await must(
    sofia.db.from('body_measurements').insert(
      [63.8, 63.4, 63.1, 62.6, 62.2].map((w, i) => ({
        athlete_id: sofia.athleteId,
        measured_at: isoDate(day(28 - i * 7)),
        weight_kg: w,
        waist_cm: 71 - i * 0.6,
        hips_cm: 98 - i * 0.3,
        created_by: sofia.id,
      })),
    ),
    'body',
  )
  await must(
    sofia.db.from('memberships').insert({
      athlete_id: sofia.athleteId,
      kind: 'gym',
      title: 'Sport Life · безліміт',
      starts_on: isoDate(day(5)),
      ends_on: isoDate(day(-25)),
      paid_on: isoDate(day(5)),
      created_by: sofia.id,
    }),
    'sofia gym',
  )

  // Олена's templates ----------------------------------------------------------------------
  await must(
    olena.db.rpc('save_template', {
      p_id: null,
      p_name: 'Верх А',
      p_notes: 'Темп 2-0-2, відпочинок між робочими 2 хв',
      p_items: [
        { exercise_id: ex('barbell_bench_press'), sets: S('20x10w, 40x5w, 60x8x3'), rest_s: 120 },
        { exercise_id: ex('lat_pulldown'), sets: S('30x12w, 45x10x3'), rest_s: 90 },
        { exercise_id: ex('seated_dumbbell_press'), sets: S('10x10w, 14x10x3'), rest_s: 90 },
        { exercise_id: ex('triceps_pushdown'), sets: S('20x12x3'), rest_s: 60 },
      ],
    }),
    'template',
  )

  // Андрій: package, gym, history, plan with two weeks done and unread feedback ------------
  const [pkg] = await must(
    olena.db
      .from('memberships')
      .insert({
        athlete_id: andrii.athleteId,
        kind: 'trainer',
        trainer_id: olena.id,
        title: '10 персональних',
        starts_on: isoDate(day(30)),
        ends_on: isoDate(day(-30)),
        sessions_total: 10,
        paid_on: isoDate(day(30)),
        created_by: olena.id,
      })
      .select('id'),
    'andrii package',
  )
  await must(
    andrii.db.from('memberships').insert({
      athlete_id: andrii.athleteId,
      kind: 'gym',
      title: 'Sport Life · безліміт',
      starts_on: isoDate(day(20)),
      ends_on: isoDate(day(-10)),
      paid_on: isoDate(day(20)),
      created_by: andrii.id,
    }),
    'andrii gym',
  )
  await must(
    andrii.db.from('athlete_exercise_settings').insert({
      athlete_id: andrii.athleteId,
      exercise_id: ex('hack_squat'),
      setup_notes: 'Спинка 3, платформа — середина',
    }),
    'setup',
  )

  // before the plan: four sessions with Олена, charged
  for (const [i, n] of [28, 25, 21, 18].entries()) {
    const legs = i % 2 === 0
    await workout(olena, {
      athleteId: andrii.athleteId,
      title: legs ? 'Ноги + спина' : 'Тяга + плечі',
      start: day(n, 19),
      membershipId: pkg.id,
      exercises: legs
        ? [
            { slug: 'hack_squat', sets: `20x10w, ${70 + i * 2.5}x8x3` },
            { slug: 'close_grip_lat_pulldown', sets: `20x10w, ${30 + i * 2.5}x10x3` },
            { slug: 'leg_extension', sets: `30x12w, ${40 + i * 2.5}x12x3` },
          ]
        : [
            { slug: 'deadlift', sets: `20x10w, 50x6w, ${70 + i * 2.5}x8x3` },
            { slug: 'lateral_raise', sets: '6x10w, 8x12x3' },
            { slug: 'incline_dumbbell_press', sets: `12x10w, ${14 + i}x12x3` },
          ],
    })
  }

  // the plan — the trainer's spreadsheet
  const id = () => uuid()
  const P = {
    plan: id(),
    d1: id(),
    d2: id(),
    hack: id(),
    press: id(),
    pull: id(),
    ext: id(),
    dead: id(),
    raise: id(),
    incline: id(),
    curl: id(),
    abs: id(),
  }
  const cells = (...weeks) => weeks.map((t, i) => ({ week: i + 1, sets: S(t) }))
  await must(
    olena.db.rpc('save_plan', {
      p_id: P.plan,
      p_athlete: andrii.athleteId,
      p_name: 'Хвиля: сила, листопад',
      p_notes: 'Хвиля 3 тижні + розвантаження. Пиши, якщо щось болить.',
      p_weeks: 4,
      p_days: [
        {
          id: P.d1,
          name: '1 тренування',
          rows: [
            { id: P.hack, exercise_id: ex('hack_squat'), rest_s: 150, cells: cells('20x10w, 50x5w, 80x8x3', '20x10w, 50x5w, 80x3w, 85x6x3', '20x10w, 50x5w, 80x4w, 90x5x3', '20x10w, 50x5w, 75x10x3') },
            { id: P.press, exercise_id: ex('seated_dumbbell_press'), rest_s: 90, cells: cells('10x10w, 12x12x3', '10x10w, 14x8x3', '10x10w, 16x8x3', '10x10w, 12x12x3') },
            { id: P.pull, exercise_id: ex('close_grip_lat_pulldown'), rest_s: 90, cells: cells('20x10w, 30x10x3', '20x10w, 35x10x3', '20x10w, 40x10x3', '20x10w, 30x12x3') },
            { id: P.ext, exercise_id: ex('leg_extension'), rest_s: 60, cells: cells('30x12w, 45x12x3', '30x12w, 55x12x3', '30x12w, 55x12x3', '30x12w, 45x12x3') },
          ],
        },
        {
          id: P.d2,
          name: '2 тренування',
          rows: [
            { id: P.dead, exercise_id: ex('deadlift'), rest_s: 180, cells: cells('20x10w, 50x6w, 80x8x3', '20x10w, 50x6w, 80x3w, 90x6x3', '20x10w, 50x6w, 80x4w, 100x3x4', '20x10w, 50x6w, 80x8x3') },
            { id: P.raise, exercise_id: ex('lateral_raise'), rest_s: 60, cells: cells('6x10w, 10x12x3', '6x10w, 10x12x3', '6x10w, 12x8x4', '6x10w, 10x12x3') },
            { id: P.incline, exercise_id: ex('incline_dumbbell_press'), rest_s: 90, cells: cells('12x10w, 16x12x3', '12x10w, 18x10x3', '12x10w, 20x10x3', '12x10w, 16x12x3') },
            { id: P.curl, exercise_id: ex('lying_leg_curl'), rest_s: 60, cells: cells('20x10w, 30x12x3', '20x10w, 35x12x3', '20x10w, 30x12x3', '20x10w, 30x12x3') },
            { id: P.abs, exercise_id: ex('crunch'), rest_s: 45, cells: cells('0x12x4', '0x12x4', '0x14x4', '0x12x4') },
          ],
        },
      ],
    }),
    'plan',
  )

  const day1 = (week, start, by, charged, actual) =>
    workout(by, {
      athleteId: andrii.athleteId,
      title: '1 тренування',
      start,
      membershipId: charged ? pkg.id : null,
      plan: { planId: P.plan, dayId: P.d1, week },
      exercises: [
        { slug: 'hack_squat', rowId: P.hack, sets: actual.hack },
        { slug: 'seated_dumbbell_press', rowId: P.press, sets: actual.press },
        { slug: 'close_grip_lat_pulldown', rowId: P.pull, sets: actual.pull },
        { slug: 'leg_extension', rowId: P.ext, sets: actual.ext },
      ],
    })
  const day2 = (week, start, by, actual) =>
    workout(by, {
      athleteId: andrii.athleteId,
      title: '2 тренування',
      start,
      plan: { planId: P.plan, dayId: P.d2, week },
      exercises: [
        { slug: 'deadlift', rowId: P.dead, sets: actual.dead },
        { slug: 'lateral_raise', rowId: P.raise, sets: actual.raise },
        { slug: 'incline_dumbbell_press', rowId: P.incline, sets: actual.incline },
        { slug: 'lying_leg_curl', rowId: P.curl, sets: actual.curl },
        { slug: 'crunch', rowId: P.abs, sets: '0x12x4' },
      ],
    })

  await day1(1, day(14, 19), olena, true, {
    hack: '20x10w, 50x5w, 80x8x3',
    press: '10x10w, 12x12x3',
    pull: '20x10w, 30x10x3',
    ext: '30x12w, 45x12x3',
  })
  await day2(1, day(11, 19), andrii, {
    dead: '20x10w, 50x6w, 80x8x3',
    raise: '6x10w, 10x12x3',
    incline: '12x10w, 16x12x3',
    curl: '20x10w, 30x12x3',
  })
  const w2d1 = await day1(2, day(7, 19), olena, true, {
    hack: '20x10w, 50x5w, 80x3w, 85x6x3',
    press: '10x10w, 14x8x3',
    pull: '20x10w, 35x10x3',
    ext: '30x12w, 55x12x3',
  })
  const w2d2 = await day2(2, day(4, 19), andrii, {
    dead: '20x10w, 50x6w, 80x3w, 90x6, 90x5, 90x4',
    raise: '6x10w, 10x12x2, 10x9',
    incline: '12x10w, 18x10x3',
    curl: '20x10w, 35x12x3',
  })

  // Андрій's feedback — unread by Олена
  await feedback(andrii, w2d1.exerciseIds[0], 2, 'Норм, 85 пішло добре')
  await feedback(andrii, w2d2.exerciseIds[0], 3, 'На 3-му підході поплив, спина втомилась')
  await feedback(andrii, w2d2.exerciseIds[1], 2, 'Плече клацає на останніх повторах')
  await must(
    andrii.db.from('plan_comments').insert([
      { plan_id: P.plan, plan_row_id: P.dead, week: 3, body: '100 на 3 — не рано? Спина ще пам’ятає минулий тиждень' },
      { plan_id: P.plan, body: 'Дякую за план! Вівторок і п’ятниця мені підходять' },
    ]),
    'plan comments',
  )
  await must(
    andrii.db.from('workout_comments').insert({ workout_id: w2d2.id, author_id: andrii.id, body: 'Станова важко далась, але дотягнув' }),
    'workout comment',
  )

  // Ірина: package almost used up -----------------------------------------------------------
  const [irynaPkg] = await must(
    olena.db
      .from('memberships')
      .insert({
        athlete_id: iryna.athleteId,
        kind: 'trainer',
        trainer_id: olena.id,
        title: '8 тренувань',
        starts_on: isoDate(day(26)),
        ends_on: isoDate(day(-4)),
        sessions_total: 8,
        paid_on: isoDate(day(26)),
        created_by: olena.id,
      })
      .select('id'),
    'iryna package',
  )
  for (const [i, n] of [25, 22, 19, 15, 12, 8, 5].entries()) {
    await workout(olena, {
      athleteId: iryna.athleteId,
      title: 'Сідниці + ноги',
      start: day(n, 10),
      minutes: 55,
      membershipId: irynaPkg.id,
      exercises: [
        { slug: 'hip_thrust', sets: `40x10w, ${60 + i * 5}x10x3` },
        { slug: 'leg_press', sets: `${80 + i * 5}x12x3` },
        { slug: 'hip_abduction', sets: `${35 + i * 2.5}x15x3` },
      ],
    })
  }

  // Марко: offline client with history (claims it in the invite flow) ----------------------
  const offlineId = await must(olena.db.rpc('create_offline_client', { p_display_name: 'Марко Ткач' }), 'offline client')
  for (const [i, n] of [20, 13, 6].entries()) {
    await workout(olena, {
      athleteId: offlineId,
      title: 'Верх А',
      start: day(n, 20),
      exercises: [
        { slug: 'barbell_bench_press', sets: `20x10w, 40x5w, ${55 + i * 2.5}x8x3` },
        { slug: 'lat_pulldown', sets: `30x12w, ${40 + i * 2.5}x10x3` },
        { slug: 'dumbbell_curl', sets: `${10 + i}x12x3` },
      ],
    })
  }

  return { users: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, { id: v.id, athleteId: v.athleteId }])), andriiPlanId: P.plan, offlineId }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await seed()
  console.log(JSON.stringify(result, null, 2))
}
