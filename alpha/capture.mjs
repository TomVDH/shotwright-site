// Captures full-window stills of a Shotwright build for the landing page.
// Usage: node site/alpha/capture.mjs [appDir] [outDir]
// appDir needs package.json, a built out/ and node_modules.
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const appDir = resolve(process.argv[2] ?? '.')
const outDir = resolve(process.argv[3] ?? join(tmpdir(), 'shotwright-landing-shots'))
const require = createRequire(join(appDir, 'package.json'))
const { _electron: electron } = require('@playwright/test')
mkdirSync(outDir, { recursive: true })

// Temp userData and Documents keep Tom's own files untouched.
const documents = join(mkdtempSync(join(tmpdir(), 'swland-docs-')), 'Documents')
mkdirSync(documents)
const env = {
  ...process.env,
  SHOT_STAGE_USERDATA: mkdtempSync(join(tmpdir(), 'swland-ud-')),
  SHOT_STAGE_DOCUMENTS: documents,
  SHOT_STAGE_OFFSCREEN: '1'
}
delete env.SHOT_STAGE_OPEN

// Each shot names a scene, time, view, tab and framing group.
const booth = [['actor', 'mara'], ['actor', 'dex'], ['actor', 'suzanne'], ['box', 'bTable'], ['box', 'bBoothL'], ['box', 'bBoothR']]
const shots = [
  { tag: 'hero-persp', scene: 'sDiner', t: 15.5, view: 'persp', tab: 'inspector', group: booth, orbit: [-40, -12] },
  { tag: 'hero-prompt', scene: 'sDiner', t: 12, view: 'persp', tab: 'prompt', group: booth, orbit: [-40, -12] },
  { tag: 'diner-top', scene: 'sDiner', t: 15.5, view: 'top', tab: 'inspector', group: booth },
  { tag: 'diner-packet', scene: 'sDiner', t: 20.5, view: 'persp', tab: 'packet', group: booth, orbit: [60, -6] }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Scale factor 2 gives 3200 x 2000 stills for sharp crops.
const app = await electron.launch({ args: ['.', '--force-device-scale-factor=2'], cwd: appDir, env })
const pid = app.process().pid

try {
  const win = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
  await win.getByTestId('welcome-getting-started').click()
  await win.getByTestId('project-name').waitFor()
  await sleep(2000)
  for (const s of shots) {
    await win.evaluate((s) => {
      const st = window.__shotStage.store.getState()
      st.openScene(s.scene)
      st.setPlayhead(s.t)
      st.setUi({ view: s.view, lookThrough: false, tab: s.tab })
    }, s)
    await sleep(900)
    await win.evaluate((s) => {
      const st = window.__shotStage.store.getState()
      s.group.forEach(([kind, id], i) => st.select({ kind, id }, i > 0))
      window.__shotStage.stage.frameSelected()
    }, s)
    await sleep(1600)
    if (s.orbit) {
      await win.evaluate((o) => window.__shotStage.stage.orbitBy(o[0], o[1]), s.orbit)
      await sleep(900)
    }
    await win.evaluate((s) => {
      const st = window.__shotStage.store.getState()
      const startOf = (c) => c.start ?? c.at ?? 0
      const cuts = [...st.scenes[s.scene].cuts].sort((a, b) => startOf(a) - startOf(b))
      // The live cut at time t names the camera to select.
      const cut = cuts.filter((c) => startOf(c) <= s.t).pop() ?? cuts[0]
      st.select({ kind: 'camera', id: cut.camera ?? cut.cameraId })
      st.setUi({ tab: s.tab })
    }, s)
    await sleep(1800)
    await win.screenshot({ path: join(outDir, `${s.tag}.png`) })
    console.log('shot', s.tag)
  }
} finally {
  try { await Promise.race([app.close(), sleep(8000)]) } catch {}
  // Kill the whole tree; Electron leaves helpers behind on Windows.
  try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }) } catch {}
}
console.log('out', outDir)
