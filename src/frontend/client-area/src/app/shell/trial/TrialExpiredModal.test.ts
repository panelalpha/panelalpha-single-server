import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import TrialExpiredModal from './TrialExpiredModal.vue'

// The trial modal before and after it moves to `AppDialog` + `BasicModal`. The locators exist in both
// versions: the card test id, the link `href`, the button text and `.v-card-title button` (the X).
const UPGRADE = 'https://upgrade.test/plan'

async function mountModal (upgradeLink: string | null = UPGRADE) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({
    app: {},
    user: { services: [{ id: 1, status: 'active', is_trial: true, trial_expiry_at: '2026-01-01T00:00:00Z', plan_upgrade_link: upgradeLink }] },
  } as never)
  const wrapper = await mountKit(TrialExpiredModal, { props: { modelValue: true }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

function card (): HTMLElement {
  return document.body.querySelector<HTMLElement>('.v-overlay--active [data-testid="shell-trial-modal"]')!
}

function buttonByText (text: string): HTMLElement | undefined {
  return [...card().querySelectorAll<HTMLElement>('.v-btn')].find(button => button.textContent?.includes(text))
}

describe('TrialExpiredModal', () => {
  it('shows the headline, the text and Upgrade now as a link to the plan upgrade', async () => {
    const wrapper = await mountModal()

    expect(card().textContent).toContain('heading.trialExpiredModal.headline')
    expect(card().textContent).toContain('heading.trialExpiredModal.text')
    const upgrade = [...card().querySelectorAll<HTMLAnchorElement>('a')].find(link => link.getAttribute('href') === UPGRADE)
    expect(upgrade).not.toBeNull()
    expect(upgrade!.textContent).toContain('general.upgradeNow')
    wrapper.unmount()
  })

  it('has no Upgrade now without an upgrade link', async () => {
    const wrapper = await mountModal(null)

    expect(card().querySelector('a[href]')).toBeNull()
    expect(buttonByText('general.upgradeNow')).toBeUndefined()
    wrapper.unmount()
  })

  it('asks to close from Cancel and from the X', async () => {
    const wrapper = await mountModal()

    buttonByText('button.cancel')!.click()
    card().querySelector<HTMLElement>('.v-card-title button')!.click()

    expect(wrapper.emitted('update:model-value')).toEqual([[false], [false]])
    wrapper.unmount()
  })

  it('opens after the legacy overlay and asks to close on a click on it (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountModal()

    const overlay = card().previousElementSibling as HTMLElement
    expect(overlay.classList.contains('card-overlay')).toBe(true)
    overlay.click()

    expect(wrapper.emitted('update:model-value')).toEqual([[false]])
    wrapper.unmount()
  })
})
