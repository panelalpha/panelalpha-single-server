import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent } from 'vue'
import { listDomains, setPrimaryDomain } from '@/views/hosting/hosting.api'
import { getInstance } from '@/views/projects/project/instance.api'
import { useInstanceStore } from '@/views/projects/project/instance.store'
import TopBarTitle from '@/views/projects/project/topbar/TopBarTitle.vue'
import { getDetectedCertificate, getInstalledCertificate } from '@/entities/ssl/ssl-certificates.api'
import { mountKit } from '@/test/mount-kit'
import AdvancedDomainsView from './AdvancedDomainsView.vue'

// The top bar's address after Set As Primary Domain, through the star, Confirm and the frame's re-read.

vi.mock('@/views/hosting/hosting.api', () => ({ listDomains: vi.fn(), addDomain: vi.fn(), updateDomain: vi.fn(), deleteDomain: vi.fn(), setPrimaryDomain: vi.fn(), verifyDomain: vi.fn() }))
vi.mock('@/views/hosting/containers/containers.api', () => ({ listProxyRules: vi.fn() }))
vi.mock('@/entities/ssl/ssl-certificates.api', () => ({
  getDetectedCertificate: vi.fn().mockResolvedValue(null),
  getInstalledCertificate: vi.fn().mockResolvedValue(null),
  resetCertificateCache: vi.fn(),
}))
vi.mock('@/views/projects/project/instance.api', () => ({ getInstance: vi.fn(), updateSiteName: vi.fn() }))

// The top bar's own parts that this page does not exercise (as `TopBarTitle.test.ts` does).
vi.mock('@/views/projects/project/topbar/SetYourDomainModal.vue', () => ({ default: { template: '<span />' } }))
vi.mock('@/views/projects/project/topbar/TopBarEditableTitle.vue', () => ({ default: { template: '<span />' } }))
vi.mock('@/entities/label/ui/InstanceLabels.vue', () => ({ default: { template: '<span />' } }))

const ACCOUNT_ID = 77

function makeInstance (): InstanceResource {
  return {
    id: 9,
    service_id: 5,
    hostingId: ACCOUNT_ID,
    hostingServerType: 'cpanel',
    hostingAccountDetails: { homedir: '/home/shop' },
    diagnostic_mode: false,
    domain: 'a.test',
    url: 'https://a.test',
    privileges: ['hosting.manage_domains'],
  } as unknown as InstanceResource
}

/** The project page as the frame renders it: the top bar over the Advanced > Domains screen, both on one resource. */
const ProjectPage = defineComponent({
  components: { AdvancedDomainsView, TopBarTitle },
  setup () {
    const store = useInstanceStore()
    return { resource: computed(() => store.instance) }
  },
  template: '<div><TopBarTitle v-if="resource" :instance="resource" :fetching="false" /><AdvancedDomainsView v-if="resource" :instance="resource" /></div>',
})

/** The Confirm button of the switch dialog (it teleports to the body). */
function confirmButton (): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === 'button.confirm')
  if (!button) {
    throw new Error('the action dialog has no Confirm button')
  }
  return button
}

/** The star of the row whose own address is `domain`, then Confirm: what the page offers and a user clicks. */
async function setAsPrimary (wrapper: Awaited<ReturnType<typeof mountPage>>, domain: string): Promise<void> {
  const row = wrapper.findAll('[data-testid="domains-row"]')
    .find(candidate => candidate.get('[data-testid="domains-row-link"]').text().trim() === domain)
  if (!row) {
    throw new Error(`no row for ${domain}: ${wrapper.findAll('[data-testid="domains-row-link"]').map(link => link.text())}`)
  }
  await row.get('[data-testid="domains-row-action-set-primary"]').trigger('click')
  await flushPromises()
  confirmButton().click()
  await flushPromises()
}

async function mountPage () {
  const pinia = createPinia()
  setActivePinia(pinia)
  useInstanceStore().replace(makeInstance())
  const wrapper = await mountKit(ProjectPage, { global: { plugins: [pinia] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const topBarUrl = (wrapper: Awaited<ReturnType<typeof mountPage>>) => wrapper.get('[data-testid="instance-url"]').text().trim()

describe('AdvancedDomainsView after Set As Primary Domain', () => {
  let mainDomain = 'a.test'

  beforeEach(() => {
    vi.resetAllMocks()
    mainDomain = 'a.test'
    vi.mocked(getDetectedCertificate).mockResolvedValue(null)
    vi.mocked(getInstalledCertificate).mockResolvedValue(null)
    vi.mocked(listDomains).mockImplementation(async () => ({
      data: [
        { domain: mainDomain, type: 'main', capabilities: { can_set_as_primary: true }, updated_at: null },
        { domain: mainDomain === 'a.test' ? 'b.test' : 'a.test', type: 'addon', capabilities: { can_set_as_primary: true }, updated_at: null },
      ],
      meta: { domain_types: ['addon', 'sub'] },
    }))
    vi.mocked(setPrimaryDomain).mockImplementation(async (_accountId: number, domain: string) => {
      mainDomain = domain
    })
    vi.mocked(getInstance).mockImplementation(async () => ({ id: 9, domain: mainDomain, url: `https://${mainDomain}` } as never))
  })

  it('shows the new address in the top bar both ways, without a reload', async () => {
    const wrapper = await mountPage()
    expect(topBarUrl(wrapper)).toBe('https://a.test')

    await setAsPrimary(wrapper, 'b.test')
    expect(topBarUrl(wrapper)).toBe('https://b.test')
    expect(setPrimaryDomain).toHaveBeenCalledWith(ACCOUNT_ID, 'b.test')
    expect(getInstance).toHaveBeenCalledWith(9, null)

    await setAsPrimary(wrapper, 'a.test')
    expect(topBarUrl(wrapper)).toBe('https://a.test')
    expect(getInstance).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('keeps the address the page showed when the re-read fails', async () => {
    const wrapper = await mountPage()
    vi.mocked(getInstance).mockRejectedValue(new Error('503'))

    await setAsPrimary(wrapper, 'b.test')

    expect(topBarUrl(wrapper)).toBe('https://a.test')
    wrapper.unmount()
  })
})
