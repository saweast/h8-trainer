// Downloads the start/end photos of every catalog exercise from free-exercise-db (Unlicense,
// public domain) and writes small webp files the app serves statically:
//   public/exercise-photos/<slug>/start.webp  480 px wide, start position
//   public/exercise-photos/<slug>/end.webp    480 px wide, end position
//   public/exercise-photos/<slug>/thumb.webp  96×96 crop of the start photo, for lists
// Which source exercise belongs to which slug lives in src/data/exercise-media.json.
// An entry with "thumb": "end" crops the thumbnail from the end photo instead.
// Usage: node scripts/build-exercise-media.mjs [--force] [--only=<slug>]
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Pinned so a rerun produces the same files.
const DATASET = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises'
const root = new URL('../', import.meta.url)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
const force = process.argv.includes('--force') || Boolean(only)

const media = JSON.parse(await readFile(new URL('src/data/exercise-media.json', root), 'utf8'))

async function exists(url) {
  try {
    await access(url)
    return true
  } catch {
    return false
  }
}

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

let written = 0
for (const [slug, entry] of Object.entries(media)) {
  if (!entry.images || (only && slug !== only)) continue
  const dir = new URL(`public/exercise-photos/${slug}/`, root)
  if (!force && (await exists(new URL('thumb.webp', dir)))) continue
  await mkdir(dir, { recursive: true })

  const [start, end] = await Promise.all([
    download(`${DATASET}/${entry.source}/0.jpg`),
    download(`${DATASET}/${entry.source}/1.jpg`),
  ])
  const photo = (buf) => sharp(buf).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer()
  const thumb = sharp(entry.thumb === 'end' ? end : start).resize(96, 96, { fit: 'cover', position: 'attention' }).webp({ quality: 70 }).toBuffer()

  const [startWebp, endWebp, thumbWebp] = await Promise.all([photo(start), photo(end), thumb])
  await writeFile(new URL('start.webp', dir), startWebp)
  await writeFile(new URL('end.webp', dir), endWebp)
  await writeFile(new URL('thumb.webp', dir), thumbWebp)
  written++
  console.log(`${slug}: ${startWebp.length + endWebp.length + thumbWebp.length} bytes`)
}
console.log(`done, ${written} exercises written`)
