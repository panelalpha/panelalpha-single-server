import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type App, createApp, defineComponent, h, nextTick } from 'vue'
import { type ErrorReport, resetErrorReporting, setErrorReporter } from '@/shared/errors/report-error'
import { installErrorHandlers } from './error-handlers'

function rejection (reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason })
}

function windowError (error: unknown, message = 'Uncaught'): Event {
  return Object.assign(new Event('error'), { error, message })
}

describe('installErrorHandlers', () => {
  const reports: ErrorReport[] = []
  let target: EventTarget
  let app: App
  let uninstall: () => void

  function mountWith (component: ReturnType<typeof defineComponent>): void {
    app = createApp(component)
    uninstall = installErrorHandlers(app, { target, getRouteName: () => 'instances' })
    app.mount(document.createElement('div'))
  }

  beforeEach(() => {
    resetErrorReporting()
    reports.length = 0
    setErrorReporter(report => {
      reports.push(report)
    })
    target = new EventTarget()
  })

  afterEach(() => {
    app?.unmount()
    resetErrorReporting()
  })

  it('reports an error thrown by a component hook with its name, hook and route', () => {
    const Broken = defineComponent({
      name: 'BrokenWidget',
      mounted () {
        throw new Error('mounted failed')
      },
      render: () => h('div'),
    })

    mountWith(Broken)

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      source: 'vue',
      name: 'Error',
      message: 'mounted failed',
      componentName: 'BrokenWidget',
      info: 'mounted hook',
      routeName: 'instances',
    })
  })

  it('reports a rejected promise of an async hook once, through Vue only', async () => {
    const Broken = defineComponent({
      name: 'AsyncBroken',
      async mounted () {
        throw new Error('async failed')
      },
      render: () => h('div'),
    })

    mountWith(Broken)
    await nextTick()

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ source: 'vue', message: 'async failed', info: 'mounted hook' })
  })

  it('names a script-setup component by its file name', () => {
    const Anonymous = defineComponent({
      __name: 'FromFileName',
      setup () {
        throw new Error('setup failed')
      },
      render: () => h('div'),
    })

    mountWith(Anonymous)

    expect(reports[0]).toMatchObject({ componentName: 'FromFileName', info: 'setup function' })
  })

  it('reports a window error with the error object', () => {
    mountWith(defineComponent({ render: () => h('div') }))

    target.dispatchEvent(windowError(new TypeError('x is not a function')))

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ source: 'window', name: 'TypeError', message: 'x is not a function', routeName: 'instances' })
  })

  it('reports the message of a window error without an error object (cross-origin script)', () => {
    mountWith(defineComponent({ render: () => h('div') }))

    target.dispatchEvent(windowError(null, 'Script error.'))

    expect(reports[0]).toMatchObject({ source: 'window', message: 'Script error.' })
  })

  it('reports an unhandled rejection with its reason', () => {
    mountWith(defineComponent({ render: () => h('div') }))

    target.dispatchEvent(rejection(new Error('nobody caught this')))
    target.dispatchEvent(rejection('plain string reason'))

    expect(reports.map(report => [report.source, report.message])).toEqual([
      ['unhandledrejection', 'nobody caught this'],
      ['unhandledrejection', 'plain string reason'],
    ])
  })

  it('does not report a 401 or a 422 that reached a global channel', () => {
    mountWith(defineComponent({ render: () => h('div') }))
    const responseOf = (status: number) => new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, {}, {
      status, statusText: '', headers: {}, config: {} as never, data: {},
    })

    target.dispatchEvent(rejection(responseOf(401)))
    target.dispatchEvent(rejection(responseOf(422)))
    target.dispatchEvent(windowError(responseOf(422)))

    expect(reports).toHaveLength(0)
  })

  it('reports the same error object once when two channels see it', () => {
    mountWith(defineComponent({ render: () => h('div') }))
    const error = new Error('seen by two channels')

    target.dispatchEvent(windowError(error))
    target.dispatchEvent(rejection(error))

    expect(reports).toHaveLength(1)
    expect(reports[0]?.source).toBe('window')
  })

  it('keeps reporting when the route name cannot be read', () => {
    app = createApp(defineComponent({ render: () => h('div') }))
    uninstall = installErrorHandlers(app, {
      target,
      getRouteName: () => {
        throw new Error('router is not ready')
      },
    })

    target.dispatchEvent(windowError(new Error('early failure')))

    expect(reports).toHaveLength(1)
    expect(reports[0]?.routeName).toBeUndefined()
  })

  it('ignores a route name that is not a string', () => {
    app = createApp(defineComponent({ render: () => h('div') }))
    uninstall = installErrorHandlers(app, { target, getRouteName: () => Symbol('route') })

    target.dispatchEvent(windowError(new Error('symbol route')))

    expect(reports[0]?.routeName).toBeUndefined()
  })

  it('removes the listeners and restores the previous handler', () => {
    app = createApp(defineComponent({ render: () => h('div') }))
    const previous = vi.fn()
    app.config.errorHandler = previous
    uninstall = installErrorHandlers(app, { target })
    expect(app.config.errorHandler).not.toBe(previous)

    uninstall()
    target.dispatchEvent(windowError(new Error('after uninstall')))
    target.dispatchEvent(rejection(new Error('after uninstall too')))

    expect(reports).toHaveLength(0)
    expect(app.config.errorHandler).toBe(previous)
  })

  it('does not leak personal data of a thrown error into the report', () => {
    mountWith(defineComponent({ render: () => h('div') }))

    target.dispatchEvent(rejection(new Error('Cannot send to jan@example.com, token=abc123')))

    expect(JSON.stringify(reports)).not.toContain('jan@example.com')
    expect(JSON.stringify(reports)).not.toContain('abc123')
  })
})
