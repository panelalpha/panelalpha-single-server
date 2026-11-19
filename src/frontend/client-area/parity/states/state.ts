import type { Probe } from '../lib/probe'
import type { Locator, Page } from '@playwright/test'
export type { Probe } from '../lib/probe'

export type AppName = 'legacy' | 'next'

/** Which deployed legacy a state is measured against: `app` (multi-server) or `lite` (app-lite, single-server). */
export type LegacyTarget = 'app' | 'lite'

export interface Variant {
  name: string
  theme: 'light' | 'dark'
  viewport: { width: number, height: number }
}

export interface FulfillSpec {
  status?: number
  json?: unknown
  /** A string, or a Buffer for a binary answer (`GET /instances/{id}/screenshot.jpg`); set a `content-type` header for it. */
  body?: string | Buffer
  headers?: Record<string, string>
}

/** Context handed to a handler function: the same `/home` body the GET would serve in this variant, and the request's query. */
export interface HandlerContext {
  home: Record<string, any>
  /** The query string of the request (`GET …/ssl/certificate/installed?domain=a.test` answers per domain). */
  query: URLSearchParams
}

/** `'hold'` leaves the request pending on purpose; a function derives the response from the variant's `/home`. */
export type HandlerSpec = FulfillSpec | 'hold' | ((context: HandlerContext) => FulfillSpec)

/**
 * One spec answers every request of its key. A sequence answers the first request with its first element,
 * each next request with the next one, and the last element repeats (`[{ json: { use_password: true } }, 'hold']`).
 */
export type Handler = HandlerSpec | HandlerSpec[]

/** Hosts outside `/api` that legacy and next both reach with `fetch` (DNS and SSL indicator of an instance card). */
export type ExternalHost = 'dns.google' | 'rdap.org'

export type StateAction = (page: Page) => Promise<void>

export interface ParityState {
  id: string
  /** Default `lite` (app-lite is the source of truth, M-2); `app` only for what app-lite does not have: the legacy side opens that origin and both apps get its fixtures. */
  target?: LegacyTarget
  path: string
  /**
   * The state is reached with a live session. Legacy treats a session as live only when
   * `<origin>-loggedin` is in `localStorage`, so the harness sets it before `goto` (legacy only).
   * Next derives the session from `/home` `user`, so the state's `home` must carry one.
   */
  signedIn?: boolean
  /**
   * Written to `localStorage` in an init script before each page loads, in both apps. A key may contain `{origin}`, replaced
   * by the page's own origin (e.g. `{origin}-redirect` for the onboarding that a sign-in opens).
   */
  localStorage?: Record<string, string>
  /** ISO time both apps see as "now"(`page.clock.setFixedTime`, set before `goto`), for `fromNow` text. Timers keep running. */
  clock?: string
  /**
   * `false` when legacy never reaches `GET /home` in this state (a held request before `/home`, a boot error),
   * so capture does not wait for `/home` to be served. Default `true`.
   */
  expectHome?: boolean
  /** Deep-merged over the base /home fixture. */
  home?: Record<string, unknown>
  /** Keyed by `METHOD /path` (without the /api prefix). */
  handlers?: Record<string, Handler>
  /**
   * Merged over `handlers` for that app only. For a state where the two apps need different data to reach the same screen
   * (first use: change `project-details-rename`). `Variant` is the theme and viewport, not the app.
   */
  handlersByApp?: Partial<Record<AppName, Record<string, Handler>>>
  /**
   * Answers for `https://dns.google/*` and `https://rdap.org/*`, in both apps' contexts. A host without an entry answers
   * "no record" (`{ Status: 3 }` / `{}`), so a card never waits on the network. Same sequence rules as `handlers`.
   */
  external?: Partial<Record<ExternalHost, Handler>>
  actions: { legacy: StateAction[], next: StateAction[] }
  /** The first probe is the readiness anchor. */
  probes: Probe[]
  /**
   * `'reset'` (default) moves the pointer to (0,0) and blurs the focused element before the screenshot.
   * `'keep'` leaves both where the actions put them, for hover and focus states.
   */
  pointer?: 'reset' | 'keep'
  /**
   * Skips the scroll reset before the probes. For states with an open menu: moving the page or a scrolled table back to the start
   * detaches the menu from its activator, and V2 (follows the activator) and V4 (stays clamped to the viewport) react differently.
   */
  keepScroll?: boolean
  /**
   * Checks run on each app after its screenshot and probes. A failure is a harness error, so a state that
   * changed while being captured (e.g. a timer resetting copied feedback) never becomes a silent baseline.
   */
  afterCapture?: { legacy: StateAction[], next: StateAction[] }
  masks?: { legacy: Array<(page: Page) => Locator>, next: Array<(page: Page) => Locator> }
  /**
   * Screenshot the viewport only, not the full page. For states whose masked content is taller in one app: a full-page
   * capture then differs in height and the padded pixel diff counts the whole gap. The viewport holds the top bar and the
   * frame's tabs in both apps, so the measurement covers them.
   */
  viewportOnly?: boolean | ((variant: Variant) => boolean)
}
