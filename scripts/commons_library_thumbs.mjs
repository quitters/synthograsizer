// Pictures for the library cards the desk may not run: the built-in pieces and
// the inherited p5 library. Each is put on a real wall (the local, in-memory
// Commons: python scripts/commons_local.py), left to run, and photographed with
// the overlays hidden, into static/thecommons/img/library/<preset id>.jpg, which
// the presets list then offers as the card's `thumb`.
//
//   node scripts/commons_library_thumbs.mjs [--only builtin-0,inherited-flow-field] [--seconds 7]
//        [--commons http://127.0.0.1:8000] [--headless <path to a headless.mjs>]
//
// The browser driver is the generative art archive's (tools/lib/headless.mjs):
// headless Edge or Chrome over the DevTools protocol, no dependencies.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : def }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const COMMONS = arg('commons', 'http://127.0.0.1:8000')
const SECONDS = Number(arg('seconds', 7))
const ONLY = arg('only', null)?.split(',')
const HEADLESS = arg('headless', resolve(ROOT, '..', '02_Generative_Art', 'FxHashBackup', 'tools', 'lib', 'headless.mjs'))
const OUT = join(ROOT, 'static', 'thecommons', 'img', 'library')
const KINDS = ['Built-in pieces', 'Inherited library']

const { launchBrowser } = await import(pathToFileURL(HEADLESS).href)
const signin = await fetch(`${COMMONS}/dev/signin`, { redirect: 'manual' })
const cookie = (signin.headers.get('set-cookie') || '').split(';')[0]
if (!cookie) throw new Error(`no session from ${COMMONS}/dev/signin: is scripts/commons_local.py running?`)
const api = async (path, body) => {
  const res = await fetch(`${COMMONS}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, origin: COMMONS, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

const room = await api('/api/thecommons/rooms', { name: 'Library thumbnails' })
const { presets } = await api(`/api/thecommons/rooms/${room.id}/presets`)
const wanted = presets.filter((p) => KINDS.includes(p.kind) && (!ONLY || ONLY.includes(p.id)))
mkdirSync(OUT, { recursive: true })
const browser = await launchBrowser()
// Overlays off, then two frames so the wall is what the picture shows.
const HIDE = `(async () => { document.getElementById('displayOverlays').hidden = true; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true })()`
let done = 0
try {
  for (const preset of wanted) {
    await api(`/api/thecommons/rooms/${room.id}/presets/load`, { presetId: preset.id })
    const r = await browser.run(`${COMMONS}/thecommons/display/${room.joinCode}`, { budgetMs: 0, settleMs: SECONDS * 1000, evaluate: HIDE, jpegQuality: 84, width: 640, height: 360 })
    if (!r.shot) { console.log(`${preset.id}: no picture (${r.errors.at(-1) ?? 'unknown'})`); continue }
    writeFileSync(join(OUT, `${preset.id}.jpg`), r.shot)
    done++
    console.log(`${preset.id}: ${(r.shot.length / 1024).toFixed(0)} KB${r.errors.length ? `, ${r.errors.length} page error(s)` : ''}`)
  }
} finally {
  await browser.close()
}
console.log(`${done} of ${wanted.length} written to ${OUT}`)
