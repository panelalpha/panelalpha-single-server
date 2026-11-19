import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import OnboardingChooseInstallationTypeModal from './OnboardingChooseInstallationTypeModal.vue'

async function mountModal (props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = mountKit(OnboardingChooseInstallationTypeModal, {
    props: { modelValue: true, available: ['wordpress', 'git', 'go'], selected: 'wordpress', ...props },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  return wrapper
}

function el (testId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(testId)}"]`)
}

function continueButton (): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('button.continue'))
  if (!button) {
    throw new Error('Continue not found')
  }
  return button
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('OnboardingChooseInstallationTypeModal: PanelAlpha Go', () => {
  it('offers PanelAlpha Go as a selectable card when the panel is paired with the Hub', async () => {
    await mountModal()

    expect(el('onboarding-installation-type-go')).not.toBeNull()
    // The PanelAlpha GO! mark, not a line icon.
    expect(el('onboarding-installation-type-go')?.querySelector('img.installation-type__go-mark')).not.toBeNull()
    expect(el('onboarding-installation-type-go-locked')).toBeNull()
  })

  it('greys PanelAlpha Go and asks to connect to the Hub first when the panel is not paired', async () => {
    const wrapper = await mountModal({ goLocked: true })

    expect(el('onboarding-installation-type-go')).toBeNull()
    expect(el('onboarding-installation-type-go-locked')?.textContent).toContain('heading.onboarding.instanceSource.go.connectHub')
    expect(document.querySelector('input[value="go"]')).toBeNull()

    el('onboarding-installation-type-go-connect')?.click()
    expect(wrapper.emitted('connect-hub')).toHaveLength(1)
  })

  it('never goes on with a locked PanelAlpha Go', async () => {
    const wrapper = await mountModal({ goLocked: true, selected: 'go' })

    continueButton().click()

    expect(wrapper.emitted('next')).toBeUndefined()
  })
})
