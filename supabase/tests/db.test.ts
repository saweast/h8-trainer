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
      'accept_link_request',
      'add_drop_set',
      'admin_athlete_workouts',
      'admin_set_can_be_trainer',
      'admin_trainer_clients',
      'admin_users',
      'admin_workout',
      'claim_invite',
      'close_stale_workouts',
      'copy_plan',
      'create_offline_client',
      'create_plan_from_templates',
      'decline_link_request',
      'exercise_records',
      'finish_group_workout',
      'finish_workout',
      'get_invite',
      'last_performance',
      'merge_clients',
      'my_link_requests',
      'next_plan_slot',
      'next_program_template',
      'request_client_link',
      'save_plan',
      'save_program',
      'save_template',
      'start_group_workout',
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

describe('finishing a live session', () => {
  let client: { userId: string; athleteId: string }

  /** Trainer starts a workout for the client with one exercise: sets [done?, …]. */
  async function liveSession(done: boolean[], { by = trainer.userId } = {}) {
    return asUser(by, async (tx) => {
      const [w] = await rows<{ id: string }>(tx, `insert into public.workouts (athlete_id) values ($1) returning id`, [
        client.athleteId,
      ])
      const [we] = await rows<{ id: string }>(
        tx,
        `insert into public.workout_exercises (workout_id, exercise_id, position) values ($1, $2, 0) returning id`,
        [w.id, benchId],
      )
      for (const [i, d] of done.entries()) {
        await tx.query(
          `insert into public.sets (workout_exercise_id, position, weight_kg, reps, completed_at) values ($1, $2, 60, 8, $3)`,
          [we.id, i + 1, d ? new Date().toISOString() : null],
        )
      }
      return w.id
    })
  }

  const setCount = async (workoutId: string) => {
    const [r] = await rows<{ done: number; pending: number }>(
      db,
      `select count(*) filter (where s.completed_at is not null)::int as done, count(*) filter (where s.completed_at is null)::int as pending
       from public.sets s join public.workout_exercises we on we.id = s.workout_exercise_id where we.workout_id = $1`,
      [workoutId],
    )
    return r
  }

  beforeAll(async () => {
    client = await createUser('Liveclient')
    await db.query(`insert into public.trainer_athletes (trainer_id, athlete_id) values ($1, $2)`, [trainer.userId, client.athleteId])
  })

  it('keeps every set the server has as done, whoever finishes', async () => {
    const id = await liveSession([true, true, true, false])
    // The client finishes from a screen that only saw the first set done: nothing of the trainer's is lost.
    const [res] = await asUser(client.userId, (tx) => rows(tx, `select * from public.finish_workout($1, 'Груди')`, [id]))
    expect(res.completed_sets).toBe(3)
    expect(await setCount(id)).toEqual({ done: 3, pending: 0 })
    // The trainer's finish afterwards is a no-op that reports the same result.
    const [again] = await asUser(trainer.userId, (tx) => rows(tx, `select * from public.finish_workout($1, 'Інше')`, [id]))
    expect(again).toEqual(res)
    const [w] = await rows(db, `select title from public.workouts where id = $1`, [id])
    expect(w.title).toBe('Груди')
  })

  it('refuses to finish a workout with nothing done, or someone else’s', async () => {
    const id = await liveSession([false])
    await expect(asUser(trainer.userId, (tx) => tx.query(`select public.finish_workout($1)`, [id]))).rejects.toThrow(/no completed sets/)
    await expect(asUser(bohdan.userId, (tx) => tx.query(`select public.finish_workout($1)`, [id]))).rejects.toThrow(/not found/)
  })

  it('does not let the client discard the session their trainer is recording', async () => {
    const id = await liveSession([true])
    const deleted = await asUser(client.userId, (tx) => tx.query(`delete from public.workouts where id = $1`, [id]))
    expect(deleted.affectedRows).toBe(0)
    // ...but the one who started it can, and a finished one follows the usual rules
    const own = await liveSession([false], { by: client.userId })
    const ownDeleted = await asUser(client.userId, (tx) => tx.query(`delete from public.workouts where id = $1`, [own]))
    expect(ownDeleted.affectedRows).toBe(1)
    await asUser(trainer.userId, (tx) => tx.query(`select public.finish_workout($1)`, [id]))
    const finishedDeleted = await asUser(client.userId, (tx) => tx.query(`delete from public.workouts where id = $1`, [id]))
    expect(finishedDeleted.affectedRows).toBe(1)
  })

  it('tracks activity and auto-finishes sessions idle for 30 minutes', async () => {
    const idle = await liveSession([true, false])
    const empty = await liveSession([false])
    const active = await liveSession([true])
    await db.query(`update public.workouts set started_at = now() - interval '2 hours', last_activity_at = now() - interval '40 minutes' where id = any($1)`, [
      [idle, empty],
    ])
    // A change to a set counts as activity.
    const [{ before }] = await rows<{ before: string }>(db, `select last_activity_at as before from public.workouts where id = $1`, [idle])
    expect(new Date(before).getTime()).toBeLessThan(Date.now() - 30 * 60_000)

    await expect(asUser(bohdan.userId, (tx) => tx.query(`select public.close_stale_workouts($1)`, [client.athleteId]))).rejects.toThrow(
      /not found/,
    )
    const [{ n }] = await asUser(client.userId, (tx) => rows<{ n: number }>(tx, `select public.close_stale_workouts($1) as n`, [client.athleteId]))
    expect(n).toBe(2)

    const [w] = await rows<{ finished_at: string; last_activity_at: string }>(
      db,
      `select finished_at, last_activity_at from public.workouts where id = $1`,
      [idle],
    )
    expect(w.finished_at).toEqual(w.last_activity_at)
    expect(await setCount(idle)).toEqual({ done: 1, pending: 0 })
    expect(await rows(db, `select id from public.workouts where id = $1`, [empty])).toEqual([])
    expect(await rows(db, `select finished_at from public.workouts where id = $1`, [active])).toEqual([{ finished_at: null }])
  })

  it('bumps last activity when sets change', async () => {
    const id = await liveSession([false])
    await db.query(`update public.workouts set last_activity_at = now() - interval '1 hour' where id = $1`, [id])
    await asUser(trainer.userId, (tx) =>
      tx.query(
        `update public.sets s set completed_at = now() from public.workout_exercises we
         where we.id = s.workout_exercise_id and we.workout_id = $1`,
        [id],
      ),
    )
    const [w] = await rows<{ fresh: boolean }>(db, `select last_activity_at > now() - interval '1 minute' as fresh from public.workouts where id = $1`, [id])
    expect(w.fresh).toBe(true)
  })
})

describe('merging clients', () => {
  let marko: { userId: string; athleteId: string } // client with an account, linked to the trainer

  const asTrainer = <T>(fn: (tx: Transaction) => Promise<T>) => asUser(trainer.userId, fn)
  const one = async <T extends Row>(tx: Transaction | PGlite, sql: string, params: unknown[] = []) => (await rows<T>(tx, sql, params))[0]
  const newOffline = (name: string) => asTrainer(async (tx) => (await one<{ id: string }>(tx, `select public.create_offline_client($1) as id`, [name])).id)
  const athleteExists = async (id: string) => (await rows(db, `select id from public.athletes where id = $1`, [id])).length > 0

  beforeAll(async () => {
    marko = await createUser('Marko')
    await db.query(`insert into public.trainer_athletes (trainer_id, athlete_id) values ($1, $2)`, [trainer.userId, marko.athleteId])
  })

  it("merges an offline client into the same person's account with everything they had", async () => {
    const offline = await newOffline('Марко (офлайн)')
    const pkg = await asTrainer(async (tx) => {
      const m = await one<{ id: string }>(
        tx,
        `insert into public.memberships (athlete_id, kind, trainer_id, sessions_total) values ($1, 'trainer', $2, 10) returning id`,
        [offline, trainer.userId],
      )
      await tx.query(`insert into public.workouts (athlete_id, title, membership_id, finished_at) values ($1, 'Офлайн', $2, now())`, [offline, m.id])
      await tx.query(`insert into public.body_measurements (athlete_id, weight_kg) values ($1, 82)`, [offline])
      await tx.query(
        `insert into public.athlete_exercise_settings (athlete_id, exercise_id, setup_notes, drop_pct) values ($1, $2, 'Сидіння 3', 25)`,
        [offline, benchId],
      )
      await tx.query(`insert into public.plans (athlete_id, name) values ($1, 'План офлайн')`, [offline])
      await tx.query(`insert into public.plans (athlete_id, name) values ($1, 'План акаунта')`, [marko.athleteId])
      await tx.query(`insert into public.invites (athlete_id) values ($1)`, [offline])
      return m.id
    })

    const merged = await asTrainer((tx) => one(tx, `select public.merge_clients($1, $2) as id`, [offline, marko.athleteId]))
    expect(merged.id).toBe(marko.athleteId)
    expect(await athleteExists(offline)).toBe(false)

    await asUser(marko.userId, async (tx) => {
      expect(await rows(tx, `select title from public.workouts`)).toEqual([{ title: 'Офлайн' }])
      expect(await one(tx, `select athlete_id, sessions_used from public.membership_usage where id = $1`, [pkg])).toEqual({
        athlete_id: marko.athleteId,
        sessions_used: 1,
      })
      expect(await rows(tx, `select weight_kg::float as kg from public.body_measurements`)).toEqual([{ kg: 82 }])
      expect(await rows(tx, `select setup_notes, drop_pct from public.athlete_exercise_settings`)).toEqual([
        { setup_notes: 'Сидіння 3', drop_pct: 25 },
      ])
      // both plans are kept; the account's stays the active one
      expect(await rows(tx, `select name, archived_at is null as active from public.plans where athlete_id is not null order by name`)).toEqual([
        { name: 'План акаунта', active: true },
        { name: 'План офлайн', active: false },
      ])
    })
    // the offline client's open invite is gone instead of turning into a plain invite
    expect(await rows(db, `select code from public.invites where trainer_id = $1 and used_at is null and athlete_id is null`, [trainer.userId])).toEqual([])
    await asTrainer(async (tx) => {
      const names = (await rows<{ display_name: string }>(tx, `select display_name from public.trainer_clients_overview()`)).map((r) => r.display_name)
      expect(names.filter((n) => n.startsWith('Марко'))).toEqual([])
      expect(names).toContain('Marko')
    })
  })

  it('merges two offline clients', async () => {
    const a = await newOffline('Ліна')
    const b = await newOffline('Ліна К.')
    await asTrainer((tx) => tx.query(`insert into public.workouts (athlete_id, title, finished_at) values ($1, 'Спина', now())`, [a]))
    await asTrainer((tx) => tx.query(`select public.merge_clients($1, $2)`, [a, b]))
    expect(await athleteExists(a)).toBe(false)
    expect(await rows(db, `select title from public.workouts where athlete_id = $1`, [b])).toEqual([{ title: 'Спина' }])
  })

  it("refuses to merge an account away, someone else's client, or a client into itself", async () => {
    const offline = await newOffline('Тест')
    const stranger = await createUser('Stranger') // not the trainer's client
    await expect(asTrainer((tx) => tx.query(`select public.merge_clients($1, $2)`, [marko.athleteId, offline]))).rejects.toThrow(
      /without an account/,
    )
    await expect(asTrainer((tx) => tx.query(`select public.merge_clients($1, $2)`, [offline, stranger.athleteId]))).rejects.toThrow(
      /client not found/,
    )
    await expect(asUser(stranger.userId, (tx) => tx.query(`select public.merge_clients($1, $2)`, [offline, stranger.athleteId]))).rejects.toThrow(
      /client not found/,
    )
    await expect(asTrainer((tx) => tx.query(`select public.merge_clients($1, $1)`, [offline]))).rejects.toThrow(/into itself/)
    expect(await athleteExists(offline)).toBe(true)
  })

  it('asks the owner of an email before moving the history, even before they sign up', async () => {
    const offline = await newOffline('Іра (офлайн)')
    await asTrainer((tx) => tx.query(`insert into public.workouts (athlete_id, title, finished_at) values ($1, 'Ноги', now())`, [offline]))
    const requestId = await asTrainer(async (tx) => (await one<{ id: string }>(tx, `select public.request_client_link($1, ' Ira@Example.com ') as id`, [offline])).id)
    expect(await asTrainer((tx) => rows(tx, `select email from public.client_link_requests`))).toEqual([{ email: 'ira@example.com' }])

    const ira = await createUser('Ira')
    expect(await asUser(bohdan.userId, (tx) => rows(tx, `select * from public.my_link_requests()`))).toEqual([])
    expect(await asUser(ira.userId, (tx) => rows(tx, `select id, trainer_name, athlete_name, workouts_count from public.my_link_requests()`))).toEqual([
      { id: requestId, trainer_name: 'Olena', athlete_name: 'Іра (офлайн)', workouts_count: 1 },
    ])
    // the request alone gives the trainer nothing
    expect(await asTrainer((tx) => rows(tx, `select id from public.athletes where id = $1`, [ira.athleteId]))).toEqual([])
    await expect(asUser(bohdan.userId, (tx) => tx.query(`select public.accept_link_request($1)`, [requestId]))).rejects.toThrow(/not found/)

    const accepted = await asUser(ira.userId, (tx) => one(tx, `select public.accept_link_request($1) as id`, [requestId]))
    expect(accepted.id).toBe(ira.athleteId)
    expect(await athleteExists(offline)).toBe(false)
    expect(await asUser(ira.userId, (tx) => rows(tx, `select title from public.workouts`))).toEqual([{ title: 'Ноги' }])
    await asTrainer(async (tx) => {
      expect(await rows(tx, `select title from public.workouts where athlete_id = $1`, [ira.athleteId])).toEqual([{ title: 'Ноги' }])
      expect(await rows(tx, `select id from public.client_link_requests where id = $1`, [requestId])).toEqual([])
    })
  })

  it('lets the invitee decline and the trainer cancel, and checks who and what can be requested', async () => {
    const offline = await newOffline('Богдан (офлайн)')
    await expect(asTrainer((tx) => tx.query(`select public.request_client_link($1, 'nope')`, [offline]))).rejects.toThrow(/invalid email/)
    await expect(asTrainer((tx) => tx.query(`select public.request_client_link($1, 'olena@example.com')`, [offline]))).rejects.toThrow(/yourself/)
    await expect(asTrainer((tx) => tx.query(`select public.request_client_link($1, 'x@example.com')`, [marko.athleteId]))).rejects.toThrow(/without an account/)
    await expect(asUser(bohdan.userId, (tx) => tx.query(`select public.request_client_link($1, 'x@example.com')`, [offline]))).rejects.toThrow(/without an account/)
    await expect(asTrainer((tx) => tx.query(`insert into public.client_link_requests (trainer_id, athlete_id, email) values ($1, $2, 'a@b.co')`, [trainer.userId, offline]))).rejects.toThrow(/permission denied/)

    const id = await asTrainer(async (tx) => (await one<{ id: string }>(tx, `select public.request_client_link($1, 'bohdan@example.com') as id`, [offline])).id)
    // an unconfirmed sign-in email doesn't match
    await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [bohdan.userId])
    expect(await asUser(bohdan.userId, (tx) => rows(tx, `select * from public.my_link_requests()`))).toEqual([])
    await expect(asUser(bohdan.userId, (tx) => tx.query(`select public.accept_link_request($1)`, [id]))).rejects.toThrow(/not found/)
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [bohdan.userId])

    await asUser(bohdan.userId, (tx) => tx.query(`select public.decline_link_request($1)`, [id]))
    expect(await asTrainer((tx) => rows(tx, `select id from public.client_link_requests where athlete_id = $1`, [offline]))).toEqual([])
    expect(await athleteExists(offline)).toBe(true)

    // sending again, then the trainer cancels
    await asTrainer((tx) => tx.query(`select public.request_client_link($1, 'bohdan@example.com')`, [offline]))
    await asTrainer((tx) => tx.query(`delete from public.client_link_requests where athlete_id = $1`, [offline]))
    expect(await asUser(bohdan.userId, (tx) => rows(tx, `select * from public.my_link_requests()`))).toEqual([])
  })

  it("keeps the offline client's plan when an invite is accepted", async () => {
    const offline = await newOffline('Олег (офлайн)')
    const code = await asTrainer(async (tx) => {
      await tx.query(`insert into public.plans (athlete_id, name) values ($1, 'План Олега')`, [offline])
      return (await one<{ code: string }>(tx, `insert into public.invites (athlete_id) values ($1) returning code`, [offline])).code
    })
    const oleh = await createUser('Oleh')
    await asUser(oleh.userId, (tx) => tx.query(`select public.claim_invite($1)`, [code]))
    expect(await asUser(oleh.userId, (tx) => rows(tx, `select name, archived_at is null as active from public.plans where athlete_id is not null`))).toEqual([
      { name: 'План Олега', active: true },
    ])
    expect(await rows(db, `select used_by from public.invites where code = $1`, [code])).toEqual([{ used_by: oleh.userId }])
  })
})

describe('client notes', () => {
  const asTrainer = <T>(fn: (tx: Transaction) => Promise<T>) => asUser(trainer.userId, fn)
  let client: { userId: string; athleteId: string }
  let coach2: { userId: string; athleteId: string } // another trainer of the same client

  beforeAll(async () => {
    client = await createUser('Notes')
    coach2 = await createUser('Coach2')
    await db.query(`update public.profiles set can_be_trainer = true where id in ($1, $2)`, [trainer.userId, coach2.userId])
    await db.query(`insert into public.trainer_athletes (trainer_id, athlete_id) values ($1, $3), ($2, $3)`, [
      trainer.userId,
      coach2.userId,
      client.athleteId,
    ])
  })

  it("keeps the trainer's notes private to that trainer", async () => {
    await asTrainer(async (tx) => {
      await tx.query(`insert into public.client_notes (athlete_id, body) values ($1, 'Хоче схуднути до літа')`, [client.athleteId])
      await tx.query(`insert into public.client_notes (athlete_id, kind, exercise_id, body) values ($1, 'avoid', $2, 'Плече')`, [
        client.athleteId,
        benchId,
      ])
      await tx.query(`insert into public.client_notes (athlete_id, kind, muscle_group) values ($1, 'prefer', 'glutes')`, [client.athleteId])
    })
    expect(await asTrainer((tx) => rows(tx, `select kind from public.client_notes where athlete_id = $1 order by kind`, [client.athleteId]))).toEqual([
      { kind: 'avoid' },
      { kind: 'note' },
      { kind: 'prefer' },
    ])
    expect(await asUser(client.userId, (tx) => rows(tx, `select id from public.client_notes`))).toEqual([])
    expect(await asUser(coach2.userId, (tx) => rows(tx, `select id from public.client_notes`))).toEqual([])
    // another trainer can't change or remove them either
    await asUser(coach2.userId, (tx) => tx.query(`update public.client_notes set body = 'x'`))
    await asUser(coach2.userId, (tx) => tx.query(`delete from public.client_notes`))
    expect(await asTrainer((tx) => rows(tx, `select id from public.client_notes where athlete_id = $1`, [client.athleteId]))).toHaveLength(3)
  })

  it('only takes notes about own clients, signed as yourself, and well-formed', async () => {
    const stranger = await createUser('NotesStranger')
    await expect(asUser(client.userId, (tx) => tx.query(`insert into public.client_notes (athlete_id, body) values ($1, 'x')`, [client.athleteId]))).rejects.toThrow(
      /row-level security/,
    )
    await expect(asTrainer((tx) => tx.query(`insert into public.client_notes (athlete_id, body) values ($1, 'x')`, [stranger.athleteId]))).rejects.toThrow(
      /row-level security/,
    )
    await expect(
      asTrainer((tx) => tx.query(`insert into public.client_notes (trainer_id, athlete_id, body) values ($1, $2, 'x')`, [coach2.userId, client.athleteId])),
    ).rejects.toThrow(/row-level security/)
    await expect(asTrainer((tx) => tx.query(`insert into public.client_notes (athlete_id, body) values ($1, '  ')`, [client.athleteId]))).rejects.toThrow(
      /check constraint/,
    )
    await expect(
      asTrainer((tx) =>
        tx.query(`insert into public.client_notes (athlete_id, kind, exercise_id, muscle_group) values ($1, 'avoid', $2, 'chest')`, [client.athleteId, benchId]),
      ),
    ).rejects.toThrow(/check constraint/)
    await expect(
      asTrainer((tx) => tx.query(`update public.client_notes set trainer_id = $1 where athlete_id = $2`, [coach2.userId, client.athleteId])),
    ).rejects.toThrow(/permission denied/)
  })

  it('moves notes on merge and drops them when the client is unlinked', async () => {
    const offline = await asTrainer(async (tx) => (await rows<{ id: string }>(tx, `select public.create_offline_client('Нотатки офлайн') as id`))[0].id)
    await asTrainer((tx) => tx.query(`insert into public.client_notes (athlete_id, body) values ($1, 'Болить коліно')`, [offline]))
    await asTrainer((tx) => tx.query(`select public.merge_clients($1, $2)`, [offline, client.athleteId]))
    expect(await asTrainer((tx) => rows(tx, `select body from public.client_notes where athlete_id = $1 and body = 'Болить коліно'`, [client.athleteId]))).toHaveLength(1)

    await asTrainer((tx) => tx.query(`delete from public.trainer_athletes where trainer_id = $1 and athlete_id = $2`, [trainer.userId, client.athleteId]))
    expect(await rows(db, `select id from public.client_notes where athlete_id = $1`, [client.athleteId])).toEqual([])
  })
})

describe('split sessions', () => {
  const asTrainer = <T>(fn: (tx: Transaction) => Promise<T>) => asUser(trainer.userId, fn)
  let olia: { userId: string; athleteId: string } // client with an account
  let maks: string // offline client
  let maksPackage: string

  const start = (athletes: string[], memberships: (string | null)[] | null = null, template: string | null = null) =>
    asTrainer(async (tx) => (await rows<{ id: string }>(tx, `select public.start_group_workout($1::uuid[], $2::uuid[], $3) as id`, [athletes, memberships, template]))[0].id)

  const groupWorkouts = (groupId: string) =>
    rows<{ id: string; athlete_id: string; membership_id: string | null; finished_at: string | null; title: string }>(
      db,
      `select id, athlete_id, membership_id, finished_at, title from public.workouts where group_id = $1 order by athlete_id`,
      [groupId],
    )

  /** One bench exercise for the workout, sets [weight, reps, done?]. */
  const addBench = (workoutId: string, sets: [number, number, boolean][]) =>
    asTrainer(async (tx) => {
      const [we] = await rows<{ id: string }>(
        tx,
        `insert into public.workout_exercises (workout_id, exercise_id, position) values ($1, $2, 0) returning id`,
        [workoutId, benchId],
      )
      for (const [i, [kg, reps, done]] of sets.entries()) {
        await tx.query(`insert into public.sets (workout_exercise_id, position, weight_kg, reps, completed_at) values ($1, $2, $3, $4, $5)`, [
          we.id,
          i + 1,
          kg,
          reps,
          done ? new Date().toISOString() : null,
        ])
      }
    })

  beforeAll(async () => {
    olia = await createUser('Olia')
    await db.query(`update public.profiles set can_be_trainer = true, is_trainer = true where id = $1`, [trainer.userId])
    await db.query(`insert into public.trainer_athletes (trainer_id, athlete_id) values ($1, $2)`, [trainer.userId, olia.athleteId])
    maks = await asTrainer(async (tx) => (await rows<{ id: string }>(tx, `select public.create_offline_client('Макс') as id`))[0].id)
    maksPackage = await asTrainer(async (tx) =>
      (
        await rows<{ id: string }>(
          tx,
          `insert into public.memberships (athlete_id, kind, trainer_id, sessions_total) values ($1, 'trainer', $2, 10) returning id`,
          [maks, trainer.userId],
        )
      )[0].id,
    )
  })

  it("starts one workout per client, charged to each client's own package", async () => {
    const groupId = await start([olia.athleteId, maks], [null, maksPackage])
    const workouts = await groupWorkouts(groupId)
    expect(workouts).toHaveLength(2)
    expect(new Map(workouts.map((w) => [w.athlete_id, w.membership_id]))).toEqual(
      new Map([
        [olia.athleteId, null],
        [maks, maksPackage],
      ]),
    )
    // Each client sees only their own workout of the session.
    const seen = await asUser(olia.userId, (tx) => rows(tx, `select athlete_id from public.workouts where group_id = $1`, [groupId]))
    expect(seen).toEqual([{ athlete_id: olia.athleteId }])
    // A client already training can't be added to another session.
    await expect(start([olia.athleteId, maks])).rejects.toThrow(/in progress/)
    await asTrainer((tx) => tx.query(`delete from public.workouts where group_id = $1`, [groupId]))
  })

  it('refuses fewer than two clients, duplicates, strangers and foreign packages', async () => {
    const stranger = await createUser('Splitstranger')
    await expect(start([maks])).rejects.toThrow(/2 to 10/)
    await expect(start([maks, maks])).rejects.toThrow(/once/)
    await expect(start([maks, olia.athleteId], [maksPackage])).rejects.toThrow(/one package/)
    await expect(start([maks, stranger.athleteId])).rejects.toThrow(/not your client/)
    await expect(start([olia.athleteId, maks], [maksPackage, null])).rejects.toThrow(/own package/)
    // Nothing was left behind by the refused starts.
    expect(await rows(db, `select id from public.workouts where athlete_id = any($1) and finished_at is null`, [[maks, olia.athleteId]])).toEqual([])
  })

  it("prefills a template for each client from their own last time", async () => {
    const prev = await start([olia.athleteId, maks])
    const [a, b] = await groupWorkouts(prev)
    const kgOf = (athleteId: string) => (athleteId === maks ? 80 : 40)
    await addBench(a.id, [[kgOf(a.athlete_id), 8, true]])
    await addBench(b.id, [[kgOf(b.athlete_id), 8, true]])
    await asTrainer((tx) => tx.query(`select * from public.finish_group_workout($1)`, [prev]))

    const templateId = await asTrainer(async (tx) => {
      const [tpl] = await rows<{ id: string }>(tx, `insert into public.templates (owner_id, name) values ($1, 'Спліт груди') returning id`, [
        trainer.userId,
      ])
      await tx.query(`insert into public.template_exercises (template_id, exercise_id, position, target_sets) values ($1, $2, 0, 2)`, [
        tpl.id,
        benchId,
      ])
      return tpl.id
    })
    const groupId = await start([olia.athleteId, maks], null, templateId)
    const sets = await rows<{ athlete_id: string; title: string; weight_kg: string }>(
      db,
      `select w.athlete_id, w.title, s.weight_kg from public.workouts w
       join public.workout_exercises we on we.workout_id = w.id
       join public.sets s on s.workout_exercise_id = we.id
       where w.group_id = $1 order by w.athlete_id, s.position`,
      [groupId],
    )
    expect(sets).toHaveLength(4)
    for (const s of sets) {
      expect(s.title).toBe('Спліт груди')
      expect(Number(s.weight_kg)).toBe(kgOf(s.athlete_id))
    }
    await asTrainer((tx) => tx.query(`delete from public.workouts where group_id = $1`, [groupId]))
  })

  it('keeps the whole session open while one client trains, and the group fixed', async () => {
    const groupId = await start([olia.athleteId, maks])
    const [a] = await groupWorkouts(groupId)
    await db.query(`update public.workouts set last_activity_at = now() - interval '1 hour' where group_id = $1`, [groupId])
    await addBench(a.id, [[50, 10, true]])
    const fresh = await rows<{ fresh: boolean }>(
      db,
      `select last_activity_at > now() - interval '1 minute' as fresh from public.workouts where group_id = $1`,
      [groupId],
    )
    expect(fresh).toEqual([{ fresh: true }, { fresh: true }])

    // Nobody moves a workout into or out of a session afterwards.
    await asUser(olia.userId, (tx) => tx.query(`update public.workouts set group_id = null where athlete_id = $1 and group_id = $2`, [olia.athleteId, groupId]))
    expect(await groupWorkouts(groupId)).toHaveLength(2)
    await asTrainer((tx) => tx.query(`delete from public.workouts where group_id = $1`, [groupId]))
  })

  it('saves clients who trained, drops the ones who did nothing, and only for the trainer', async () => {
    const groupId = await start([olia.athleteId, maks], [null, maksPackage])
    const workouts = await groupWorkouts(groupId)
    const oliaW = workouts.find((w) => w.athlete_id === olia.athleteId)!
    const maksW = workouts.find((w) => w.athlete_id === maks)!

    await addBench(maksW.id, [[60, 8, false]])
    await expect(asTrainer((tx) => tx.query(`select * from public.finish_group_workout($1)`, [groupId]))).rejects.toThrow(/no completed sets/)

    await addBench(oliaW.id, [[40, 10, true], [40, 10, false]])
    await expect(asUser(olia.userId, (tx) => tx.query(`select * from public.finish_group_workout($1)`, [groupId]))).rejects.toThrow(/not found/)
    await expect(asUser(bohdan.userId, (tx) => tx.query(`select * from public.finish_group_workout($1)`, [groupId]))).rejects.toThrow(/not found/)

    const result = await asTrainer((tx) =>
      rows<{ workout_id: string; completed_sets: number }>(tx, `select * from public.finish_group_workout($1, $2)`, [
        groupId,
        JSON.stringify({ [oliaW.id]: 'Груди' }),
      ]),
    )
    expect(result).toEqual([
      { workout_id: oliaW.id, athlete_id: olia.athleteId, completed_sets: 1 },
      { workout_id: maksW.id, athlete_id: maks, completed_sets: 0 },
    ])
    const left = await groupWorkouts(groupId)
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ id: oliaW.id, title: 'Груди' })
    expect(left[0].finished_at).not.toBeNull()
    // Maks didn't train: no workout, no session charged.
    const [usage] = await rows(db, `select sessions_used from public.membership_usage where id = $1`, [maksPackage])
    expect(usage.sessions_used).toBe(0)
  })
})

describe('drop sets', () => {
  let dropper: { userId: string; athleteId: string }
  const items = (...list: Record<string, unknown>[]) => JSON.stringify(list)
  const asDropper = <T>(fn: (tx: Transaction) => Promise<T>) => asUser(dropper.userId, fn)

  /** A workout with one bench exercise and these sets: [weight, reps, done, isDrop]. */
  async function workoutWith(sets: [number, number, boolean, boolean][], finished = true) {
    return asDropper(async (tx) => {
      const [w] = await rows<{ id: string }>(tx, `insert into public.workouts (athlete_id) values ($1) returning id`, [dropper.athleteId])
      const [we] = await rows<{ id: string }>(
        tx,
        `insert into public.workout_exercises (workout_id, exercise_id, position) values ($1, $2, 0) returning id`,
        [w.id, benchId],
      )
      for (const [i, [weight, reps, done, drop]] of sets.entries()) {
        await tx.query(
          `insert into public.sets (workout_exercise_id, position, weight_kg, reps, is_drop, completed_at)
           values ($1, $2, $3, $4, $5, case when $6 then now() end)`,
          [we.id, i + 1, weight, reps, drop, done],
        )
      }
      if (finished) await tx.query(`update public.workouts set finished_at = now() where id = $1`, [w.id])
      return { workoutId: w.id, workoutExerciseId: we.id }
    })
  }

  const setsOf = (tx: Transaction, workoutExerciseId: string) =>
    rows<{ id: string; position: number; weight_kg: string; reps: number; is_drop: boolean }>(
      tx,
      `select id, position, weight_kg, reps, is_drop from public.sets where workout_exercise_id = $1 order by position`,
      [workoutExerciseId],
    )

  beforeAll(async () => {
    dropper = await createUser('Dropper')
  })

  it('counts a chain as one set with its full volume, and takes records from the first set only', async () => {
    const { workoutId } = await workoutWith([
      [80, 6, true, false],
      [60, 10, true, true],
      [40, 15, true, true],
    ])
    await asDropper(async (tx) => {
      const [summary] = await rows(tx, `select set_count, volume_kg from public.workout_summaries where id = $1`, [workoutId])
      expect(summary).toEqual({ set_count: 1, volume_kg: '1680.00' }) // 480 + 600 + 600
      const [rec] = await rows(tx, `select best_weight_kg, best_reps, best_set_volume_kg from public.exercise_records($1)`, [
        dropper.athleteId,
      ])
      // with drops, 40×15 would be the best reps and 60×10 the best set volume
      expect(rec).toEqual({ best_weight_kg: '80.00', best_reps: 6, best_set_volume_kg: '480.00' })
      const last = await rows(tx, `select weight_kg, reps, is_drop from public.last_performance($1, $2)`, [dropper.athleteId, benchId])
      expect(last).toEqual([
        { weight_kg: '80.00', reps: 6, is_drop: false },
        { weight_kg: '60.00', reps: 10, is_drop: true },
        { weight_kg: '40.00', reps: 15, is_drop: true },
      ])
    })
  })

  it('keeps a per-exercise drop size between 5% and 50%', async () => {
    await asDropper((tx) =>
      tx.query(`insert into public.athlete_exercise_settings (athlete_id, exercise_id, drop_pct) values ($1, $2, 30)`, [dropper.athleteId, benchId]),
    )
    await expect(
      asDropper((tx) => tx.query(`update public.athlete_exercise_settings set drop_pct = 80 where athlete_id = $1`, [dropper.athleteId])),
    ).rejects.toThrow(/drop_pct_check/)
  })

  it('never marks a drop as a warm-up', async () => {
    await expect(workoutWith([[80, 10, true, false]]).then(({ workoutExerciseId }) =>
      asDropper((tx) => tx.query(`update public.sets set is_warmup = true, is_drop = true where workout_exercise_id = $1`, [workoutExerciseId])),
    )).rejects.toThrow(/sets_drop_not_warmup/)
  })

  it('adds a drop right after its chain and moves the sets below it down', async () => {
    const { workoutExerciseId } = await workoutWith(
      [
        [80, 10, false, false],
        [80, 10, false, false],
      ],
      false,
    )
    await asDropper(async (tx) => {
      const [first, second] = await setsOf(tx, workoutExerciseId)
      const drop1 = crypto.randomUUID()
      const drop2 = crypto.randomUUID()
      await tx.query(`select public.add_drop_set($1, $2, 62.5)`, [drop1, first.id])
      await tx.query(`select public.add_drop_set($1, $2, 50, 6)`, [drop2, drop1])
      // a retry after a lost response changes nothing
      await tx.query(`select public.add_drop_set($1, $2, 62.5)`, [drop1, first.id])
      expect(await setsOf(tx, workoutExerciseId)).toEqual([
        { id: first.id, position: 1, weight_kg: '80.00', reps: 10, is_drop: false },
        { id: drop1, position: 2, weight_kg: '62.50', reps: 0, is_drop: true },
        { id: drop2, position: 3, weight_kg: '50.00', reps: 6, is_drop: true },
        { id: second.id, position: 4, weight_kg: '80.00', reps: 10, is_drop: false },
      ])
    })
  })

  it("doesn't add drops after a warm-up or into someone else's workout", async () => {
    const { workoutExerciseId } = await workoutWith([[20, 10, false, false]], false)
    const [warmup] = await asDropper(async (tx) => {
      await tx.query(`update public.sets set is_warmup = true where workout_exercise_id = $1`, [workoutExerciseId])
      return setsOf(tx, workoutExerciseId)
    })
    await expect(asDropper((tx) => tx.query(`select public.add_drop_set($1, $2, 10)`, [crypto.randomUUID(), warmup.id]))).rejects.toThrow(
      /follows a working set/,
    )
    await expect(asUser(bohdan.userId, (tx) => tx.query(`select public.add_drop_set($1, $2, 10)`, [crypto.randomUUID(), warmup.id]))).rejects.toThrow(
      /not found/,
    )
  })

  it('plans drops in a template, "as many as you can" included, and starts them as drops', async () => {
    const plan = [
      { w: 40, r: 10, warmup: true },
      { w: 80, r: 10 },
      { w: 80, r: 10 },
      { w: 60, r: 0, drop: true },
      { w: 40, r: 8, drop: true },
    ]
    await asDropper(async (tx) => {
      const [tpl] = await rows<{ id: string }>(tx, `select public.save_template(null, 'Дропи', null, $1::jsonb) as id`, [
        items({ exercise_id: benchId, sets: plan }),
      ])
      const [te] = await rows(tx, `select target_sets from public.template_exercises where template_id = $1`, [tpl.id])
      expect(te).toEqual({ target_sets: 2 })
      const [w] = await rows<{ id: string }>(tx, `select public.start_workout_from_template($1, $2) as id`, [dropper.athleteId, tpl.id])
      const sets = await rows(
        tx,
        `select s.weight_kg, s.reps, s.is_warmup, s.is_drop from public.sets s
         join public.workout_exercises we on we.id = s.workout_exercise_id
         where we.workout_id = $1 order by s.position`,
        [w.id],
      )
      expect(sets).toEqual([
        { weight_kg: '40.00', reps: 10, is_warmup: true, is_drop: false },
        { weight_kg: '80.00', reps: 10, is_warmup: false, is_drop: false },
        { weight_kg: '80.00', reps: 10, is_warmup: false, is_drop: false },
        { weight_kg: '60.00', reps: 0, is_warmup: false, is_drop: true },
        { weight_kg: '40.00', reps: 8, is_warmup: false, is_drop: true },
      ])
      await tx.query(`delete from public.workouts where id = $1`, [w.id])
    })
  })

  it('rejects drops that follow nothing, a warm-up, or are warm-ups themselves', async () => {
    for (const bad of [
      [{ w: 60, r: 0, drop: true }],
      [{ w: 20, r: 10, warmup: true }, { w: 15, r: 0, drop: true }],
      [{ w: 80, r: 10 }, { w: 60, r: 8, drop: true, warmup: true }],
      [{ w: 80, r: 10 }, { w: 60, r: 8, drop: 'yes' }],
      [{ w: 80, r: 0 }],
    ]) {
      await expect(
        asDropper((tx) => tx.query(`select public.save_template(null, 'x', null, $1::jsonb)`, [items({ exercise_id: benchId, sets: bad })])),
      ).rejects.toThrow(/template_exercises_sets_valid/)
    }
  })

  it("numbers template sets from last time's working sets, skipping drops", async () => {
    await workoutWith([
      [70, 10, true, false],
      [50, 10, true, true],
      [75, 8, true, false],
    ])
    await asDropper(async (tx) => {
      const [tpl] = await rows<{ id: string }>(tx, `select public.save_template(null, 'Просто', null, $1::jsonb) as id`, [
        items({ exercise_id: benchId, target_sets: 2 }),
      ])
      const [w] = await rows<{ id: string }>(tx, `select public.start_workout_from_template($1, $2) as id`, [dropper.athleteId, tpl.id])
      const sets = await rows(
        tx,
        `select s.weight_kg, s.reps, s.is_drop from public.sets s
         join public.workout_exercises we on we.id = s.workout_exercise_id
         where we.workout_id = $1 order by s.position`,
        [w.id],
      )
      expect(sets).toEqual([
        { weight_kg: '70.00', reps: 10, is_drop: false },
        { weight_kg: '75.00', reps: 8, is_drop: false },
      ])
      await tx.query(`delete from public.workouts where id = $1`, [w.id])
    })
  })
})
