import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountKit } from '@/test/mount-kit'
import WizardView from './WizardView.vue'

// Summary asks the Community panel about the pairing and plays the confetti; neither is under test here.
vi.mock('./wizard.api', () => ({
  createFreeSetup: vi.fn(),
  // Summary reads the saved name of the server.
  getWizardSettings: vi.fn().mockResolvedValue({ name: 'My server', default_language: 'en', default_date_format: 'DD/MM/YYYY' }),
}))
vi.mock('@/entities/hub/hub.api', () => ({
  getHubStatus: vi.fn().mockResolvedValue({ paired: false }),
  startHub: vi.fn(),
  completeHub: vi.fn(),
}))
vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn(() => ({ destroy: vi.fn() })) } }))

async function mountAt (path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/wizard', '/wizard/general-config', '/wizard/panelalpha-connect', '/wizard/connect-ai', '/wizard/summary']
      .map(route => ({ path: route, component: WizardView })),
  })
  await router.push(path)
  await router.isReady()
  const wrapper = await mountKit(WizardView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('WizardView', () => {
  it('shows the start page on /wizard and no sidebar', async () => {
    const { wrapper } = await mountAt('/wizard')
    expect(wrapper.find('[data-testid="wizard-start"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wizard-sidebar"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="wizard-start-title"]').text()).toBe('A few steps to your first deploy.')
  })

  it('opens step 1 with Start Now', async () => {
    const { wrapper, router } = await mountAt('/wizard')
    await wrapper.get('[data-testid="wizard-start-button"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect'))
    expect(wrapper.find('[data-testid="wizard-sidebar"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="wizard-step-frame-1"]').exists()).toBe(true)
  })

  it('lists the four steps with the current one marked and the later ones locked', async () => {
    const { wrapper } = await mountAt('/wizard/panelalpha-connect')
    const steps = wrapper.findAll('.wizard-step')
    expect(steps.map(step => step.text())).toEqual(['1Sign in', '2Server name', '3Connect AI', '4Done'])
    expect(steps[0]!.classes()).toContain('wizard-step--current')
    expect(steps[0]!.classes()).toContain('wizard-step--active')
    expect(steps[0]!.attributes('aria-current')).toBe('step')
    expect(steps[1]!.attributes('aria-disabled')).toBe('true')
    expect(steps[2]!.attributes('aria-disabled')).toBe('true')
    expect(steps[3]!.attributes('aria-disabled')).toBe('true')
  })

  it('does not open a step beyond the furthest one reached', async () => {
    const { wrapper, router } = await mountAt('/wizard/general-config')
    await wrapper.get('[data-testid="wizard-step-summary"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/wizard/general-config')
  })

  it('makes the step of the link the furthest one and lets the user go back to a finished step', async () => {
    const { wrapper, router } = await mountAt('/wizard/summary')
    const steps = wrapper.findAll('.wizard-step')
    expect(steps.map(step => step.classes().includes('wizard-step--completed'))).toEqual([true, true, true, false])
    expect(steps[3]!.classes()).toContain('wizard-step--current')
    expect(wrapper.get('.wizard-step__check').exists()).toBe(true)

    await wrapper.get('[data-testid="wizard-step-general-config"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))
    // The progress stays: step 3 is still open and the clicked step is the active one.
    const after = wrapper.findAll('.wizard-step')
    expect(after[1]!.classes()).toContain('wizard-step--active')
    expect(after[2]!.attributes('aria-disabled')).toBe('false')
    expect(after[3]!.attributes('aria-disabled')).toBe('false')
  })

  it('titles the container of each step', async () => {
    const connect = await mountAt('/wizard/panelalpha-connect')
    expect(connect.wrapper.get('[data-testid="wizard-step-title"]').text()).toBe('How do you want to sign in?')
    const connectAi = await mountAt('/wizard/connect-ai')
    expect(connectAi.wrapper.get('[data-testid="wizard-step-frame-3"]').exists()).toBe(true)
    const summary = await mountAt('/wizard/summary')
    expect(summary.wrapper.get('[data-testid="wizard-step-title"]').text()).toBe('You\'re all set.')
  })

  // Legacy `/setup` has the switcher on every screen of the setup; one per page (the kit id `languageSwitcher`).
  it.each(['/wizard', '/wizard/panelalpha-connect', '/wizard/general-config', '/wizard/connect-ai', '/wizard/summary'])('has the language switcher on %s', async path => {
    const { wrapper } = await mountAt(path)
    expect(wrapper.findAll('[data-testid="language-activator"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="wizard-language"]').text()).toContain('general.language')
  })
})
