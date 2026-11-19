// The domain step of the New Instance form (classic PHP hosting, Git, WordPress) offers the same two rows as the
// WordPress wizard. Clicking the row that is already open collapsed it (Vuetify's panels toggle by default), which dropped the
// domain field, so the step has to keep the chosen row open.
import type { OnboardingService } from '@/views/onboarding/onboarding-service'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import OnboardingStandardFormModal from './OnboardingStandardFormModal.vue'

vi.mock('@/views/onboarding/onboarding.api')
vi.mock('@/entities/project/instance-deploy-logs.api')
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

let host: HTMLDivElement | undefined

afterEach(() => {
  host?.remove()
  host = undefined
})

async function mountForm () {
  host = document.createElement('div')
  document.body.append(host)
  const service = { id: 7, onboarding: { subdomain_bases: ['panelalpha.online'] } } as unknown as OnboardingService
  const wrapper = await mountKit(OnboardingStandardFormModal, {
    props: { modelValue: false, service },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

const titles = () => [...document.querySelectorAll<HTMLElement>('[data-testid="onboarding-standard-form-modal"] .v-expansion-panel-title')]
const mapTitle = () => titles().find(el => el.textContent?.includes('modal.setDomain.set.domain.title'))
const subdomainTitle = () => titles().find(el => el.textContent?.includes('modal.setDomain.set.subdomain.title'))
const domainField = () => document.querySelector('[data-testid="onboarding-standard-form-modal"] input[placeholder="form.placeholder.domain"]')
const subdomainField = () => document.querySelector('[data-testid="onboarding-standard-form-modal"] input[placeholder="mydomain"]')

describe('OnboardingStandardFormModal domain mode', () => {
  it('opens on the own-domain mode and keeps its field when that mode is clicked', async () => {
    const wrapper = await mountForm()
    expect(mapTitle()?.closest('.v-expansion-panel')?.className).toContain('--active')
    expect(domainField()).not.toBeNull()

    mapTitle()?.click()
    await flushPromises()

    expect(mapTitle()?.closest('.v-expansion-panel')?.className).toContain('--active')
    expect(domainField()).not.toBeNull()
    expect(subdomainField()).toBeNull()
    wrapper.unmount()
  })

  it('switches to the free subdomain and back without losing the field', async () => {
    const wrapper = await mountForm()

    subdomainTitle()?.click()
    await flushPromises()
    expect(subdomainField()).not.toBeNull()
    expect(domainField()).toBeNull()

    subdomainTitle()?.click()
    await flushPromises()
    expect(subdomainField()).not.toBeNull()

    mapTitle()?.click()
    await flushPromises()
    expect(domainField()).not.toBeNull()
    expect(subdomainField()).toBeNull()
    wrapper.unmount()
  })
})
