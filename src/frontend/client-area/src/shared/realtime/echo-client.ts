/*
 * Echo websocket client.
 *
 * Versions: laravel-echo 2.5.0 and pusher-js 8.6.0 (current majors; legacy pins 1.16.0 / 7.6.0).
 * Option shapes verified against `node_modules/laravel-echo/dist/echo.d.ts` and
 * `node_modules/pusher-js/types/src/core/{options,auth/options}.d.ts`.
 *
 * | Legacy option (laravel-echo 1 / pusher-js 7)                | New option (laravel-echo 2 / pusher-js 8)                                  |
 * | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
 * | `window.Pusher = require('pusher-js')`                      | `Pusher` option (the imported class); no global                            |
 * | `Pusher.Runtime.createXHR` patched for `withCredentials`    | `channelAuthorization.customHandler` using `fetch(..., credentials)`       |
 * | `authEndpoint`                                              | the URL the custom handler posts to (`channelAuthorization.customHandler`)  |
 * | `auth.headers['X-XSRF-TOKEN']` read at connect time         | same header, read from the cookie at connect time, sent by the handler     |
 * | `withCredentials: true`                                     | `credentials: 'include'` in the custom handler                             |
 * | `key`, `forceTLS`, `disableStats`, `enabledTransports`      | unchanged                                                                  |
 * | `wsHost`, `wsPort`, `wssPort`, `wsPath`                     | unchanged (`wsPort` / `wssPort` are numbers)                               |
 * | (Echo registers axios / Vue interceptors)                   | `withoutInterceptors: true`                                                |
 * | `broadcaster: 'pusher'`                                     | unchanged; `cluster: ''` (pusher-js 8 rejects `null`; unused with `wsHost`)  |
 *
 * Both libraries load with the first `connect()` (`import()`), not with the app: ~98 kB that `/login` and the first render do
 * not need.
 */
import type Echo from 'laravel-echo'
import type Pusher from 'pusher-js'
import {
  asChannelListener,
  dispatchDeployLogUpdated,
  dispatchDiagnosticModeEnabled,
  dispatchImportStatusChanged,
  dispatchNotification,
  dispatchSslCertificateInstalled,
  type EchoNotification,
} from './echo-events'

// pusher-js 8 does not re-export these from its entry (`types/src/core/auth/options.d.ts`).
interface ChannelAuthorizationRequestParams {
  socketId: string
  channelName: string
}
type ChannelAuthorizationCallback = (error: Error | null, authData: { auth: string, channel_data?: string, shared_secret?: string } | null) => void

export const PUSHER_KEY = '89c60f11-c289-4d3e-9122-95502ac670ca'

export interface EchoEnv {
  VITE_API_URL?: string
  VITE_WEBSOCKET_AUTH_ENDPOINT?: string
  VITE_WEBSOCKET_HOST?: string
  VITE_WEBSOCKET_PORT?: string
  VITE_WEBSOCKET_PATH?: string
}

export interface EchoConfig {
  authEndpoint: string
  host: string
  port: number
  path: string
}

/** Defaults of the Echo options, from the environment and the page location. */
export function resolveEchoConfig (
  env: EchoEnv,
  location: Pick<Location, 'hostname' | 'port' | 'protocol'>,
): EchoConfig {
  const apiUrl = env.VITE_API_URL || '/api'
  let port: number
  if (env.VITE_WEBSOCKET_PORT) {
    port = Number(env.VITE_WEBSOCKET_PORT)
  } else if (location.port) {
    port = Number(location.port)
  } else {
    port = location.protocol === 'https:' ? 443 : 80
  }
  return {
    authEndpoint: env.VITE_WEBSOCKET_AUTH_ENDPOINT || `${apiUrl}/broadcasting/auth`,
    host: env.VITE_WEBSOCKET_HOST || location.hostname,
    port,
    path: env.VITE_WEBSOCKET_PATH || '/ws',
  }
}

/** `js-cookie` `Cookie.get('XSRF-TOKEN')`: URL-decoded value or undefined. */
export function readXsrfToken (cookie: string = document.cookie): string | undefined {
  for (const part of cookie.split('; ')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index) === 'XSRF-TOKEN') {
      try {
        return decodeURIComponent(part.slice(index + 1))
      } catch {
        return part.slice(index + 1)
      }
    }
  }
  return undefined
}

/** pusher-js 8 replacement of the patched XHR: the same POST as `xhr_auth.ts`, with cookies and the XSRF header. */
export function createChannelAuthorizer (endpoint: string, xsrfToken: string | undefined) {
  return (
    { socketId, channelName }: ChannelAuthorizationRequestParams,
    callback: ChannelAuthorizationCallback,
  ): void => {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (xsrfToken !== undefined) {
      headers['X-XSRF-TOKEN'] = xsrfToken
    }
    fetch(endpoint, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: new URLSearchParams({ socket_id: socketId, channel_name: channelName }).toString(),
    }).then(async response => {
      if (response.status !== 200) {
        throw new Error(`Unable to retrieve auth string from channel-authorization endpoint - received status: ${response.status} from ${endpoint}.`)
      }
      callback(null, await response.json())
    }).catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)), null)
    })
  }
}

export function buildEchoOptions (config: EchoConfig, xsrfToken: string | undefined, PusherClass: typeof Pusher) {
  return {
    broadcaster: 'pusher' as const,
    Pusher: PusherClass,
    key: PUSHER_KEY,
    // pusher-js 8 `validateOptions` throws without a cluster; legacy (7.6) set none. `wsHost` makes the value unused.
    cluster: '',
    wsHost: config.host,
    wsPort: config.port,
    wssPort: config.port,
    wsPath: config.path,
    forceTLS: false,
    disableStats: true,
    enabledTransports: ['ws', 'wss'] as Array<'ws' | 'wss'>,
    channelAuthorization: {
      customHandler: createChannelAuthorizer(config.authEndpoint, xsrfToken),
    },
    withoutInterceptors: true,
  }
}

/**
 * The Pusher connection under Echo (legacy `window.Echo.connector.pusher.connection`). app-lite `DeployLogsViewer` reads its
 * `state` and binds `state_change` to switch between websocket push and HTTP polling of the deploy log.
 */
export interface EchoConnection {
  state: string
  bind: (event: string, callback: (states: { current: string }) => void) => void
  unbind: (event: string, callback?: (states: { current: string }) => void) => void
}

// A type alias, not an interface: the shell's store takes an index-signature DTO.
export type EchoPushedNotification = {
  id: string | number
  type: string
  data: EchoNotification
  read_at: null
  created_at: string
}

export interface EchoConnectOptions {
  /** Where an enabled push lands (the shell passes its bell list handler). Without it the push only reaches the event bus. */
  addNotification?: (notification: EchoPushedNotification) => void
}

export interface EchoLibraries {
  Echo: typeof Echo
  Pusher: typeof Pusher
}

async function loadEchoLibraries (): Promise<EchoLibraries> {
  const [{ default: EchoClass }, { default: PusherClass }] = await Promise.all([import('laravel-echo'), import('pusher-js')])
  return { Echo: EchoClass, Pusher: PusherClass }
}

export interface EchoClientDeps {
  /** Creates the Echo instance (the test mocks `laravel-echo`; this stays the default). */
  createEcho?: (options: ReturnType<typeof buildEchoOptions>, EchoClass: typeof Echo) => Pick<Echo<'pusher'>, 'private' | 'disconnect'>
  loadLibraries?: () => Promise<EchoLibraries>
  refreshHome?: () => void
  getConfig?: () => EchoConfig
  getXsrfToken?: () => string | undefined
}

export function createEchoClient (deps: EchoClientDeps = {}) {
  const createEcho = deps.createEcho ?? ((options, EchoClass) => new EchoClass<'pusher'>(options))
  const loadLibraries = deps.loadLibraries ?? loadEchoLibraries
  let echo: ReturnType<typeof createEcho> | null = null
  // Every connect and disconnect moves it on, so a connect whose libraries arrive after a newer call does nothing.
  let generation = 0

  async function defaultRefreshHome () {
    const { useSessionStore } = await import('@/shared/session/session.store')
    await useSessionStore().ensureHome(true)
  }

  function disconnect () {
    generation += 1
    if (!echo) {
      return
    }
    echo.disconnect()
    echo = null
  }

  /**
   * One connection per session: an existing client is disconnected first, so listeners never stack. Resolves once the client
   * is set up (or skipped because a newer `connect`/`disconnect` came first); rejects when the libraries fail to load.
   */
  async function connect (home: { user?: { gravatar_hash?: string } | null } | null | undefined, options: EchoConnectOptions = {}): Promise<void> {
    disconnect()
    if (!home?.user) {
      return
    }
    const current = generation
    const libraries = await loadLibraries()
    if (current !== generation) {
      return
    }

    const config = (deps.getConfig ?? (() => resolveEchoConfig(import.meta.env, window.location)))()
    const xsrf = (deps.getXsrfToken ?? readXsrfToken)()
    const { addNotification } = options
    const refreshHome = deps.refreshHome ?? (() => {
      void defaultRefreshHome().catch(() => {})
    })

    const client = createEcho(buildEchoOptions(config, xsrf, libraries.Pusher), libraries.Echo)
    echo = client

    const channelName = `user.${home.user.gravatar_hash}`
    const channel = client.private(channelName)

    channel.notification((n: EchoNotification) => {
      if (n.enabled) {
        addNotification?.({
          id: n.id as string | number,
          type: n.type,
          data: n,
          read_at: null,
          // Legacy items carry no `created_at`; moment(undefined) is "now".
          created_at: new Date().toISOString(),
        })
      }
      if (dispatchNotification(n).refreshHome) {
        refreshHome()
      }
    })

    channel.listen('DiagnosticModeEnabled', asChannelListener(dispatchDiagnosticModeEnabled))
    channel.listen('SslCertificateInstalled', asChannelListener(dispatchSslCertificateInstalled))
    channel.listen('ImportStatusChanged', asChannelListener(dispatchImportStatusChanged))
    channel.listen('DeployLogUpdated', asChannelListener(dispatchDeployLogUpdated))
  }

  return {
    connect,
    disconnect,
    get connected () {
      return echo !== null
    },
    get connection (): EchoConnection | null {
      const pusher = (echo as unknown as { connector?: { pusher?: { connection?: EchoConnection } } } | null)?.connector?.pusher
      return pusher?.connection ?? null
    },
  }
}

export const echoClient = createEchoClient()
