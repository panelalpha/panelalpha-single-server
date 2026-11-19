import type { Component } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { emit as emitAppEvent, on, resetAppEvents } from '@/shared/events/app-events'
import { DEMO_EMAIL } from '@/shared/session/demo-mode'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import { autostartKey } from './demo'
import { useOnboardingStore } from './onboarding.store'
import OnboardingModalWrapper from './OnboardingModalWrapper.vue'

// The wrapper keeps the start-up logic in the entry file and loads the 26 modals as a chunk (perf-onboarding-lazy).
// `loadOnboardingModals` is the seam: the tests decide when the chunk "arrives".
const loader = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: vi.fn() }),
  useRoute: () => ({ path: '/', query: {}, params: {} }),
}))

vi.mock('./lazy-modals', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    loadOnboardingModals: () => loader.load(),
    prefetchOnboardingModalsWhenIdle: vi.fn(),
  }
})

const ModalsStub = defineComponent({
  props: { readyToRender: { type: Boolean, default: true } },
  emits: ['demo-onboarding-selected'],
  setup (props, { emit }) {
    return () => h('div', {
      'data-testid': 'modals-stub',
      'data-ready': String(props.readyToRender),
      'onClick': () => emit('demo-onboarding-selected', true),
    })
  },
})

function deferred () {
  let resolve!: (component: Component) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Component>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function signIn (email: string): void {
  const session = useSessionStore()
  session.hydrateHome({ user: { id: 1, email, services: [] } } as never)
}

async function mountWrapper () {
  const host = document.createElement('div')
  document.body.append(host)
  return mountKit(OnboardingModalWrapper, { attachTo: host, global: { plugins: [] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetAppEvents()
  loader.load.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.classList.remove('overflow-y-hidden')
})

describe('OnboardingModalWrapper (entry part)', () => {
  it('does not load or mount the modals while no step is open', async () => {
    signIn('user@example.test')
    const wrapper = await mountWrapper()
    await flushPromises()
    expect(loader.load).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="modals-stub"]').exists()).toBe(false)
  })

  it('mounts the modals once a step opens, and keeps them after the step closes', async () => {
    signIn('user@example.test')
    loader.load.mockResolvedValue(ModalsStub)
    const wrapper = await mountWrapper()
    const onboarding = useOnboardingStore()
    onboarding.show('choose-service')
    await flushPromises()
    expect(loader.load).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="modals-stub"]').exists()).toBe(true)
    onboarding.deactivateAll()
    await flushPromises()
    expect(wrapper.find('[data-testid="modals-stub"]').exists()).toBe(true)
  })

  it('closes the flow and reports when the chunk cannot be loaded, so no backdrop is left alone', async () => {
    signIn('user@example.test')
    const gate = deferred()
    loader.load.mockReturnValue(gate.promise)
    const wrapper = await mountWrapper()
    const onboarding = useOnboardingStore()
    onboarding.show('choose-service')
    await flushPromises()
    gate.reject(new Error('Failed to fetch dynamically imported module'))
    await flushPromises()
    expect(onboarding.step).toBeNull()
    expect(wrapper.find('[data-testid="modals-stub"]').exists()).toBe(false)
  })

  it('closes a step that no modal renders', async () => {
    signIn('user@example.test')
    const wrapper = await mountWrapper()
    const onboarding = useOnboardingStore()
    onboarding.show('not-a-step' as never)
    await flushPromises()
    expect(onboarding.step).toBeNull()
    wrapper.unmount()
  })

  it('hides the shell for a demo autostart at once, before the chunk arrives, and shows it after the choice', async () => {
    signIn(DEMO_EMAIL)
    window.localStorage.setItem(autostartKey(window.location.origin), '1')
    const gate = deferred()
    loader.load.mockReturnValue(gate.promise)
    const ready: boolean[] = []
    on('app-ready-to-render', value => ready.push(value))

    const wrapper = await mountWrapper()
    // The navbar is hidden in the same tick as the mount: nothing waits for the chunk.
    expect(ready).toEqual([false])
    expect(useOnboardingStore().step).toBe('choose-onboarding-process')
    expect(wrapper.find('[data-testid="modals-stub"]').exists()).toBe(false)
    expect(loader.load).toHaveBeenCalledTimes(1)

    gate.resolve(ModalsStub)
    await flushPromises()
    const stub = wrapper.get('[data-testid="modals-stub"]')
    expect(stub.attributes('data-ready')).toBe('false')

    await stub.trigger('click')
    expect(ready).toEqual([false, true])
    expect(window.localStorage.getItem(autostartKey(window.location.origin))).toBeNull()
  })

  it('brings the shell back when the chunk fails during a demo autostart, and tries again on the next step', async () => {
    signIn(DEMO_EMAIL)
    window.localStorage.setItem(autostartKey(window.location.origin), '1')
    loader.load.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
    const ready: boolean[] = []
    on('app-ready-to-render', value => ready.push(value))

    const wrapper = await mountWrapper()
    await flushPromises()
    // Hidden at the start, back after the failure: no blank page.
    expect(ready).toEqual([false, true])
    expect(useOnboardingStore().step).toBeNull()
    expect(wrapper.find('[data-testid="modals-stub"]').exists()).toBe(false)

    loader.load.mockResolvedValue(ModalsStub)
    useOnboardingStore().show('choose-service')
    await flushPromises()
    expect(loader.load).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="modals-stub"]').exists()).toBe(true)
  })

  it('does not hide the shell for an account without the autostart key', async () => {
    signIn(DEMO_EMAIL)
    const ready: boolean[] = []
    on('app-ready-to-render', value => ready.push(value))
    await mountWrapper()
    await flushPromises()
    expect(ready).toEqual([])
    emitAppEvent('app-ready-to-render', true)
  })

  it('asks before leaving the page only while a request of the flow runs', async () => {
    signIn('user@example.test')
    await mountWrapper()
    const onboarding = useOnboardingStore()

    function leave (): string[] {
      const messages: string[] = []
      const event = new Event('beforeunload', { cancelable: true })
      Object.defineProperty(event, 'returnValue', { set: (value: string) => messages.push(value), get: () => '' })
      window.dispatchEvent(event)
      return messages
    }

    expect(leave()).toEqual([])
    onboarding.submitting = true
    expect(leave()).toEqual(['Installation is in progress. Leaving the page may cause the process to fail.'])
  })

  it('also asks before leaving while a files archive is still uploading', async () => {
    signIn('user@example.test')
    await mountWrapper()
    const onboarding = useOnboardingStore()

    function leave (): string[] {
      const messages: string[] = []
      const event = new Event('beforeunload', { cancelable: true })
      Object.defineProperty(event, 'returnValue', { set: (value: string) => messages.push(value), get: () => '' })
      window.dispatchEvent(event)
      return messages
    }

    // The archive is uploaded by the browser: a reload before it is done leaves the project waiting for its files.
    onboarding.filesArchiveUploadPending = true
    expect(leave()).toEqual(['Your project files are still uploading. Leaving the page now would leave the project without them.'])
    onboarding.filesArchiveUploadPending = false
    expect(leave()).toEqual([])
  })
})
