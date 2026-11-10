// Local Supabase connection for the demo scripts, read from `supabase status`.
// Never points at the linked (production) project.
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const root = join(import.meta.dirname, '..', '..')

let cached
export function localEnv() {
  if (cached) return cached
  const out = execSync('npx supabase status -o env', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  const env = Object.fromEntries(
    out
      .split('\n')
      .map((l) => l.match(/^([A-Z_0-9]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  )
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API_URL ?? '')) {
    throw new Error(`Local Supabase is not running (API_URL=${env.API_URL}). Run: npm run demo:up`)
  }
  cached = { url: env.API_URL, anonKey: env.ANON_KEY, serviceKey: env.SERVICE_ROLE_KEY }
  return cached
}

/** `.env.demo.local` → `vite --mode demo` talks to the local stack instead of production. */
export function writeViteEnv() {
  const { url, anonKey } = localEnv()
  writeFileSync(join(root, '.env.demo.local'), `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`)
}

export const DEMO_PASSWORD = 'demo-pass-12345'
export const DEMO_PORT = 5175
export const APP_URL = `http://localhost:${DEMO_PORT}/h8-trainer`
