import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { type ErrorReport, resetErrorReporting, setErrorReporter } from '@/shared/errors/report-error'
import { registerPlugins } from './index'

// The real router pulls in every route of the app and Vuetify every component; this test is about the wiring only.
vi.mock('./vuetify', () => ({ default: { install: vi.fn() } }))
vi.mock('i18next-vue', () => ({ default: { install: vi.fn() } }))
vi.mock('@/app/i18n', () => ({ i18next: {} }))
vi.mock('@/app/router', () => ({
  router: {
    currentRoute: { value: { name: 'projects' } },
    install: vi.fn(),
  },
}))

describe('registerPlugins error reporting', () => {
  const reports: ErrorReport[] = []

  beforeEach(() => {
    resetErrorReporting()
    reports.length = 0
    setErrorReporter(report => {
      reports.push(report)
    })
  })

  afterEach(() => {
    resetErrorReporting()
    vi.restoreAllMocks()
  })

  it('sets app.config.errorHandler and listens to window error and unhandledrejection', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const app = createApp(defineComponent({ render: () => h('div') }))

    registerPlugins(app)

    expect(app.config.errorHandler).toBeTypeOf('function')
    expect(add.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['error', 'unhandledrejection']))
  })

  it('routes a component error, a window error and a rejection to the reporter', () => {
    const app = createApp(defineComponent({
      name: 'WiredWidget',
      mounted () {
        throw new Error('from component')
      },
      render: () => h('div'),
    }))
    registerPlugins(app)

    app.mount(document.createElement('div'))
    window.dispatchEvent(Object.assign(new Event('error'), { error: new Error('from window'), message: 'x' }))
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('from rejection') }))
    app.unmount()

    expect(reports.map(report => [report.source, report.message, report.routeName])).toEqual([
      ['vue', 'from component', 'projects'],
      ['window', 'from window', 'projects'],
      ['unhandledrejection', 'from rejection', 'projects'],
    ])
  })

  it('still registers the other plugins', () => {
    const app = createApp(defineComponent({ render: () => h('div') }))
    const use = vi.spyOn(app, 'use')

    registerPlugins(app)

    expect(use).toHaveBeenCalledTimes(4)
  })
})
