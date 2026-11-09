// @vitest-environment node
/**
 * Runs every migration in an in-memory Postgres (PGlite) with a tiny Supabase auth stub, then
 * checks the security model as real users would hit it: role `authenticated` + JWT `sub`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildSeedSql, readCatalog } from '../../scripts/gen-exercise-seed.mjs'

const here = import.meta.dirname
const migrationsDir = join(here, '..', 'migrations')

let db: PGlite

type Row = Record<string, unknown>

/** Runs `fn` as a signed-in user inside a transaction (committed on success). */
async function asUser<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
    return fn(tx)
  })
}

async function rows<T extends Row = Row>(tx: Transaction | PGlite, sql: string, params: unknown[] = []) {
  return (await tx.query<T>(sql, params)).rows
}

async function createUser(name: string): Promise<{ userId: string; athleteId: string }> {
  const [user] = await rows<{ id: string }>(
    db,
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${name.toLowerCase()}@example.com`, JSON.stringify({ full_name: name, avatar_url: `https://img/${name}` })],
  )
  const [athlete] = await rows<{ id: string }>(db, `select id from public.athletes where user_id = $1`, [user.id])
  return { userId: user.id, athleteId: athlete.id }
}

let anna: { userId: string; athleteId: string } // athlete with account
let bohdan: { userId: string; athleteId: string } // unrelated athlete
let trainer: { userId: string; athleteId: string }
let offlineId: string // trainer's client without account
let packageId: string
let chargedWorkoutId: string
let benchId: string

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'))
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  anna = await createUser('Anna')
  bohdan = await createUser('Bohdan')
  trainer = await createUser('Olena')
  const [bench] = await rows<{ id: string }>(db, `select id from public.exercises where slug = 'barbell_bench_press'`)
  benchId = bench.id
}, 60_000)

describe('migrations', () => {
  it('seed file matches the exercise catalog', () => {
    const file = readdirSync(migrationsDir).find((f) => f.endsWith('_seed_exercises.sql'))!
    expect(readFileSync(join(migrationsDir, file), 'utf8')).toBe(buildSeedSql(readCatalog()))
  })

  it('seeds the global catalog', async () => {
    const [{ count }] = await rows<{ count: number }>(db, `select count(*)::int as count from public.exercises`)
    expect(count).toBe(readCatalog().length)
  })

  it('creates a profile and own athlete for every new user', async () => {
    const [profile] = await rows(db, `select display_name, avatar_url, is_trainer from public.profiles where id = $1`, [
      anna.userId,
    ])
    expect(profile).toEqual({ display_name: 'Anna', avatar_url: 'https://img/Anna', is_trainer: false })
    expect(anna.athleteId).toBeTruthy()
  })
})

describe('hardening', () => {
  it('keeps RLS helpers and trigger functions out of the public API schema', async () => {
    const exposed = await rows<{ proname: string }>(
      db,
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' order by p.proname`,
    )
    expect(exposed.map((r) => r.proname)).toEqual([
      'admin_athlete_workouts',
      'admin_set_can_be_trainer',
      'admin_trainer_clients',
      'admin_users',
      'admin_workout',
      'claim_invite',
      'copy_plan',
      'create_offline_client',
      'create_plan_from_templates',
      'exercise_records',
      'get_invite',
      'last_performance',
      'next_plan_slot',
      'next_program_template',
      'save_plan',
      'save_program',
      'save_template',
      'start_workout_from_plan',
      'start_workout_from_template',
      'trainer_clients_overview',
      'trainer_feedback_feed',
    ])
  })

  it('lets only the owner edit template exercises', async () => {
    const templateId = await asUser(anna.userId, async (tx) => {
      const [t] = await rows<{ id: string }>(tx, `insert into public.templates (name) values ('День A') returning id`)
      await tx.query(`insert into public.template_exercises (template_id, exercise_id, position) values ($1, $2, 0)`, [
        t.id,
        benchId,
      ])
      return t.id
    })
    await expect(
      asUser(bohdan.userId, (tx) =>
        tx.query(`insert into public.template_exercises (template_id, exercise_id, position) values ($1, $2, 1)`, [
          templateId,
          benchId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/)
    const updated = await asUser(bohdan.userId, (tx) =>
      tx.query(`update public.template_exercises set target_sets = 9 where template_id = $1`, [templateId]),
    )
    expect(updated.affectedRows).toBe(0)
  })
})

describe('anonymous access', () => {
  it('cannot read any table', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query('select * from public.exercises')
      }),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('athlete isolation', () => {
  it('lets an athlete log their own workout', async () => {
    const result = await asUser(anna.userId, async (tx) => {
      const [w] = await rows<{ id: string }>(tx, `insert into public.workouts (athlete_id, title) values ($1, 'Груди') returning id`, [
        anna.athleteId,
      ])
      const [we] = await rows<{ id: string }>(
        tx,
        `insert into public.workout_exercises (workout_id, exercise_id, position) values ($1, $2, 0) returning id`,
        [w.id, benchId],
      )
      await tx.query(
        `insert into public.sets (workout_exercise_id, position, weight_kg, reps, completed_at)
         values ($1, 1, 80, 8, now()), ($1, 2, 85, 6, now()), ($1, 3, 90, 3, null)`,
        [we.id],
      )
      await tx.query(`update public.workouts set finished_at = now() where id = $1`, [w.id])
      return rows(tx, `select created_by from public.workouts where id = $1`, [w.id])
    })
    expect(result[0].created_by).toBe(anna.userId)
  })

  it('hides other athletes and their workouts', async () => {
    await asUser(bohdan.userId, async (tx) => {
      expect(await rows(tx, `select id from public.athletes`)).toEqual([{ id: bohdan.athleteId }])
      expect(await rows(tx, `select id from public.workouts where athlete_id = $1`, [anna.athleteId])).toEqual([])
      expect(await rows(tx, `select id from public.profiles where id = $1`, [anna.userId])).toEqual([])
    })
  })

  it("refuses to write into someone else's log", async () => {
    await expect(
      asUser(bohdan.userId, (tx) => tx.query(`insert into public.workouts (athlete_id) values ($1)`, [anna.athleteId])),
    ).rejects.toThrow(/row-level security/)
  })

  it('does not let users re-point their athlete row', async () => {
    await expect(
      asUser(anna.userId, (tx) => tx.query(`update public.athletes set user_id = null where id = $1`, [anna.athleteId])),
    ).rejects.toThrow(/permission denied/)
  })

  it('protects the global catalog and custom exercises', async () => {
    await asUser(anna.userId, async (tx) => {
      const updated = await tx.query(`update public.exercises set name = 'hacked' where slug = 'deadlift'`)
      expect(updated.affectedRows).toBe(0)
      await tx.query(
        `insert into public.exercises (name, muscle_group, equipment, owner_id) values ('Жим Hammer', 'chest', 'machine', $1)`,
        [anna.userId],
      )
    })
    await asUser(bohdan.userId, async (tx) => {
      expect(await rows(tx, `select id from public.exercises where name = 'Жим Hammer'`)).toEqual([])
    })
  })

  it('computes records and last performance', async () => {
    await asUser(anna.userId, async (tx) => {
      const [rec] = await rows(tx, `select * from public.exercise_records($1)`, [anna.athleteId])
      expect(rec).toMatchObject({ exercise_id: benchId, best_weight_kg: '85.00', best_reps: 8 })
      expect(Number(rec.best_e1rm_kg)).toBe(102) // max(80·(1+8/30)=101.3, 85·1.2=102)
      const last = await rows(tx, `select position, weight_kg, reps from public.last_performance($1, $2)`, [
        anna.athleteId,
        benchId,
      ])
      expect(last).toEqual([
        { position: 1, weight_kg: '80.00', reps: 8 },
        { position: 2, weight_kg: '85.00', reps: 6 },
      ])
    })
  })
})

describe('trainer flow', () => {
  it('only trainers can add offline clients', async () => {
    await expect(asUser(anna.userId, (tx) => tx.query(`select public.create_offline_client('X')`))).rejects.toThrow(
      /only trainers/,
    )
    // Becoming a trainer needs the admin's permission (granted here as the service role).
    await db.query(`update public.profiles set can_be_trainer = true where id = $1`, [trainer.userId])
    offlineId = await asUser(trainer.userId, async (tx) => {
      await tx.query(`update public.profiles set is_trainer = true where id = $1`, [trainer.userId])
      const [r] = await rows<{ id: string }>(tx, `select public.create_offline_client('Анна (офлайн)') as id`)
      return r.id
    })
    expect(offlineId).toBeTruthy()
  })

  it('sells a package and charges a workout to it', async () => {
    await asUser(trainer.userId, async (tx) => {
      const [m] = await rows<{ id: string }>(
        tx,
        `insert into public.memberships (athlete_id, kind, trainer_id, sessions_total, starts_on, ends_on)
         values ($1, 'trainer', $2, 12, current_date, current_date + 30) returning id`,
        [offlineId, trainer.userId],
      )
      packageId = m.id
      const [w] = await rows<{ id: string }>(
        tx,
        `insert into public.workouts (athlete_id, title, membership_id, finished_at)
         values ($1, 'Ноги', $2, now()) returning id`,
        [offlineId, packageId],
      )
      chargedWorkoutId = w.id
      const [usage] = await rows(tx, `select sessions_used from public.membership_usage where id = $1`, [packageId])
      expect(usage.sessions_used).toBe(1)
    })
  })

  it('does not let athletes sell themselves trainer packages', async () => {
    await expect(
      asUser(anna.userId, (tx) =>
        tx.query(`insert into public.memberships (athlete_id, kind, trainer_id) values ($1, 'trainer', $2)`, [
          anna.athleteId,
          trainer.userId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/)
    // a gym membership for yourself is fine
    await asUser(anna.userId, (tx) =>
      tx.query(`insert into public.memberships (athlete_id, kind, ends_on) values ($1, 'gym', current_date + 25)`, [
        anna.athleteId,
      ]),
    )
  })

  it('keeps unlinked users out of trainer data', async () => {
    await asUser(bohdan.userId, async (tx) => {
      expect(await rows(tx, `select id from public.memberships where id = $1`, [packageId])).toEqual([])
      expect(await rows(tx, `select * from public.trainer_clients_overview()`)).toEqual([])
    })
  })

  it('only allows invites for own offline clients', async () => {
    await expect(
      asUser(anna.userId, (tx) => tx.query(`insert into public.invites (athlete_id) values (null)`)),
    ).rejects.toThrow(/row-level security/)
    await expect(
      asUser(trainer.userId, (tx) => tx.query(`insert into public.invites (athlete_id) values ($1)`, [anna.athleteId])),
    ).rejects.toThrow(/row-level security/)
  })

  it('moves offline history to the client who accepts the invite', async () => {
    const code = await asUser(trainer.userId, async (tx) => {
      const [i] = await rows<{ code: string }>(tx, `insert into public.invites (athlete_id) values ($1) returning code`, [
        offlineId,
      ])
      return i.code
    })

    await asUser(anna.userId, async (tx) => {
      const [preview] = await rows(tx, `select * from public.get_invite($1)`, [code])
      expect(preview).toMatchObject({ trainer_name: 'Olena', athlete_name: 'Анна (офлайн)', status: 'valid' })
      const [claimed] = await rows(tx, `select public.claim_invite($1) as athlete_id`, [code])
      expect(claimed.athlete_id).toBe(anna.athleteId)
    })

    await asUser(anna.userId, async (tx) => {
      const titles = (await rows<{ title: string }>(tx, `select title from public.workouts order by title`)).map((r) => r.title)
      expect(titles).toEqual(['Груди', 'Ноги'])
      const [pkg] = await rows(tx, `select athlete_id, sessions_used from public.membership_usage where id = $1`, [packageId])
      expect(pkg).toEqual({ athlete_id: anna.athleteId, sessions_used: 1 })
      // the trainer is now visible to the client
      expect(await rows(tx, `select display_name from public.profiles where id = $1`, [trainer.userId])).toEqual([
        { display_name: 'Olena' },
      ])
    })

    const [{ count }] = await rows<{ count: number }>(db, `select count(*)::int as count from public.athletes where id = $1`, [
      offlineId,
    ])
    expect(count).toBe(0)
    await expect(asUser(bohdan.userId, (tx) => tx.query(`select public.claim_invite($1)`, [code]))).rejects.toThrow(
      /invalid or expired/,
    )
  })

  it('shows the client on the trainer dashboard with their last workout', async () => {
    await asUser(trainer.userId, async (tx) => {
      const overview = await rows(tx, `select athlete_id, display_name, has_account, last_workout_title from public.trainer_clients_overview()`)
      expect(overview).toEqual([
        { athlete_id: anna.athleteId, display_name: 'Anna', has_account: true, last_workout_title: 'Ноги' },
      ])
      // linked trainer sees the client's custom exercises
      expect(await rows(tx, `select name from public.exercises where name = 'Жим Hammer'`)).toEqual([{ name: 'Жим Hammer' }])
      // and the client's own gym membership, but trainers can still log for them
      expect((await rows(tx, `select kind from public.memberships where athlete_id = $1 order by kind`, [anna.athleteId])).length).toBe(2)
      await tx.query(`insert into public.workouts (athlete_id, title) values ($1, 'Спина')`, [anna.athleteId])
    })
  })

  it('stops the client from refunding a charged session', async () => {
    await expect(
      asUser(anna.userId, (tx) => tx.query(`update public.workouts set membership_id = null where id = $1`, [chargedWorkoutId])),
    ).rejects.toThrow(/package trainer/)
    await expect(
      asUser(anna.userId, (tx) => tx.query(`update public.workouts set finished_at = null where id = $1`, [chargedWorkoutId])),
    ).rejects.toThrow(/package trainer/)
    const deleted = await asUser(anna.userId, (tx) => tx.query(`delete from public.workouts where id = $1`, [chargedWorkoutId]))
    expect(deleted.affectedRows).toBe(0)
    // ...while the client can still edit the notes of that workout
    await asUser(anna.userId, (tx) => tx.query(`update public.workouts set notes = 'добре' where id = $1`, [chargedWorkoutId]))
  })

  it('lets the trainer move the charge and only to their own packages', async () => {
    await expect(
      asUser(anna.userId, async (tx) => {
        const [w] = await rows<{ id: string }>(tx, `insert into public.workouts (athlete_id) values ($1) returning id`, [anna.athleteId])
        await tx.query(`update public.workouts set membership_id = $1 where id = $2`, [packageId, w.id])
      }),
    ).rejects.toThrow(/own package/)
    await asUser(trainer.userId, (tx) =>
      tx.query(`update public.workouts set membership_id = null where id = $1`, [chargedWorkoutId]),
    )
  })

  it('lets either side remove the link, after which access is gone', async () => {
    await asUser(anna.userId, (tx) => tx.query(`delete from public.trainer_athletes where trainer_id = $1`, [trainer.userId]))
    await asUser(trainer.userId, async (tx) => {
      expect(await rows(tx, `select id from public.workouts where athlete_id = $1`, [anna.athleteId])).toEqual([])
      expect(await rows(tx, `select * from public.trainer_clients_overview()`)).toEqual([])
    })
  })
})

describe('templates and programs', () => {
  let squatId: string
  let templateA: string
  let templateB: string
  let programId: string

  beforeAll(async () => {
    const [squat] = await rows<{ id: string }>(db, `select id from public.exercises where slug = 'back_squat'`)
    squatId = squat.id
  })

  const items = (...list: Record<string, unknown>[]) => JSON.stringify(list)

  it('saves a template atomically and replaces its exercises', async () => {
    templateA = await asUser(anna.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.save_template(null, ' Груди A ', '', $1::jsonb) as id`, [
        items(
          { exercise_id: benchId, target_sets: 3, target_reps_min: 8, target_reps_max: 10, target_weight_kg: 60 },
          { exercise_id: squatId, target_sets: 2, target_reps_max: 5, target_weight_kg: 100 },
        ),
      ])
      return r.id
    })
    await asUser(anna.userId, async (tx) => {
      const [tpl] = await rows(tx, `select name, notes from public.templates where id = $1`, [templateA])
      expect(tpl).toEqual({ name: 'Груди A', notes: null })
      const list = await rows(tx, `select exercise_id, position from public.template_exercises where template_id = $1 order by position`, [
        templateA,
      ])
      expect(list).toEqual([
        { exercise_id: benchId, position: 0 },
        { exercise_id: squatId, position: 1 },
      ])
    })
  })

  it("refuses to overwrite someone else's template", async () => {
    await expect(
      asUser(bohdan.userId, (tx) => tx.query(`select public.save_template($1, 'x', null, '[]'::jsonb)`, [templateA])),
    ).rejects.toThrow(/row-level security|violates/)
  })

  it('starts a workout with sets prefilled from last time, else from targets', async () => {
    const workoutId = await asUser(anna.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.start_workout_from_template($1, $2) as id`, [
        anna.athleteId,
        templateA,
      ])
      return r.id
    })
    await asUser(anna.userId, async (tx) => {
      const [w] = await rows(tx, `select title, template_id, finished_at from public.workouts where id = $1`, [workoutId])
      expect(w).toEqual({ title: 'Груди A', template_id: templateA, finished_at: null })
      const sets = await rows(
        tx,
        `select e.slug, s.position, s.weight_kg, s.reps, s.completed_at
         from public.sets s
         join public.workout_exercises we on we.id = s.workout_exercise_id
         join public.exercises e on e.id = we.exercise_id
         where we.workout_id = $1
         order by we.position, s.position`,
        [workoutId],
      )
      // bench: last time 80×8, 85×6 (90×3 was never completed) → third set repeats the last one
      // squat: never done → template targets
      expect(sets).toEqual([
        { slug: 'barbell_bench_press', position: 1, weight_kg: '80.00', reps: 8, completed_at: null },
        { slug: 'barbell_bench_press', position: 2, weight_kg: '85.00', reps: 6, completed_at: null },
        { slug: 'barbell_bench_press', position: 3, weight_kg: '85.00', reps: 6, completed_at: null },
        { slug: 'back_squat', position: 1, weight_kg: '100.00', reps: 5, completed_at: null },
        { slug: 'back_squat', position: 2, weight_kg: '100.00', reps: 5, completed_at: null },
      ])
      await tx.query(`delete from public.workouts where id = $1`, [workoutId])
    })
  })

  it('starts exact planned sets with warm-ups, ignoring last time', async () => {
    const plan = [
      { w: 20, r: 10, warmup: true },
      { w: 50, r: 5, warmup: true, note: 'повільно' },
      { w: 82.5, r: 8 },
      { w: 82.5, r: 8 },
      { w: 82.5, r: 8 },
    ]
    const tplId = await asUser(anna.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.save_template(null, 'Хвиля', null, $1::jsonb) as id`, [
        items({ exercise_id: benchId, target_sets: 1, target_reps_max: 1, sets: plan }),
      ])
      return r.id
    })
    await asUser(anna.userId, async (tx) => {
      const [te] = await rows(tx, `select target_sets, sets from public.template_exercises where template_id = $1`, [tplId])
      expect(te).toEqual({ target_sets: 3, sets: plan })
      const [w] = await rows<{ id: string }>(tx, `select public.start_workout_from_template($1, $2) as id`, [
        anna.athleteId,
        tplId,
      ])
      const sets = await rows(
        tx,
        `select s.position, s.weight_kg, s.reps, s.is_warmup from public.sets s
         join public.workout_exercises we on we.id = s.workout_exercise_id
         where we.workout_id = $1 order by s.position`,
        [w.id],
      )
      expect(sets).toEqual([
        { position: 1, weight_kg: '20.00', reps: 10, is_warmup: true },
        { position: 2, weight_kg: '50.00', reps: 5, is_warmup: true },
        { position: 3, weight_kg: '82.50', reps: 8, is_warmup: false },
        { position: 4, weight_kg: '82.50', reps: 8, is_warmup: false },
        { position: 5, weight_kg: '82.50', reps: 8, is_warmup: false },
      ])
      const [we] = await rows(tx, `select notes from public.workout_exercises where workout_id = $1`, [w.id])
      expect(we).toEqual({ notes: 'повільно' })
      await tx.query(`delete from public.workouts where id = $1`, [w.id])
    })
  })

  it('rejects malformed planned sets', async () => {
    for (const bad of [[], [{ w: 20 }], [{ w: 20, r: 0 }], [{ w: 2000, r: 5 }], [{ w: 20, r: 5.5 }], [{ w: '20', r: 5 }]]) {
      await expect(
        asUser(anna.userId, (tx) =>
          tx.query(`select public.save_template(null, 'x', null, $1::jsonb)`, [items({ exercise_id: benchId, sets: bad })]),
        ),
      ).rejects.toThrow(/template_exercises_sets_valid/)
    }
  })

  it('cycles through program days and tracks template usage', async () => {
    templateB = await asUser(anna.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.save_template(null, 'Ноги B', null, $1::jsonb) as id`, [
        items({ exercise_id: squatId, target_sets: 3, target_reps_max: 5 }),
      ])
      return r.id
    })
    programId = await asUser(anna.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.save_program(null, 'Сила', $1::uuid[]) as id`, [
        [templateA, templateB],
      ])
      return r.id
    })

    const next = () =>
      asUser(anna.userId, async (tx) => {
        const [r] = await rows<{ id: string }>(tx, `select public.next_program_template($1, $2) as id`, [
          anna.athleteId,
          programId,
        ])
        return r.id
      })
    const doDay = (templateId: string) =>
      asUser(anna.userId, async (tx) => {
        const [r] = await rows<{ id: string }>(tx, `select public.start_workout_from_template($1, $2, $3) as id`, [
          anna.athleteId,
          templateId,
          programId,
        ])
        await tx.query(`update public.workouts set finished_at = now() where id = $1`, [r.id])
      })

    expect(await next()).toBe(templateA)
    await doDay(templateA)
    expect(await next()).toBe(templateB)
    await doDay(templateB)
    expect(await next()).toBe(templateA)

    await asUser(anna.userId, async (tx) => {
      const usage = await rows(tx, `select template_id, times_used from public.template_usage where athlete_id = $1 order by times_used`, [
        anna.athleteId,
      ])
      expect(usage).toEqual(
        expect.arrayContaining([
          { template_id: templateA, times_used: 1 },
          { template_id: templateB, times_used: 1 },
        ]),
      )
    })
  })

  it('only lets owners build programs from their own templates', async () => {
    await expect(
      asUser(bohdan.userId, (tx) => tx.query(`select public.save_program(null, 'x', $1::uuid[])`, [[templateA]])),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('charging template workouts', () => {
  it('lets the package trainer start a charged workout from a template', async () => {
    const { clientId, pkgId, tplId } = await asUser(trainer.userId, async (tx) => {
      const [c] = await rows<{ id: string }>(tx, `select public.create_offline_client('Клієнт з пакетом') as id`)
      const [m] = await rows<{ id: string }>(
        tx,
        `insert into public.memberships (athlete_id, kind, trainer_id, sessions_total) values ($1, 'trainer', $2, 10) returning id`,
        [c.id, trainer.userId],
      )
      const [tpl] = await rows<{ id: string }>(tx, `select public.save_template(null, 'Ноги тренера', null, $1::jsonb) as id`, [
        JSON.stringify([{ exercise_id: benchId, target_sets: 1, target_reps_max: 10, target_weight_kg: 50 }]),
      ])
      return { clientId: c.id, pkgId: m.id, tplId: tpl.id }
    })

    const workoutId = await asUser(trainer.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.start_workout_from_template($1, $2, null, $3) as id`, [
        clientId,
        tplId,
        pkgId,
      ])
      await tx.query(`update public.workouts set finished_at = now() where id = $1`, [r.id])
      return r.id
    })

    await asUser(trainer.userId, async (tx) => {
      const [w] = await rows(tx, `select membership_id, created_by from public.workouts where id = $1`, [workoutId])
      expect(w).toEqual({ membership_id: pkgId, created_by: trainer.userId })
      const [u] = await rows(tx, `select sessions_used from public.membership_usage where id = $1`, [pkgId])
      expect(u.sessions_used).toBe(1)
    })

    // someone else's package can't be charged through the template RPC either
    await expect(
      asUser(anna.userId, (tx) =>
        tx.query(`select public.start_workout_from_template($1, $2, null, $3)`, [anna.athleteId, tplId, pkgId]),
      ),
    ).rejects.toThrow()
  })
})

describe('custom exercise guides', () => {
  it('lets the owner add a description and a YouTube link that linked users can read', async () => {
    const exerciseId = await asUser(trainer.userId, async (tx) => {
      const [e] = await rows<{ id: string }>(
        tx,
        `insert into public.exercises (name, muscle_group, equipment, owner_id, description, video_url)
         values ('Тяга Hammer', 'back', 'machine', $1, 'Груди до подушки.', 'https://youtu.be/rT7DgCr-3pg') returning id`,
        [trainer.userId],
      )
      await tx.query(`update public.exercises set video_url = 'https://www.youtube.com/watch?v=rT7DgCr-3pg' where id = $1`, [e.id])
      return e.id
    })
    await db.query(`insert into public.trainer_athletes (trainer_id, athlete_id) values ($1, $2)`, [
      trainer.userId,
      bohdan.athleteId,
    ])

    await asUser(bohdan.userId, async (tx) => {
      const [e] = await rows(tx, `select description, video_url from public.exercises where id = $1`, [exerciseId])
      expect(e).toEqual({ description: 'Груди до подушки.', video_url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg' })
      const updated = await tx.query(`update public.exercises set description = 'hacked' where id = $1`, [exerciseId])
      expect(updated.affectedRows).toBe(0)
    })
  })

  it('accepts only YouTube links and keeps catalog exercises without them', async () => {
    await expect(
      asUser(trainer.userId, (tx) =>
        tx.query(
          `insert into public.exercises (name, muscle_group, equipment, owner_id, video_url)
           values ('Фішинг', 'back', 'machine', $1, 'https://example.com/watch?v=x')`,
          [trainer.userId],
        ),
      ),
    ).rejects.toThrow()
    await expect(
      asUser(trainer.userId, (tx) =>
        tx.query(
          `insert into public.exercises (name, muscle_group, equipment, owner_id, video_url)
           values ('Схоже', 'back', 'machine', $1, 'https://youtube.com.evil.io/x')`,
          [trainer.userId],
        ),
      ),
    ).rejects.toThrow()
    await expect(db.query(`update public.exercises set description = 'x' where slug = 'deadlift'`)).rejects.toThrow()
  })
})

describe('admin', () => {
  let admin: { userId: string; athleteId: string }
  let coach: { userId: string; athleteId: string }
  let coachClientId: string
  let coachWorkoutId: string

  beforeAll(async () => {
    admin = await createUser('Admin')
    coach = await createUser('Coach')
    await db.query(`update public.profiles set is_admin = true where id = $1`, [admin.userId])
  })

  it('does not let users make themselves trainers or admins', async () => {
    await expect(
      asUser(coach.userId, (tx) => tx.query(`update public.profiles set is_trainer = true where id = $1`, [coach.userId])),
    ).rejects.toThrow(/profiles_trainer_allowed/)
    await expect(
      asUser(coach.userId, (tx) =>
        tx.query(`update public.profiles set can_be_trainer = true where id = $1`, [coach.userId]),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(coach.userId, (tx) => tx.query(`update public.profiles set is_admin = true where id = $1`, [coach.userId])),
    ).rejects.toThrow(/permission denied/)
  })

  it('keeps admin RPCs for admins only', async () => {
    for (const sql of [
      `select * from public.admin_users()`,
      `select public.admin_set_can_be_trainer('${coach.userId}', true)`,
      `select * from public.admin_trainer_clients('${coach.userId}')`,
      `select * from public.admin_athlete_workouts('${coach.athleteId}')`,
      `select public.admin_workout(gen_random_uuid())`,
    ]) {
      await expect(asUser(coach.userId, (tx) => tx.query(sql))).rejects.toThrow(/admins only/)
    }
  })

  it('lets the admin allow a user to become a trainer', async () => {
    await asUser(admin.userId, (tx) => tx.query(`select public.admin_set_can_be_trainer($1, true)`, [coach.userId]))
    coachClientId = await asUser(coach.userId, async (tx) => {
      await tx.query(`update public.profiles set is_trainer = true where id = $1`, [coach.userId])
      const [r] = await rows<{ id: string }>(tx, `select public.create_offline_client('Клієнт Коуча') as id`)
      const [w] = await rows<{ id: string }>(
        tx,
        `insert into public.workouts (athlete_id, title, finished_at) values ($1, 'Ноги', now()) returning id`,
        [r.id],
      )
      const [we] = await rows<{ id: string }>(
        tx,
        `insert into public.workout_exercises (workout_id, exercise_id, position) values ($1, $2, 0) returning id`,
        [w.id, benchId],
      )
      await tx.query(
        `insert into public.sets (workout_exercise_id, position, weight_kg, reps, completed_at) values ($1, 0, 60, 10, now())`,
        [we.id],
      )
      coachWorkoutId = w.id
      return r.id
    })
    expect(coachClientId).toBeTruthy()
  })

  it("shows the admin every user, a trainer's clients and their workouts", async () => {
    await asUser(admin.userId, async (tx) => {
      const users = await rows<{ id: string; can_be_trainer: boolean; is_trainer: boolean; clients_count: number }>(
        tx,
        `select id, can_be_trainer, is_trainer, clients_count from public.admin_users()`,
      )
      expect(users.map((u) => u.id)).toEqual(expect.arrayContaining([anna.userId, bohdan.userId, trainer.userId, coach.userId]))
      expect(users.find((u) => u.id === coach.userId)).toEqual({
        id: coach.userId,
        can_be_trainer: true,
        is_trainer: true,
        clients_count: 1,
      })

      const clients = await rows(
        tx,
        `select athlete_id, display_name, has_account, workouts_count from public.admin_trainer_clients($1)`,
        [coach.userId],
      )
      expect(clients).toEqual([
        { athlete_id: coachClientId, display_name: 'Клієнт Коуча', has_account: false, workouts_count: 1 },
      ])

      const workouts = await rows(tx, `select id, title, set_count from public.admin_athlete_workouts($1)`, [coachClientId])
      expect(workouts).toEqual([{ id: coachWorkoutId, title: 'Ноги', set_count: 1 }])

      const [{ w }] = await rows<{ w: { title: string; athlete_name: string; exercises: { slug: string; sets: unknown[] }[] } }>(
        tx,
        `select public.admin_workout($1) as w`,
        [coachWorkoutId],
      )
      expect(w.title).toBe('Ноги')
      expect(w.athlete_name).toBe('Клієнт Коуча')
      expect(w.exercises).toHaveLength(1)
      expect(w.exercises[0].slug).toBe('barbell_bench_press')
      expect(w.exercises[0].sets).toHaveLength(1)

      // Read-only: the admin gets no direct access to other people's data.
      expect(await rows(tx, `select id from public.workouts where id = $1`, [coachWorkoutId])).toEqual([])
    })
  })

  it('revoking the permission turns trainer mode off and cuts client access until granted again', async () => {
    await asUser(admin.userId, (tx) => tx.query(`select public.admin_set_can_be_trainer($1, false)`, [coach.userId]))
    const [profile] = await rows(db, `select can_be_trainer, is_trainer from public.profiles where id = $1`, [coach.userId])
    expect(profile).toEqual({ can_be_trainer: false, is_trainer: false })

    await asUser(coach.userId, async (tx) => {
      expect(await rows(tx, `select id from public.workouts where athlete_id = $1`, [coachClientId])).toEqual([])
    })
    await expect(
      asUser(coach.userId, (tx) => tx.query(`select public.create_offline_client('Ще один')`)),
    ).rejects.toThrow(/only trainers/)

    await asUser(admin.userId, (tx) => tx.query(`select public.admin_set_can_be_trainer($1, true)`, [coach.userId]))
    await asUser(coach.userId, async (tx) => {
      expect(await rows(tx, `select id from public.workouts where athlete_id = $1`, [coachClientId])).toHaveLength(1)
    })
  })
})

describe('plans', () => {
  let client: { userId: string; athleteId: string }
  let stranger: { userId: string; athleteId: string }
  let squatId: string
  let templatePlan: string
  let clientPlan: string
  const makeIds = () => ({
    day1: crypto.randomUUID(),
    day2: crypto.randomUUID(),
    squatRow: crypto.randomUUID(),
    benchRow: crypto.randomUUID(),
    pressRow: crypto.randomUUID(),
  })
  const t = makeIds()
  const c = makeIds()
  const squatW1 = [{ w: 20, r: 10, warmup: true }, { w: 80, r: 8 }, { w: 80, r: 8 }, { w: 80, r: 8 }]
  const squatW2 = [{ w: 20, r: 10, warmup: true }, { w: 85, r: 6 }, { w: 85, r: 6 }, { w: 85, r: 6 }]

  const days = (ids: ReturnType<typeof makeIds>, opts: { squatW2?: unknown[]; dropBench?: boolean; swapDays?: boolean } = {}) => {
    const list = [
      {
        id: ids.day1,
        name: '1 тренування',
        rows: [
          {
            id: ids.squatRow,
            exercise_id: squatId,
            rest_s: 180,
            cells: [
              { week: 1, sets: squatW1 },
              { week: 2, sets: opts.squatW2 ?? squatW2 },
              { week: 9, sets: squatW2 }, // beyond the plan length → dropped
            ],
          },
          ...(opts.dropBench ? [] : [{ id: ids.benchRow, exercise_id: benchId, cells: [{ week: 1, sets: [{ w: 60, r: 8 }] }] }]),
        ],
      },
      { id: ids.day2, name: '2 тренування', rows: [{ id: ids.pressRow, exercise_id: benchId, cells: [] }] },
    ]
    return JSON.stringify(opts.swapDays ? list.reverse() : list)
  }

  const save = (user: string, planId: string | null, athleteId: string | null, json: string) =>
    asUser(user, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.save_plan($1, $2, ' Хвиля ', null, 3, $3::jsonb) as id`, [
        planId,
        athleteId,
        json,
      ])
      return r.id
    })

  beforeAll(async () => {
    const [squat] = await rows<{ id: string }>(db, `select id from public.exercises where slug = 'back_squat'`)
    squatId = squat.id
    client = await createUser('Planclient')
    stranger = await createUser('Stranger')
    await db.query(`insert into public.trainer_athletes (trainer_id, athlete_id) values ($1, $2)`, [
      trainer.userId,
      client.athleteId,
    ])
  })

  it('saves a plan template that only linked users can read', async () => {
    templatePlan = await save(trainer.userId, null, null, days(t))
    await asUser(trainer.userId, async (tx) => {
      const [p] = await rows(tx, `select name, weeks, athlete_id from public.plans where id = $1`, [templatePlan])
      expect(p).toEqual({ name: 'Хвиля', weeks: 3, athlete_id: null })
      const cells = await rows(tx, `select week, sets from public.plan_cells where plan_row_id = $1 order by week`, [t.squatRow])
      expect(cells).toEqual([
        { week: 1, sets: squatW1 },
        { week: 2, sets: squatW2 },
      ])
    })
    await asUser(client.userId, async (tx) => {
      expect(await rows(tx, `select id from public.plans where id = $1`, [templatePlan])).toHaveLength(1)
      expect(await rows(tx, `select week from public.plan_cells where plan_row_id = $1`, [t.squatRow])).toHaveLength(2)
    })
    await asUser(stranger.userId, async (tx) => {
      expect(await rows(tx, `select id from public.plans where id = $1`, [templatePlan])).toEqual([])
      expect(await rows(tx, `select week from public.plan_cells where plan_row_id = $1`, [t.squatRow])).toEqual([])
    })
  })

  it('copies a template to a client and keeps one active plan per client', async () => {
    const first = await asUser(trainer.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.copy_plan($1, $2) as id`, [templatePlan, client.athleteId])
      return r.id
    })
    clientPlan = await save(trainer.userId, null, client.athleteId, days(c))
    await asUser(trainer.userId, async (tx) => {
      const plans = await rows(tx, `select id, archived_at is null as active, source_plan_id from public.plans where athlete_id = $1 order by created_at`, [
        client.athleteId,
      ])
      expect(plans).toEqual([
        { id: first, active: false, source_plan_id: templatePlan },
        { id: clientPlan, active: true, source_plan_id: null },
      ])
      const [{ count }] = await rows<{ count: number }>(
        tx,
        `select count(*)::int as count from public.plan_cells pc
         join public.plan_rows r on r.id = pc.plan_row_id join public.plan_days d on d.id = r.plan_day_id
         where d.plan_id = $1`,
        [first],
      )
      expect(count).toBe(3)
    })
  })

  it("refuses ids from another plan and someone else's plan", async () => {
    await expect(save(trainer.userId, null, client.athleteId, days(t))).rejects.toThrow(/another plan/)
    await expect(save(client.userId, clientPlan, client.athleteId, days(c))).rejects.toThrow(/row-level security/)
    await expect(save(stranger.userId, null, client.athleteId, days(makeIds()))).rejects.toThrow(/row-level security/)
    await asUser(client.userId, async (tx) => {
      const updated = await tx.query(`update public.plan_cells set sets = '[{"w":1,"r":1}]' where plan_row_id = $1`, [c.squatRow])
      expect(updated.affectedRows).toBe(0)
    })
    await expect(
      asUser(client.userId, (tx) => tx.query(`update public.plans set athlete_id = null where id = $1`, [clientPlan])),
    ).rejects.toThrow(/permission denied/)
    await asUser(stranger.userId, async (tx) => {
      expect(await rows(tx, `select id from public.plans where id = $1`, [clientPlan])).toEqual([])
    })
  })

  it('starts planned sets with warm-ups and moves on after the last finished slot', async () => {
    const next = () =>
      asUser(client.userId, async (tx) => rows(tx, `select week, plan_day_id from public.next_plan_slot($1)`, [clientPlan]))
    const run = (week: number, day: string) =>
      asUser(client.userId, async (tx) => {
        const [r] = await rows<{ id: string }>(tx, `select public.start_workout_from_plan($1, $2, $3) as id`, [clientPlan, week, day])
        await tx.query(
          `update public.sets set completed_at = now()
           where workout_exercise_id in (select id from public.workout_exercises where workout_id = $1)`,
          [r.id],
        )
        await tx.query(`update public.workouts set finished_at = now() where id = $1`, [r.id])
        return r.id
      })

    expect(await next()).toEqual([{ week: 1, plan_day_id: c.day1 }])
    const w1 = await run(1, c.day1)
    await asUser(client.userId, async (tx) => {
      const [w] = await rows(tx, `select title, plan_id, plan_day_id, plan_week from public.workouts where id = $1`, [w1])
      expect(w).toEqual({ title: '1 тренування', plan_id: clientPlan, plan_day_id: c.day1, plan_week: 1 })
      const sets = await rows(
        tx,
        `select we.plan_row_id, s.weight_kg, s.reps, s.is_warmup from public.sets s
         join public.workout_exercises we on we.id = s.workout_exercise_id
         where we.workout_id = $1 order by we.position, s.position`,
        [w1],
      )
      expect(sets).toEqual([
        { plan_row_id: c.squatRow, weight_kg: '20.00', reps: 10, is_warmup: true },
        { plan_row_id: c.squatRow, weight_kg: '80.00', reps: 8, is_warmup: false },
        { plan_row_id: c.squatRow, weight_kg: '80.00', reps: 8, is_warmup: false },
        { plan_row_id: c.squatRow, weight_kg: '80.00', reps: 8, is_warmup: false },
        { plan_row_id: c.benchRow, weight_kg: '60.00', reps: 8, is_warmup: false },
      ])
    })
    expect(await next()).toEqual([{ week: 1, plan_day_id: c.day2 }])

    // day 2 of week 1 skipped: the plan still moves on
    await run(2, c.day1)
    expect(await next()).toEqual([{ week: 2, plan_day_id: c.day2 }])

    // an empty cell repeats last time
    const w3 = await run(2, c.day2)
    await asUser(client.userId, async (tx) => {
      const sets = await rows(
        tx,
        `select s.weight_kg, s.reps from public.sets s join public.workout_exercises we on we.id = s.workout_exercise_id
         where we.workout_id = $1 order by s.position`,
        [w3],
      )
      expect(sets).toEqual([{ weight_kg: '60.00', reps: 8 }])
    })
    expect(await next()).toEqual([{ week: 3, plan_day_id: c.day1 }])

    await expect(
      asUser(client.userId, (tx) => tx.query(`select public.start_workout_from_plan($1, 4, $2)`, [clientPlan, c.day1])),
    ).rejects.toThrow(/week out of range/)
    await expect(
      asUser(stranger.userId, (tx) => tx.query(`select public.start_workout_from_plan($1, 1, $2)`, [clientPlan, c.day1])),
    ).rejects.toThrow(/plan not found/)
  })

  it('keeps done workouts linked when the plan is edited', async () => {
    await save(trainer.userId, clientPlan, client.athleteId, days(c, { squatW2: [{ w: 90, r: 5 }], swapDays: true, dropBench: true }))
    await asUser(trainer.userId, async (tx) => {
      const linked = await rows<{ plan_row_id: string | null; slug: string }>(
        tx,
        `select we.plan_row_id, e.slug from public.workout_exercises we
         join public.workouts w on w.id = we.workout_id join public.exercises e on e.id = we.exercise_id
         where w.plan_id = $1 and w.plan_week = 1 and w.plan_day_id = $2 order by we.position`,
        [clientPlan, c.day1],
      )
      expect(linked).toEqual([
        { plan_row_id: c.squatRow, slug: 'back_squat' },
        { plan_row_id: null, slug: 'barbell_bench_press' }, // the row was removed
      ])
      const days = await rows(tx, `select id, position from public.plan_days where plan_id = $1 order by position`, [clientPlan])
      expect(days).toEqual([
        { id: c.day2, position: 0 },
        { id: c.day1, position: 1 },
      ])
      const [cell] = await rows(tx, `select sets from public.plan_cells where plan_row_id = $1 and week = 2`, [c.squatRow])
      expect(cell).toEqual({ sets: [{ w: 90, r: 5 }] })
    })
  })

  it('builds a plan from templates', async () => {
    const tplId = await asUser(trainer.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.save_template(null, 'Груди', null, $1::jsonb) as id`, [
        JSON.stringify([
          { exercise_id: benchId, target_sets: 2, target_reps_max: 10, target_weight_kg: 50 },
          { exercise_id: squatId, sets: squatW1 },
          { exercise_id: squatId, target_sets: 3, target_reps_max: 5 },
        ]),
      ])
      return r.id
    })
    await asUser(trainer.userId, async (tx) => {
      const [p] = await rows<{ id: string }>(tx, `select public.create_plan_from_templates(null, 'З шаблону', 2, $1::uuid[]) as id`, [
        [tplId],
      ])
      const cells = await rows(
        tx,
        `select r.position, pc.week, pc.sets from public.plan_cells pc
         join public.plan_rows r on r.id = pc.plan_row_id join public.plan_days d on d.id = r.plan_day_id
         where d.plan_id = $1 order by r.position, pc.week`,
        [p.id],
      )
      const benchSets = [{ w: 50, r: 10 }, { w: 50, r: 10 }]
      expect(cells).toEqual([
        { position: 0, week: 1, sets: benchSets },
        { position: 0, week: 2, sets: benchSets },
        { position: 1, week: 1, sets: squatW1 },
        { position: 1, week: 2, sets: squatW1 },
      ])
    })
  })
})

describe('client feedback', () => {
  let client: { userId: string; athleteId: string }
  let outsider: { userId: string; athleteId: string }
  let planId: string
  const dayId = crypto.randomUUID()
  const rowId = crypto.randomUUID()
  let workoutId: string
  let weId: string

  beforeAll(async () => {
    client = await createUser('Feedbackclient')
    outsider = await createUser('Outsider')
    await db.query(`insert into public.trainer_athletes (trainer_id, athlete_id) values ($1, $2)`, [trainer.userId, client.athleteId])
    planId = await asUser(trainer.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.save_plan(null, $1, 'Відгуки', null, 2, $2::jsonb) as id`, [
        client.athleteId,
        JSON.stringify([
          { id: dayId, name: 'День', rows: [{ id: rowId, exercise_id: benchId, cells: [{ week: 1, sets: [{ w: 60, r: 8 }] }] }] },
        ]),
      ])
      return r.id
    })
    workoutId = await asUser(client.userId, async (tx) => {
      const [r] = await rows<{ id: string }>(tx, `select public.start_workout_from_plan($1, 1, $2) as id`, [planId, dayId])
      return r.id
    })
    const [we] = await rows<{ id: string }>(db, `select id from public.workout_exercises where workout_id = $1`, [workoutId])
    weId = we.id
  })

  it('stamps exercise feedback on the server', async () => {
    await asUser(client.userId, async (tx) => {
      await tx.query(`update public.workout_exercises set difficulty = 3, athlete_feedback = 'важко на 3-му' where id = $1`, [weId])
      const [we] = await rows<{ feedback_by: string; stamped: boolean }>(
        tx,
        `select feedback_by, feedback_at is not null as stamped from public.workout_exercises where id = $1`,
        [weId],
      )
      expect(we).toEqual({ feedback_by: client.userId, stamped: true })
    })
    await expect(
      asUser(client.userId, (tx) => tx.query(`update public.workout_exercises set feedback_at = now() - interval '1 year' where id = $1`, [weId])),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(client.userId, (tx) => tx.query(`update public.workout_exercises set difficulty = 5 where id = $1`, [weId])),
    ).rejects.toThrow(/check/)
  })

  it('lets the client and trainer discuss a plan cell, nobody else', async () => {
    await asUser(client.userId, (tx) =>
      tx.query(`insert into public.plan_comments (plan_id, plan_row_id, week, body) values ($1, $2, 1, 'болить плече')`, [planId, rowId]),
    )
    await asUser(trainer.userId, (tx) =>
      tx.query(`insert into public.plan_comments (plan_id, plan_row_id, week, body) values ($1, $2, 1, 'заміню на гантелі')`, [planId, rowId]),
    )
    await asUser(client.userId, async (tx) => {
      const list = await rows(tx, `select body from public.plan_comments where plan_id = $1 order by created_at`, [planId])
      expect(list).toEqual([{ body: 'болить плече' }, { body: 'заміню на гантелі' }])
    })
    await expect(
      asUser(outsider.userId, (tx) => tx.query(`insert into public.plan_comments (plan_id, body) values ($1, 'x')`, [planId])),
    ).rejects.toThrow(/row-level security/)
    await asUser(outsider.userId, async (tx) => {
      expect(await rows(tx, `select id from public.plan_comments where plan_id = $1`, [planId])).toEqual([])
    })
    // a row from another plan can't be attached
    await expect(
      asUser(client.userId, (tx) =>
        tx.query(`insert into public.plan_comments (plan_id, plan_row_id, body) values ($1, gen_random_uuid(), 'x')`, [planId]),
      ),
    ).rejects.toThrow()
  })

  it("shows the trainer their clients' feedback, not their own or anyone else's", async () => {
    await asUser(client.userId, (tx) =>
      tx.query(`insert into public.workout_comments (workout_id, author_id, body) values ($1, $2, 'дякую')`, [workoutId, client.userId]),
    )
    await asUser(trainer.userId, async (tx) => {
      const feed = await rows<{ kind: string; athlete_name: string; body: string; difficulty: number | null; plan_row_id: string | null }>(
        tx,
        `select kind, athlete_name, body, difficulty, plan_row_id from public.trainer_feedback_feed() where athlete_id = $1`,
        [client.athleteId],
      )
      expect(feed).toEqual([
        { kind: 'workout', athlete_name: 'Feedbackclient', body: 'дякую', difficulty: null, plan_row_id: null },
        { kind: 'plan', athlete_name: 'Feedbackclient', body: 'болить плече', difficulty: null, plan_row_id: rowId },
        { kind: 'exercise', athlete_name: 'Feedbackclient', body: 'важко на 3-му', difficulty: 3, plan_row_id: rowId },
      ])
      await tx.query(`update public.profiles set feedback_seen_at = now() where id = $1`, [trainer.userId])
    })
    await asUser(outsider.userId, async (tx) => {
      expect(await rows(tx, `select * from public.trainer_feedback_feed()`)).toEqual([])
    })
  })
})
