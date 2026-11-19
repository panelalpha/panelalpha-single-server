import { afterEach, describe, expect, it, vi } from 'vitest'
import { on, resetAppEvents } from '@/shared/events/app-events'
import {
  buildEchoOptions,
  createChannelAuthorizer,
  createEchoClient,
  PUSHER_KEY,
  readXsrfToken,
  resolveEchoConfig,
} from './echo-client'

vi.mock('laravel-echo', () => ({ default: vi.fn() }))
vi.mock('pusher-js', () => ({ default: class FakePusher {} }))

const FakePusherClass = class {} as never

const config = { authEndpoint: '/api/broadcasting/auth', host: 'api.test', port: 8443, path: '/ws' }
const home = { user: { gravatar_hash: 'abc' } }

type Handler = (payload: never) => void

function fakeEcho () {
  const handlers = new Map<string, Handler>()
  let notification: Handler = () => {}
  const privateChannel = vi.fn((_name: string) => channel)
  const channel = {
    notification: vi.fn((cb: Handler) => {
      notification = cb
      return channel
    }),
    listen: vi.fn((event: string, cb: Handler) => {
      handlers.set(event, cb)
      return channel
    }),
  }
  const disconnect = vi.fn()
  return {
    instance: { private: privateChannel, disconnect } as never,
    privateChannel,
    channel,
    disconnect,
    notify: (n: unknown) => notification(n as never),
    // pusher-js hands every channel listener the event's metadata as the second argument (`Dispatcher.emit`).
    deliver: (event: string, payload: unknown) => handlers.get(event)!(payload as never, {} as never),
  }
}

function setup () {
  const echoes: Array<ReturnType<typeof fakeEcho>> = []
  const createEcho = vi.fn((_options: unknown) => {
    const echo = fakeEcho()
    echoes.push(echo)
    return echo.instance
  })
  const addNotification = vi.fn()
  const refreshHome = vi.fn()
  const base = createEchoClient({
    createEcho,
    refreshHome,
    getConfig: () => config,
    getXsrfToken: () => 'tok',
  })
  // The shell passes the handler per connect; every test below connects through it.
  const client = Object.create(base, {
    connect: { value: (home: Parameters<typeof base.connect>[0]) => base.connect(home, { addNotification }) },
  }) as typeof base
  return { client, echoes, createEcho, addNotification, refreshHome }
}

afterEach(() => resetAppEvents())

describe('resolveEchoConfig', () => {
  const loc = { hostname: 'app.test', port: '', protocol: 'https:' }

  it('uses the legacy defaults', () => {
    expect(resolveEchoConfig({}, loc)).toEqual({
      authEndpoint: '/api/broadcasting/auth', host: 'app.test', port: 443, path: '/ws',
    })
    expect(resolveEchoConfig({}, { ...loc, protocol: 'http:' }).port).toBe(80)
    expect(resolveEchoConfig({}, { ...loc, port: '2140' }).port).toBe(2140)
  })

  it('prefers the env overrides', () => {
    expect(resolveEchoConfig({
      VITE_API_URL: 'https://api.test/api',
      VITE_WEBSOCKET_HOST: 'ws.test',
      VITE_WEBSOCKET_PORT: '6001',
      VITE_WEBSOCKET_PATH: '/sock',
    }, loc)).toEqual({ authEndpoint: 'https://api.test/api/broadcasting/auth', host: 'ws.test', port: 6001, path: '/sock' })
    expect(resolveEchoConfig({ VITE_WEBSOCKET_AUTH_ENDPOINT: '/custom' }, loc).authEndpoint).toBe('/custom')
  })
})

describe('options', () => {
  it('keeps the legacy connection options', () => {
    const options = buildEchoOptions(config, 'tok', FakePusherClass)
    expect(options).toMatchObject({
      broadcaster: 'pusher',
      key: PUSHER_KEY,
      cluster: '',
      wsHost: 'api.test',
      wsPort: 8443,
      wssPort: 8443,
      wsPath: '/ws',
      forceTLS: false,
      disableStats: true,
      enabledTransports: ['ws', 'wss'],
      withoutInterceptors: true,
    })
    expect(options.Pusher).toBe(FakePusherClass)
    expect(typeof options.channelAuthorization.customHandler).toBe('function')
  })

  it('reads XSRF-TOKEN from the cookie, decoded', () => {
    expect(readXsrfToken('a=1; XSRF-TOKEN=ab%3D%3D; b=2')).toBe('ab==')
    expect(readXsrfToken('a=1')).toBeUndefined()
  })

  it('authorizes with credentials and the XSRF header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: () => Promise.resolve({ auth: 'k:s' }) })
    vi.stubGlobal('fetch', fetchMock)
    const callback = vi.fn()

    createChannelAuthorizer('/api/broadcasting/auth', 'tok')({ socketId: '1.2', channelName: 'private-user.abc' }, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())

    expect(fetchMock).toHaveBeenCalledWith('/api/broadcasting/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-XSRF-TOKEN': 'tok' },
      credentials: 'include',
      body: 'socket_id=1.2&channel_name=private-user.abc',
    })
    expect(callback).toHaveBeenCalledWith(null, { auth: 'k:s' })
    vi.unstubAllGlobals()
  })

  it('reports a non-200 authorization as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 403, json: () => Promise.resolve({}) }))
    const callback = vi.fn()

    createChannelAuthorizer('/x', undefined)({ socketId: '1', channelName: 'c' }, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())

    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(callback.mock.calls[0][1]).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('echo client', () => {
  it('creates Echo with the options and subscribes the private user channel', async () => {
    const { client, createEcho, echoes } = setup()
    await client.connect(home)

    expect(createEcho).toHaveBeenCalledTimes(1)
    expect(createEcho.mock.calls[0][0]).toMatchObject({ key: PUSHER_KEY, wsHost: 'api.test', forceTLS: false })
    expect(echoes[0].privateChannel).toHaveBeenCalledWith('user.abc')
    expect(echoes[0].channel.notification).toHaveBeenCalledTimes(1)
    expect(echoes[0].channel.listen.mock.calls.map(c => c[0])).toEqual([
      'DiagnosticModeEnabled', 'SslCertificateInstalled', 'ImportStatusChanged', 'DeployLogUpdated',
    ])
    expect(client.connected).toBe(true)
  })

  it('does not connect without a user', async () => {
    const { client, createEcho } = setup()
    await client.connect({ user: null })
    await client.connect(null)
    expect(createEcho).not.toHaveBeenCalled()
    expect(client.connected).toBe(false)
  })

  it('exposes the Pusher connection under Echo, and null without a client', async () => {
    const connection = { state: 'connected', bind: vi.fn(), unbind: vi.fn() }
    const client = createEchoClient({
      createEcho: () => ({ ...(fakeEcho().instance as object), connector: { pusher: { connection } } }) as never,
      getConfig: () => config,
      getXsrfToken: () => undefined,
      refreshHome: vi.fn(),
    })
    expect(client.connection).toBeNull()
    await client.connect(home)
    expect(client.connection).toBe(connection)
    client.disconnect()
    expect(client.connection).toBeNull()
  })

  it('adds a notification only when enabled, and always maps the type to the bus', async () => {
    const { client, echoes, addNotification } = setup()
    const seen = vi.fn()
    on('staging-install-finished', seen)
    await client.connect(home)

    echoes[0].notify({ id: 'n1', type: 'user.instance.create_staging_finished', enabled: false, instance: { id: 1 } })
    expect(addNotification).not.toHaveBeenCalled()
    expect(seen).toHaveBeenCalledWith({ id: 1 })

    const body = { id: 'n2', type: 'user.instance.create_staging_finished', enabled: true, instance: { id: 2 } }
    echoes[0].notify(body)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0]).toMatchObject({ id: 'n2', type: body.type, data: body, read_at: null })
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('still reaches the bus and refreshes /home when connect gets no addNotification handler', async () => {
    const echo = fakeEcho()
    const refreshHome = vi.fn()
    const client = createEchoClient({
      createEcho: () => echo.instance,
      refreshHome,
      getConfig: () => config,
      getXsrfToken: () => 'tok',
    })
    const seen = vi.fn()
    on('staging-install-finished', seen)
    await client.connect(home)

    echo.notify({ id: 'n1', type: 'user.instance.create_staging_finished', enabled: true, instance: { id: 1 } })
    expect(seen).toHaveBeenCalledWith({ id: 1 })

    echo.notify({ type: 'user.instance.installation_finished', instance: {} })
    expect(refreshHome).toHaveBeenCalledTimes(1)
  })

  it('refreshes /home on installation_finished only', async () => {
    const { client, echoes, refreshHome } = setup()
    await client.connect(home)

    echoes[0].notify({ type: 'user.instance.installation_failed' })
    expect(refreshHome).not.toHaveBeenCalled()

    echoes[0].notify({ type: 'user.instance.installation_finished', instance: {} })
    expect(refreshHome).toHaveBeenCalledTimes(1)
  })

  it('routes the listen channels to the bus, with the metadata pusher-js appends', async () => {
    const { client, echoes } = setup()
    const diagnostic = vi.fn()
    const ssl = vi.fn()
    const imported = vi.fn()
    const deploy = vi.fn()
    on('diagnostic-mode-enabled', diagnostic)
    on('ssl-certificate-installed', ssl)
    on('import-status-changed', imported)
    on('deploy-log-updated', deploy)
    await client.connect(home)

    echoes[0].deliver('DiagnosticModeEnabled', { applications: [{ id: 1 }, { id: 2 }] })
    echoes[0].deliver('SslCertificateInstalled', { application: { id: 3 } })
    echoes[0].deliver('ImportStatusChanged', { application: { id: 4 } })
    echoes[0].deliver('DeployLogUpdated', { log: 'x' })

    expect(diagnostic).toHaveBeenCalledTimes(2)
    expect(ssl).toHaveBeenCalledWith({ id: 3 })
    expect(imported).toHaveBeenCalledWith({ id: 4 })
    expect(deploy).toHaveBeenCalledWith({ log: 'x' })
  })

  it('disconnects on sign-out', async () => {
    const { client, echoes } = setup()
    await client.connect(home)
    client.disconnect()

    expect(echoes[0].disconnect).toHaveBeenCalledTimes(1)
    expect(client.connected).toBe(false)
    client.disconnect()
    expect(echoes[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('loads the libraries on connect, and a disconnect while they load wins (audit A7)', async () => {
    let release: () => void = () => {}
    const loadLibraries = vi.fn(() => new Promise<never>(resolve => {
      release = () => resolve({ Echo: class {}, Pusher: class {} } as never)
    }))
    const createEcho = vi.fn(() => fakeEcho().instance)
    const client = createEchoClient({ createEcho, loadLibraries, getConfig: () => config, getXsrfToken: () => 'tok', refreshHome: vi.fn() })

    const pending = client.connect(home)
    expect(loadLibraries).toHaveBeenCalledTimes(1)
    client.disconnect()
    release()
    await pending

    expect(createEcho).not.toHaveBeenCalled()
    expect(client.connected).toBe(false)
  })

  it('rejects when the libraries fail to load', async () => {
    const client = createEchoClient({
      loadLibraries: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
      getConfig: () => config,
      getXsrfToken: () => 'tok',
      refreshHome: vi.fn(),
    })
    await expect(client.connect(home)).rejects.toThrow('dynamically imported')
    expect(client.connected).toBe(false)
  })

  it('reconnecting disconnects the old client first, so listeners do not stack', async () => {
    const { client, echoes, addNotification } = setup()
    await client.connect(home)
    await client.connect(home)

    expect(echoes[0].disconnect).toHaveBeenCalledTimes(1)
    expect(echoes[1].disconnect).not.toHaveBeenCalled()

    const seen = vi.fn()
    on('push-to-live-finished', seen)
    echoes[1].notify({ id: 'n', type: 'user.instance.push_to_live_finished', enabled: true, instance: {} })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(addNotification).toHaveBeenCalledTimes(1)
  })
})
