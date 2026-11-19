// Runs under plain `node` (type stripping): node:* imports only, erasable TS syntax only.
import { mkdirSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// `npm run parity:fixtures -- [app|lite]`. The URLs and directories repeat `driver/targets.ts` (this script cannot import it).
// app: `PARITY_LEGACY_API_URL` (e.g. `https://legacy.example.com:8443/api`); lite: `$PARITY_LITE_URL/api`.
const trimSlash = (url: string) => url.replace(/\/$/, '')
const TARGETS = {
  app: { api: trimSlash(process.env.PARITY_LEGACY_API_URL ?? ''), env: 'PARITY_LEGACY_API_URL', dir: '../fixtures', label: 'parity/fixtures' },
  lite: { api: process.env.PARITY_LITE_URL ? `${trimSlash(process.env.PARITY_LITE_URL)}/api` : '', env: 'PARITY_LITE_URL', dir: '../fixtures/lite', label: 'parity/fixtures/lite' },
}
const name = process.argv[2] ?? 'app'
if (name !== 'app' && name !== 'lite') {
  throw new Error(`Unknown target "${name}": use app (default) or lite`)
}
const { api: API, env, dir, label } = TARGETS[name]
if (!API) {
  throw new Error(`Set ${env} for target "${name}"`)
}
const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), dir)

function getJson (url: string): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    const req = request(url, { rejectUnauthorized: false, headers: { Accept: 'application/json' } }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`${url} -> HTTP ${res.statusCode}`))
          return
        }
        try {
          resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function assertBaseline (home: any) {
  const app = home?.app ?? {}
  const problems: string[] = []
  if (app.theme?.style?.darkMode !== false) {
    problems.push('app.theme.style.darkMode must be false')
  }
  for (const key of Object.keys(app)) {
    if ((key === 'custom_css' || key.startsWith('custom_js_')) && app[key]) {
      problems.push(`app.${key} must be empty`)
    }
  }
  if ('admin' in home || 'admin' in app) {
    problems.push('admin key must be absent')
  }
  if (app.recaptcha_site_key) {
    problems.push('app.recaptcha_site_key must be empty')
  }
  if (problems.length > 0) {
    throw new Error(`Base fixture rejected:\n- ${problems.join('\n- ')}`)
  }
}

const home = await getJson(`${API}/home`)
assertBaseline(home)
const translation = await getJson(`${API}/en/translation.json`)

mkdirSync(fixturesDir, { recursive: true })
writeFileSync(resolve(fixturesDir, 'home.json'), `${JSON.stringify(home, null, 2)}\n`)
writeFileSync(resolve(fixturesDir, 'translation.en.json'), `${JSON.stringify(translation, null, 2)}\n`)
console.log(`Wrote ${label}/home.json and translation.en.json`)
