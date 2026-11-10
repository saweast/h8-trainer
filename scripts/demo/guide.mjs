// Builds the "Як працює h8" guide page from the recorded flows:
// demo/out/<flow>/steps.json + NN.png and demo/videos/<flow>.mp4 → demo/guide/
//   index.html, videos/<flow>.mp4, shots/<flow>-NN.jpg
// The page is published as an Artifact (the skeleton is added at publish time).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { root } from './env.mjs'

const OUT = join(root, 'demo', 'out')
const GUIDE = join(root, 'demo', 'guide')

const GROUPS = [
  { key: 'client', title: 'Для клієнта', intro: 'Тренування самому і за планом тренера, прогрес, каталог вправ.', audiences: ['client', 'all'] },
  { key: 'trainer', title: 'Для тренера', intro: 'Заняття з клієнтом, шаблони й плани по тижнях, відгуки, запрошення, пакети.', audiences: ['trainer'] },
  { key: 'internal', title: 'Внутрішнє', intro: 'Як користувач отримує режим тренера.', audiences: ['internal'] },
]
const TAG = { client: 'Для клієнта', trainer: 'Для тренера', all: 'Для всіх', internal: 'Внутрішнє' }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function loadFlows() {
  return readdirSync(OUT)
    .filter((d) => existsSync(join(OUT, d, 'steps.json')))
    .sort()
    .map((d) => JSON.parse(readFileSync(join(OUT, d, 'steps.json'), 'utf8')))
}

function buildAssets(flows) {
  rmSync(GUIDE, { recursive: true, force: true })
  mkdirSync(join(GUIDE, 'videos'), { recursive: true })
  mkdirSync(join(GUIDE, 'shots'), { recursive: true })
  for (const f of flows) {
    copyFileSync(join(root, 'demo', 'videos', `${f.id}.mp4`), join(GUIDE, 'videos', `${f.id}.mp4`))
    const width = f.viewport === 'desktop' ? 720 : 360
    for (const s of f.steps) {
      execFileSync(ffmpegPath, [
        '-loglevel', 'error', '-y', '-i', join(OUT, f.id, s.image),
        '-vf', `scale=${width}:-2`, '-q:v', '5', join(GUIDE, 'shots', `${f.id}-${String(s.n).padStart(2, '0')}.jpg`),
      ])
    }
  }
}

function flowSection(f) {
  const shot = (s) => `shots/${f.id}-${String(s.n).padStart(2, '0')}.jpg`
  const wide = f.viewport === 'desktop'
  const steps = f.steps
    .map(
      (s) => `
        <li class="step" data-at="${s.at}">
          <button type="button" class="step-btn" aria-label="Перемотати відео до кроку ${s.n}">
            <img src="${shot(s)}" alt="" loading="lazy" class="thumb${wide ? ' thumb-wide' : ''}">
            <span class="step-text">
              <span class="step-n">${s.n}<span class="step-time">${clock(s.at)}</span></span>
              <span class="step-caption">${esc(s.caption)}</span>
            </span>
          </button>
        </li>`,
    )
    .join('')
  return `
    <section class="flow${wide ? ' flow-wide' : ''}" id="${f.id}" data-audience="${f.audience}">
      <header class="flow-head">
        <p class="flow-meta"><span class="tag tag-${f.audience}">${TAG[f.audience]}</span><span>${f.steps.length} кроків · ${clock(f.duration)}</span>${wide ? '<span>комп’ютер</span>' : '<span>телефон</span>'}</p>
        <h3>${esc(f.title)}</h3>
        <p class="flow-sub">${esc(f.subtitle)}</p>
      </header>
      <div class="flow-body">
        <figure class="player">
          <video controls playsinline preload="metadata" poster="${shot(f.steps[0])}" src="videos/${f.id}.mp4"></video>
          <figcaption><a href="videos/${f.id}.mp4" target="_blank" rel="noopener">Відкрити відео окремо</a></figcaption>
        </figure>
        <ol class="steps">${steps}
        </ol>
      </div>
    </section>`
}

function page(flows) {
  const byGroup = GROUPS.map((g) => ({ ...g, flows: flows.filter((f) => g.audiences.includes(f.audience)) })).filter((g) => g.flows.length)
  const total = flows.reduce((s, f) => s + f.duration, 0)
  const toc = byGroup
    .map(
      (g) => `
      <div class="toc-group">
        <p class="toc-title">${g.title}</p>
        <ul>${g.flows.map((f) => `<li><a href="#${f.id}">${esc(f.title)}</a><span>${clock(f.duration)}</span></li>`).join('')}</ul>
      </div>`,
    )
    .join('')
  const sections = byGroup
    .map(
      (g) => `
    <div class="group" data-group="${g.key}">
      <div class="group-head">
        <h2>${g.title}</h2>
        <p>${g.intro}</p>
      </div>
      ${g.flows.map(flowSection).join('')}
    </div>`,
    )
    .join('')

  return `<title>Як працює h8</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Unbounded:wght@500;700&display=swap">
<style>
  /* Layout: one reading column; each flow = player beside its numbered steps, stacked on phones. */
  :root {
    --bg: #0b0b0c; --surface: #151517; --raised: #1c1c20; --line: #2a2a30;
    --fg: #f4f4f5; --muted: #a1a1aa; --accent: #c6f432; --accent-ink: #0a0a0a; --accent-text: #c6f432;
    --trainer: #a78bfa; --trainer-bg: rgba(167, 139, 250, .16); --client-bg: rgba(198, 244, 50, .14); --internal-bg: rgba(161, 161, 170, .16);
    --font-display: "Unbounded", "Inter", system-ui, sans-serif;
    --font-body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
    color-scheme: dark;
  }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {
    --bg: #f6f6f3; --surface: #ffffff; --raised: #f0f0ec; --line: #e2e2dc;
    --fg: #0b0b0c; --muted: #5b5b63; --accent: #c6f432; --accent-ink: #0a0a0a; --accent-text: #4a6400;
    --trainer: #6d4fd6; --trainer-bg: rgba(109, 79, 214, .12); --client-bg: rgba(122, 160, 0, .14); --internal-bg: rgba(91, 91, 99, .12);
    color-scheme: light;
  } }
  :root[data-theme="light"] {
    --bg: #f6f6f3; --surface: #ffffff; --raised: #f0f0ec; --line: #e2e2dc;
    --fg: #0b0b0c; --muted: #5b5b63; --accent: #c6f432; --accent-ink: #0a0a0a; --accent-text: #4a6400;
    --trainer: #6d4fd6; --trainer-bg: rgba(109, 79, 214, .12); --client-bg: rgba(122, 160, 0, .14); --internal-bg: rgba(91, 91, 99, .12);
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font: 400 15px/1.55 var(--font-body);
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .wrap { max-width: 1080px; margin: 0 auto; padding-block: 40px 72px; display: flex; flex-direction: column; gap: 56px; }
  a { color: var(--accent-text); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 8px; }

  .intro { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 40px; align-items: start; }
  .logo { font: 700 22px var(--font-display); margin: 0 0 20px; }
  .logo b { color: var(--accent); }
  h1 { font: 700 clamp(32px, 6vw, 56px)/1.05 var(--font-display); margin: 0 0 18px; text-wrap: balance; letter-spacing: -.01em; }
  .lede { color: var(--muted); max-width: 58ch; margin: 0 0 22px; font-size: 16px; }
  .facts { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: 13px; padding: 0; margin: 0; list-style: none; }
  .facts b { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
  .chip { border: 1px solid var(--line); background: var(--surface); color: var(--fg); font: 500 13px var(--font-body);
    padding: 8px 14px; border-radius: 999px; cursor: pointer; }
  .chip[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .toc { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .toc-title { margin: 0 0 6px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .toc ul { list-style: none; margin: 0; padding: 0; }
  .toc li { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; }
  .toc li a { color: var(--fg); text-decoration: none; }
  .toc li a:hover { color: var(--accent-text); }
  .toc li span { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; }

  .group { display: flex; flex-direction: column; gap: 40px; }
  .group-head { border-top: 1px solid var(--line); padding-top: 28px; }
  .group-head h2 { font: 700 clamp(22px, 3.4vw, 30px) var(--font-display); margin: 0 0 6px; }
  .group-head p { margin: 0; color: var(--muted); }

  .flow { display: flex; flex-direction: column; gap: 18px; scroll-margin-top: 24px; }
  .flow-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0 0 8px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
  .tag { font-weight: 600; font-size: 12px; padding: 3px 10px; border-radius: 999px; }
  .tag-client, .tag-all { background: var(--client-bg); color: var(--accent-text); }
  .tag-trainer { background: var(--trainer-bg); color: var(--trainer); }
  .tag-internal { background: var(--internal-bg); color: var(--muted); }
  .flow h3 { font: 700 clamp(20px, 2.8vw, 26px)/1.2 var(--font-display); margin: 0 0 4px; text-wrap: balance; }
  .flow-sub { margin: 0; color: var(--muted); max-width: 62ch; }

  .flow-body { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
  .flow-wide .flow-body { grid-template-columns: minmax(0, 1fr); }
  .player { margin: 0; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); }
  .player video { width: 100%; max-width: 100%; display: block; border-radius: 18px; background: #000; border: 1px solid var(--line); }
  .flow-wide .player { position: static; }
  .player figcaption { margin-top: 8px; font-size: 13px; }

  .steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr)); gap: 12px; }
  .flow-wide .steps { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
  .step-btn { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 10px; text-align: left; cursor: pointer;
    background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px; color: var(--fg); font: inherit; }
  .step-btn:hover { border-color: var(--muted); }
  .step.is-current .step-btn { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .thumb { width: 100%; max-width: 100%; aspect-ratio: 390 / 844; object-fit: cover; object-position: top; border-radius: 9px; background: var(--raised); }
  .thumb-wide { aspect-ratio: 1440 / 900; }
  .step-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .step-n { display: flex; justify-content: space-between; font: 600 12px var(--font-body); color: var(--accent-text); font-variant-numeric: tabular-nums; }
  .step-time { color: var(--muted); font-weight: 500; }
  .step-caption { font-size: 14px; line-height: 1.45; }

  .howto { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 22px; color: var(--muted); }
  .howto h2 { font: 700 18px var(--font-display); color: var(--fg); margin: 0 0 8px; }
  .howto p { margin: 0 0 8px; max-width: 70ch; }
  .howto code { font: 13px ui-monospace, "SF Mono", Menlo, monospace; background: var(--raised); color: var(--fg); padding: 2px 6px; border-radius: 6px; }

  @media (max-width: 860px) {
    .intro { grid-template-columns: minmax(0, 1fr); gap: 24px; }
    .flow-body { grid-template-columns: minmax(0, 1fr); }
    .player { position: static; max-width: 340px; }
    .flow-wide .player { max-width: none; }
  }
  @media (max-width: 480px) {
    .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .flow-wide .steps { grid-template-columns: minmax(0, 1fr); }
    .step-caption { font-size: 13px; }
  }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>

<main class="wrap">
  <header class="intro">
    <div>
      <p class="logo">h8<b>.</b> trainer</p>
      <h1>Як працює h8</h1>
      <p class="lede">Журнал тренувань для залу і для тренерів. Тут кожен сценарій показано окремим коротким відео з підписами кроків, а під ним — ті самі кроки скрінами. Тап по кроку перемотує відео до цього місця.</p>
      <ul class="facts">
        <li><b>${flows.length}</b> сценаріїв</li>
        <li><b>${Math.round(total / 60)} хв</b> відео загалом</li>
        <li><b>${flows.reduce((s, f) => s + f.steps.length, 0)}</b> кроків</li>
        <li>демо-дані, вигадані люди</li>
      </ul>
      <div class="filters" role="group" aria-label="Показати сценарії">
        <button type="button" class="chip" data-filter="all" aria-pressed="true">Усі</button>
        <button type="button" class="chip" data-filter="client" aria-pressed="false">Для клієнта</button>
        <button type="button" class="chip" data-filter="trainer" aria-pressed="false">Для тренера</button>
        <button type="button" class="chip" data-filter="internal" aria-pressed="false">Внутрішнє</button>
      </div>
    </div>
    <nav class="toc" aria-label="Зміст">${toc}
    </nav>
  </header>
${sections}
  <aside class="howto">
    <h2>Як оновити відео</h2>
    <p>Записи зроблено автоматично на локальній копії бази з демо-акаунтами: Олена Коваль — тренерка, Андрій Мельник, Ірина Бондар і Марко Ткач — її клієнти, Софія Литвин тренується сама.</p>
    <p>Після змін в інтерфейсі все перезаписується однією командою: <code>npm run demo:record</code>, або один сценарій: <code>npm run demo:record -- 05</code>.</p>
  </aside>
</main>

<script>
  document.querySelectorAll('.flow').forEach((flow) => {
    const video = flow.querySelector('video')
    const steps = [...flow.querySelectorAll('.step')]
    const ats = steps.map((s) => Number(s.dataset.at))
    steps.forEach((step, i) => {
      step.querySelector('button').addEventListener('click', () => {
        video.currentTime = ats[i] + 0.05
        video.play().catch(() => {})
        if (window.matchMedia('(max-width: 860px)').matches) video.scrollIntoView({ block: 'center' })
      })
    })
    video.addEventListener('timeupdate', () => {
      let current = -1
      ats.forEach((at, i) => { if (video.currentTime >= at) current = i })
      steps.forEach((s, i) => s.classList.toggle('is-current', i === current && !video.paused))
    })
    video.addEventListener('pause', () => steps.forEach((s) => s.classList.remove('is-current')))
    video.addEventListener('play', () => document.querySelectorAll('video').forEach((v) => { if (v !== video) v.pause() }))
  })
  const chips = [...document.querySelectorAll('.chip')]
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const f = chip.dataset.filter
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)))
    document.querySelectorAll('.group').forEach((g) => { g.hidden = f !== 'all' && g.dataset.group !== f })
  }))
</script>
`
}

const flows = loadFlows()
buildAssets(flows)
writeFileSync(join(GUIDE, 'index.html'), page(flows))
console.log(`guide: ${flows.length} flows → ${join(GUIDE, 'index.html').replace(root + '/', '')}`)
