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
      'claim_invite',
      'create_offline_client',
      'exercise_records',
      'get_invite',
      'last_performance',
      'next_program_template',
      'save_program',
      'save_template',
      'start_workout_from_template',
      'trainer_clients_overview',
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
