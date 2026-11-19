import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, watch } from 'vue'
import { resetErrorReporting, setErrorReporter } from '@/shared/errors/report-error'
import {
  handleModalsLoadFailure,
  loadOnboardingModals,
  prefetchOnboardingModals,
  prefetchOnboardingModalsWhenIdle,
  resetLoadedModals,
  shouldMountModals,
  useRevealedStep,
} from './lazy-modals'

const Stub = defineComponent({ render: () => h('div') })

afterEach(() => {
  resetLoadedModals()
  resetErrorReporting()
})

describe('shouldMountModals', () => {
  it('stays off with no step, no closing dialog and no autostart', () => {
    expect(shouldMountModals({ step: null, sshClosingOpen: false, autostart: false })).toBe(false)
  })

  it.each([
    { step: 'choose-service', sshClosingOpen: false, autostart: false },
    { step: null, sshClosingOpen: true, autostart: false },
    { step: null, sshClosingOpen: false, autostart: true },
  ] as const)('turns on for %j', state => {
    expect(shouldMountModals(state)).toBe(true)
  })
})

describe('loadOnboardingModals', () => {
  it('imports the chunk once and shares the promise', async () => {
    const importer = vi.fn(async () => ({ default: Stub }))
    const first = await loadOnboardingModals(importer)
    const second = await loadOnboardingModals(importer)
    expect(first).toBe(Stub)
    expect(second).toBe(Stub)
    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('forgets a failed load, so the next open imports again', async () => {
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: Stub })
    await expect(loadOnboardingModals(importer)).rejects.toThrow('Failed to fetch')
    await expect(loadOnboardingModals(importer)).resolves.toBe(Stub)
    expect(importer).toHaveBeenCalledTimes(2)
  })
})

describe('prefetch', () => {
  it('starts the import and swallows a failure', async () => {
    const importer = vi.fn().mockRejectedValue(new Error('offline'))
    prefetchOnboardingModals(importer)
    await Promise.resolve()
    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('waits for the idle scheduler before importing', () => {
    const importer = vi.fn(async () => ({ default: Stub }))
    let idle: (() => void) | undefined
    prefetchOnboardingModalsWhenIdle({ requestIdle: callback => {
      idle = callback
    } }, importer)
    expect(importer).not.toHaveBeenCalled()
    idle?.()
    expect(importer).toHaveBeenCalledTimes(1)
  })
})

describe('handleModalsLoadFailure', () => {
  it('reports the error and closes the flow', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)
    const closeFlow = vi.fn()
    handleModalsLoadFailure(new Error('Failed to fetch dynamically imported module'), closeFlow)
    expect(closeFlow).toHaveBeenCalledTimes(1)
    expect(reporter).toHaveBeenCalledTimes(1)
  })
})

describe('useRevealedStep', () => {
  function host (step: ReturnType<typeof ref<string | null>>) {
    let seen: () => string | null = () => null
    const wrapper = mount(defineComponent({
      setup () {
        const revealed = useRevealedStep(() => step.value as never)
        seen = () => revealed.value
        return () => h('div')
      },
    }))
    return { wrapper, seen: () => seen() }
  }

  it('shows no step on the first mount, then the real one (closed → open)', async () => {
    const step = ref<string | null>('choose-service')
    const { seen } = host(step)
    expect(seen()).toBeNull()
    await nextTick()
    await nextTick()
    expect(seen()).toBe('choose-service')
    step.value = 'limit'
    await nextTick()
    expect(seen()).toBe('limit')
  })

  it('does the same on every mount of the chunk, e.g. after the language change remounts the app', async () => {
    const step = ref<string | null>('choose-service')
    host(step)
    await nextTick()
    await nextTick()
    const second = host(step)
    expect(second.seen()).toBeNull()
    await nextTick()
    await nextTick()
    expect(second.seen()).toBe('choose-service')
  })

  it('lets a plain watch on the open state fire for the first open (a dialog mounted open would skip it)', async () => {
    const step = ref<string | null>('choose-service')
    const opened: boolean[] = []
    mount(defineComponent({
      setup () {
        const revealed = useRevealedStep(() => step.value as never)
        watch(() => revealed.value === 'choose-service', open => opened.push(open))
        return () => h('div')
      },
    }))
    await nextTick()
    await nextTick()
    expect(opened).toEqual([true])
  })
})
