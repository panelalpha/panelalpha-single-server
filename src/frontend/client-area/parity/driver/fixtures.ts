import type { AppName, ExternalHost, FulfillSpec, Handler, LegacyTarget, ParityState, Variant } from '../states/state'
import type { Page, Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { pickFromSequence } from '../lib/sequence'
import { targetOf, TARGETS } from './targets'

export interface FixtureSession {
  readonly homeCount: number
  readonly inflight: number
  readonly unmatched: string[]
}

function readFixture (dir: string, name: string): any {
  return JSON.parse(readFileSync(new URL(`../${dir}/${name}`, import.meta.url), 'utf8'))
}

interface BaseFixtures {
  home: any
  translation: any
}

const bases = new Map<LegacyTarget, BaseFixtures>()

/** The base `/home` and translation a state of `target` is served; loaded on first use, so a missing lite fixture only breaks lite states. */
export function baseFixtures (target: LegacyTarget): BaseFixtures {
  let base = bases.get(target)
  if (!base) {
    const { fixturesDir } = TARGETS[target]
    const home = readFixture(fixturesDir, 'home.json')
    base = {
      home,
      translation: readFixture(fixturesDir, 'translation.en.json'),
    }
    bases.set(target, base)
  }
  return base
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMerge (base: any, override: any): any {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override
  }
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in base ? deepMerge(base[key], value) : value
  }
  return result
}

export function buildHome (state: ParityState, variant: Variant) {
  const home = deepMerge(baseFixtures(targetOf(state)).home, state.home ?? {})
  home.app = home.app ?? {}
  home.app.theme = home.app.theme ?? {}
  home.app.theme.style = { ...home.app.theme.style, darkMode: variant.theme === 'dark' }
  return home
}

/** Answers a request with a spec: JSON, a string body or a binary body. */
export async function fulfillSpec (route: Route, spec: FulfillSpec): Promise<void> {
  await route.fulfill({
    status: spec.status ?? 200,
    headers: spec.headers,
    ...(spec.json === undefined
      ? { body: spec.body ?? '' }
      : { contentType: 'application/json', body: JSON.stringify(spec.json) }),
  })
}

/** What a host answers when a state gives it nothing: no DNS record, no RDAP nameservers. */
const NO_RECORD: Record<ExternalHost, FulfillSpec> = {
  'dns.google': { json: { Status: 3 } },
  'rdap.org': { json: {} },
}

/** The answer to the legacy file-manager iframe (`/fm/?id=…`): a blank page with the fm app's mount point and nothing to boot. */
const FM_STUB = '<!doctype html><html><body><div id="fm"></div></body></html>'

/** Both apps `fetch` these cross-origin, so every answer carries the CORS header (no preflight: the requests are simple). */
const CORS = { 'access-control-allow-origin': '*' }

export async function installFixtures (page: Page, state: ParityState, variant: Variant, app: AppName): Promise<FixtureSession> {
  let homeCount = 0
  let inflight = 0
  const unmatched: string[] = []

  const handlers = new Map<string, Handler>()
  const calls = new Map<string, number>()
  const builtIns: Record<string, Handler> = {
    'GET /csrf-cookie': { status: 204, body: '' },
    ...state.handlers,
    ...state.handlersByApp?.[app],
  }
  for (const [key, handler] of Object.entries(builtIns)) {
    // Fail here, not inside the route callback, where a throw leaves the request pending until an unrelated timeout.
    if (Array.isArray(handler) && handler.length === 0) {
      throw new Error(`Harness error: empty handler sequence for "${key}" in state ${state.id}`)
    }
    handlers.set(key, handler)
  }

  const fulfill = fulfillSpec

  // Awaited so the route is registered before `goto`, and a registration failure fails the state instead of going unhandled.
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*?\/api(?=\/)/, '')
    const key = `${request.method()} ${path}`

    const handler = handlers.get(key)
    const callIndex = calls.get(key) ?? 0
    if (handler !== undefined) {
      calls.set(key, callIndex + 1)
    }
    const custom = handler === undefined ? undefined : pickFromSequence(handler, callIndex)
    if (custom === 'hold') {
      return
    } // left pending on purpose; not counted in-flight

    // A state may answer `GET /home` itself (stateful fixtures); it still counts as served.
    if (key === 'GET /home' && custom) {
      homeCount++
    }

    inflight++
    try {
      if (custom) {
        await fulfill(route, typeof custom === 'function' ? custom({ home: buildHome(state, variant), query: url.searchParams }) : custom)
      } else if (key === 'GET /home') {
        homeCount++
        await fulfill(route, { json: buildHome(state, variant) })
      } else if (request.method() === 'GET' && /^\/[A-Za-z_-]+\/translation\.json$/.test(path)) {
        await fulfill(route, { json: baseFixtures(targetOf(state)).translation })
      } else {
        unmatched.push(key)
        await route.abort('failed')
      }
    } finally {
      inflight--
    }
  })

  // Awaited for the same reason as the `/api` route. Counted in-flight, so capture waits for the DNS and SSL indicators.
  const externalCalls = new Map<ExternalHost, number>()
  await page.route(/^https:\/\/(?:dns\.google|rdap\.org)\//, async route => {
    const host = new URL(route.request().url()).hostname as ExternalHost
    const callIndex = externalCalls.get(host) ?? 0
    externalCalls.set(host, callIndex + 1)
    const handler = state.external?.[host]
    const custom = handler === undefined ? NO_RECORD[host] : pickFromSequence(handler, callIndex)
    if (custom === 'hold') {
      return
    }
    inflight++
    try {
      const spec = typeof custom === 'function' ? custom({ home: buildHome(state, variant), query: new URL(route.request().url()).searchParams }) : custom
      await fulfill(route, { ...spec, headers: { ...CORS, ...spec.headers } })
    } finally {
      inflight--
    }
  })

  // The legacy File Manager page embeds the separate `/fm/` app in an iframe (`views/hosting/FileManager.vue:47-53`). Unstubbed it
  // would load the live app, whose `file-manager/*` calls no state answers. A blank page keeps the iframe box measurable and the
  // pixels stable; its content is masked (S-37: next renders a native file manager there). Registered before `goto`, counted in-flight.
  await page.route(/\/fm\/(?:\?|$)/, async route => {
    inflight++
    try {
      await fulfill(route, { body: FM_STUB, headers: { 'content-type': 'text/html; charset=utf-8' } })
    } finally {
      inflight--
    }
  })

  return {
    get homeCount () {
      return homeCount
    },
    get inflight () {
      return inflight
    },
    unmatched,
  }
}
