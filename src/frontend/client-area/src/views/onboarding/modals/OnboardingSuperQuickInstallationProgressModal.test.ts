// "Start Creating" of the super-quick progress card: it opens the installed project once the
// install is done. Legacy kept it disabled in every state the flow reaches.
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import OnboardingSuperQuickInstallationProgressModal from './OnboardingSuperQuickInstallationProgressModal.vue'

let host: HTMLDivElement | undefined

async function mountModal (props: Record<string, unknown> = {}) {
  host = document.createElement('div')
  document.body.append(host)
  return mountKit(OnboardingSuperQuickInstallationProgressModal, {
    props: {
      modelValue: true,
      completed: false,
      error: false,
      installedInstance: { id: 7 },
      showStartCreatingButton: false,
      ...props,
    },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
}

const startCreating = () => document.body.querySelector<HTMLButtonElement>('[data-testid="onboarding-super-quick-start-creating"]')

afterEach(() => {
  document.body.innerHTML = ''
  host = undefined
})

describe('OnboardingSuperQuickInstallationProgressModal Start Creating', () => {
  it('is disabled while the install runs', async () => {
    await mountModal()
    expect(startCreating()!.disabled).toBe(true)
  })

  it('opens the installed project once the install is done', async () => {
    const wrapper = await mountModal({ completed: true, showStartCreatingButton: true })
    expect(startCreating()!.disabled).toBe(false)

    startCreating()!.click()
    expect(wrapper.emitted('go-to-details')).toEqual([[7]])
    wrapper.unmount()
  })

  it('stays disabled without the installed project', async () => {
    await mountModal({ completed: true, showStartCreatingButton: true, installedInstance: null })
    expect(startCreating()!.disabled).toBe(true)
  })

  it('gives way to Back To Dashboard after a failed install', async () => {
    await mountModal({ completed: true, error: true, showStartCreatingButton: true })
    expect(startCreating()).toBeNull()
  })
})
