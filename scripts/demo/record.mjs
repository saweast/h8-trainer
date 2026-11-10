// Records the demo flow videos against the local Supabase stack.
//   npm run demo:record            → every flow
//   npm run demo:record -- 01 05   → flows whose id contains "01" or "05"
// Each flow: reset DB → seed → drive the app in Chromium (Playwright records video) → ffmpeg
// trims and joins the segments and draws the step captions in a panel under the screen.
// Output: demo/videos/<id>.mp4, demo/out/<id>/NN.png + steps.json (for the guide page).
import { execFileSync, execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import ffmpegPath from 'ffmpeg-static'
import { chromium } from 'playwright'
import { DEMO_PASSWORD, localEnv, root, writeViteEnv } from './env.mjs'

const PREVIEW_PORT = 5176
export const BASE = `http://localhost:${PREVIEW_PORT}/h8-trainer`
const DEMO = join(root, 'demo')
const BUILD = join(DEMO, '.build')
const FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
const FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
const LIME = '0xc6f432'
const PANEL_BG = '0x0b0b0c'

const LAYOUT = {
  mobile: { viewport: { width: 390, height: 844 }, scale: 2, panel: 300, size: 38, counter: 28, wrap: 32, pad: 44 },
  desktop: { viewport: { width: 1440, height: 900 }, scale: 1, panel: 150, size: 30, counter: 22, wrap: 86, pad: 40 },
}

const AUDIENCE = { client: 'Для клієнта', trainer: 'Для тренера', all: 'Для всіх', internal: 'Внутрішнє' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- environment -----------------------------------------------------------------------------

function buildApp() {
  writeViteEnv()
  execSync(`npx vite build --mode demo --outDir ${BUILD} --emptyOutDir --logLevel warn`, { cwd: root, stdio: 'inherit' })
}

async function startPreview() {
  const proc = spawn('npx', ['vite', 'preview', '--mode', 'demo', '--outDir', BUILD, '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/`)).ok) return proc
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  proc.kill()
  throw new Error('vite preview did not start')
}

function resetDb() {
  execSync('npx supabase db reset --yes', { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
}

async function sessionFor(email) {
  const { url, anonKey } = localEnv()
  const db = createClient(url, anonKey, { auth: { persistSession: false }, realtime: { transport: class {} } })
  const { data, error } = await db.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) throw new Error(`sign in ${email}: ${error.message}`)
  return data.session
}

const storageKey = () => `sb-${new URL(localEnv().url).hostname.split('.')[0]}-auth-token`

// --- recorder --------------------------------------------------------------------------------

export class Recorder {
  constructor(browser, flow) {
    this.browser = browser
    this.flow = flow
    this.layout = LAYOUT[flow.viewport ?? 'mobile']
    this.out = join(DEMO, 'out', flow.id)
    this.raw = join(this.out, 'raw')
    rmSync(this.out, { recursive: true, force: true })
    mkdirSync(this.raw, { recursive: true })
    this.segments = []
    this.captions = []
    this.steps = []
    this.n = 0
    this.seg = null
  }

  get page() {
    return this.seg.page
  }

  /** New segment: a fresh browser context signed in as `email` (or signed out with null). */
  async open(email, path = '/', { title = this.segments.length === 0 } = {}) {
    await this.closeSegment()
    const { viewport, scale } = this.layout
    const mobile = this.flow.viewport !== 'desktop'
    const ctx = await this.browser.newContext({
      viewport,
      deviceScaleFactor: scale,
      isMobile: mobile,
      hasTouch: mobile,
      locale: 'uk-UA',
      colorScheme: 'dark',
      recordVideo: { dir: this.raw, size: { width: viewport.width * scale, height: viewport.height * scale } },
    })
    if (email) {
      const session = await sessionFor(email)
      await ctx.addInitScript(
        ([key, value]) => {
          if (!localStorage.getItem(key)) localStorage.setItem(key, value)
        },
        [storageKey(), JSON.stringify(session)],
      )
    }
    await ctx.addInitScript({ path: join(import.meta.dirname, 'overlay.js') })
    const created = Date.now()
    const page = await ctx.newPage()
    page.setDefaultTimeout(15_000)
    await page.goto(`${BASE}${path}`)
    await page.waitForLoadState('networkidle')
    if (title) await page.evaluate(([t, s, tag]) => window.__demo.title(t, s, tag), [this.flow.title, this.flow.subtitle, AUDIENCE[this.flow.audience]])
    await sleep(400)
    this.seg = { ctx, page, created, start: Date.now(), index: this.segments.length }
    this.segments.push(this.seg)
    if (title) {
      await sleep(2600)
      await page.evaluate(() => window.__demo.clearTitle())
      await sleep(500)
    }
    return page
  }

  async closeSegment() {
    if (!this.seg) return
    const { ctx, page } = this.seg
    await sleep(900)
    this.seg.end = Date.now()
    const video = page.video()
    await ctx.close()
    this.seg.file = await video.path()
    this.seg = null
  }

  /** One step: caption appears, then the action, then a pause; a screenshot goes to the guide. */
  async step(caption, action, { hold = 1500, read = 1100 } = {}) {
    const n = ++this.n
    this.captions.push({ segment: this.seg.index, t: (Date.now() - this.seg.start) / 1000, text: caption, n })
    await sleep(read)
    if (action) await action()
    await sleep(hold)
    const image = `${String(n).padStart(2, '0')}.png`
    await this.page.screenshot({ path: join(this.out, image) })
    this.steps.push({ n, caption, image })
  }

  /** Shows where the tap lands, then taps. Accepts a Locator. */
  async tap(locator, { pause = 500 } = {}) {
    await locator.waitFor({ state: 'visible' })
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    if (box) {
      await this.page.evaluate(([x, y]) => window.__demo?.point(x, y), [box.x + box.width / 2, box.y + box.height / 2])
      await sleep(pause)
    }
    await locator.click()
  }

  /** Taps a field, clears it and types like a person. */
  async type(locator, text, { delay = 70, clear = true } = {}) {
    await this.tap(locator)
    if (clear) await locator.fill('')
    await locator.pressSequentially(text, { delay })
  }

  async scroll(dy, { steps = 8 } = {}) {
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, dy / steps)
      await sleep(40)
    }
    await sleep(300)
  }

  wait(ms) {
    return sleep(ms)
  }

  async finish() {
    await this.closeSegment()
    const result = this.render()
    // `at`: where the step's caption starts in the final video, for "jump to step" in the guide
    const steps = this.steps.map((s) => ({ ...s, at: Number(result.starts[s.n].toFixed(2)) }))
    writeFileSync(
      join(this.out, 'steps.json'),
      JSON.stringify({ ...this.flowMeta(), duration: Number(result.duration.toFixed(1)), steps }, null, 2),
    )
    return result
  }

  flowMeta() {
    const { id, title, subtitle, audience, viewport = 'mobile' } = this.flow
    return { id, title, subtitle, audience, viewport }
  }

  // --- ffmpeg ------------------------------------------------------------------------------

  render() {
    const { panel, size, counter, wrap, pad, scale, viewport } = this.layout
    const W = viewport.width * scale
    const H = viewport.height * scale
    const total = this.n
    const inputs = []
    const parts = []
    let offset = 0
    const segOffset = []
    this.segments.forEach((s, i) => {
      const trimStart = (s.start - s.created) / 1000
      const duration = (s.end - s.start) / 1000
      inputs.push('-i', s.file)
      parts.push(`[${i}:v]trim=start=${trimStart.toFixed(2)}:duration=${duration.toFixed(2)},setpts=PTS-STARTPTS,fps=30,scale=${W}:${H},setsar=1[v${i}]`)
      segOffset.push(offset)
      offset += duration
    })
    const totalDuration = offset
    const textDir = join(this.out, 'text')
    mkdirSync(textDir, { recursive: true })
    const esc = (p) => p.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')
    const draw = []
    const titleFile = join(textDir, 'title.txt')
    writeFileSync(titleFile, this.flow.title)
    const top = H + Math.round(pad * 0.75)
    const starts = {}
    this.captions.forEach((c, i) => {
      const from = segOffset[c.segment] + c.t
      starts[c.n] = from
      const next = this.captions[i + 1]
      const to = next ? segOffset[next.segment] + next.t : totalDuration
      const file = join(textDir, `${c.n}.txt`)
      writeFileSync(file, wrapText(c.text, wrap))
      const counterFile = join(textDir, `${c.n}-n.txt`)
      writeFileSync(counterFile, `${c.n} / ${total}`)
      const enable = `between(t,${from.toFixed(2)},${to.toFixed(2)})`
      draw.push(
        `drawtext=fontfile='${esc(FONT_BOLD)}':textfile='${esc(counterFile)}':fontcolor=${LIME}:fontsize=${counter}:x=${pad}:y=${top}:enable='${enable}'`,
        `drawtext=fontfile='${esc(FONT_BOLD)}':textfile='${esc(file)}':fontcolor=white:fontsize=${size}:line_spacing=${Math.round(size * 0.3)}:x=${pad}:y=${top + Math.round(counter * 1.7)}:enable='${enable}'`,
      )
    })
    draw.push(
      `drawtext=fontfile='${esc(FONT)}':textfile='${esc(titleFile)}':fontcolor=0x8a8a93:fontsize=${counter}:x=w-tw-${pad}:y=${top}`,
    )
    const concat = this.segments.map((_, i) => `[v${i}]`).join('') + `concat=n=${this.segments.length}:v=1:a=0[cat]`
    const filter = [...parts, concat, `[cat]pad=${W}:${H + panel}:0:0:color=${PANEL_BG},${draw.join(',')}[out]`].join(';\n')
    const filterFile = join(this.out, 'filter.txt')
    writeFileSync(filterFile, filter)
    const videos = join(DEMO, 'videos')
    mkdirSync(videos, { recursive: true })
    const target = join(videos, `${this.flow.id}.mp4`)
    execFileSync(
      ffmpegPath,
      [
        '-y', '-loglevel', 'error', ...inputs,
        '-filter_complex_script', filterFile, '-map', '[out]',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', this.flow.viewport === 'desktop' ? '24' : '27',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target,
      ],
      { stdio: 'inherit' },
    )
    rmSync(this.raw, { recursive: true, force: true })
    return { target, duration: totalDuration, steps: total, starts }
  }
}

function wrapText(text, max) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

// --- main ------------------------------------------------------------------------------------

async function main() {
  const filters = process.argv.slice(2)
  const flowDir = join(import.meta.dirname, 'flows')
  const files = readdirSync(flowDir)
    .filter((f) => f.endsWith('.mjs'))
    .sort()
    .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  if (!files.length) throw new Error(`no flows match ${filters.join(', ')}`)

  if (!existsSync(join(BUILD, 'index.html')) || !process.env.DEMO_SKIP_BUILD) buildApp()
  const preview = await startPreview()
  // Headed: headless Chromium screencasts at 1x, so video text would be blurry. The window is
  // parked off-screen while it records.
  const browser = await chromium.launch({ headless: false, args: ['--window-position=4000,0'] })
  const { seed } = await import('./seed.mjs')
  try {
    for (const file of files) {
      const flow = (await import(join(flowDir, file))).default
      process.stdout.write(`▶ ${flow.id} … `)
      resetDb()
      const data = await seed()
      const rec = new Recorder(browser, flow)
      try {
        await flow.run(rec, data)
      } catch (e) {
        await rec.seg?.page.screenshot({ path: join(rec.out, "error.png") }).catch(() => {})
        throw e
      }
      const { target, duration, steps } = await rec.finish()
      console.log(`${steps} steps, ${duration.toFixed(0)} s → ${target.replace(root + '/', '')}`)
    }
  } finally {
    await browser.close()
    preview.kill()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
