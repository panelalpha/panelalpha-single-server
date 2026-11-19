import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPhpMyAdminPreviewSsoUrl, getPhpMyAdminSsoUrl } from '@/entities/sso/phpmyadmin-sso.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import PhpMyAdminSsoModal from './PhpMyAdminSsoModal.vue'

vi.mock('@/entities/sso/phpmyadmin-sso.api', () => ({
  getPhpMyAdminSsoUrl: vi.fn(),
  getPhpMyAdminPreviewSsoUrl: vi.fn(),
}))

const ONE_DATABASE = [{ value: 5, label: 'example_shop' }]
const TWO_DATABASES = [{ value: 5, label: 'example_shop' }, { value: 6, label: 'example_blog' }]

// The dialog is teleported to the document body, so the modal is read there.
const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

interface Props {
  modelValue?: boolean
  hostingAccountId?: number | null
  serverType?: string | null
  databases?: Array<{ value: number | undefined, label: string }>
  dnsMismatchDetected?: boolean
}

async function mountModal (props: Props = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(PhpMyAdminSsoModal, {
    props: {
      modelValue: true,
      hostingAccountId: 11,
      serverType: 'plesk',
      databases: ONE_DATABASE,
      dnsMismatchDetected: true,
      ...props,
    },
    global: { plugins: [pinia] },
    attachTo: host,
  })
  await flushPromises()
  return { wrapper: wrapper as VueWrapper, alerts: useAlertsStore() }
}

/** Clicks a button of the open modal by its test id, then settles the request. */
async function click (testId: string) {
  bodyQuery(`[data-testid="${testId}"]`)!.click()
  await flushPromises()
}

describe('PhpMyAdminSsoModal', () => {
  let open: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    open = vi.fn(() => ({ closed: false }))
    vi.spyOn(window, 'open').mockImplementation(open as never)
    vi.mocked(getPhpMyAdminSsoUrl).mockResolvedValue('https://pma.example.com/sso')
    vi.mocked(getPhpMyAdminPreviewSsoUrl).mockResolvedValue('https://pma.example.com/preview')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the DNS warning when the DNS mismatch is detected', async () => {
    const { wrapper } = await mountModal({ dnsMismatchDetected: true })
    expect(bodyQuery('[data-testid="phpmyadmin-sso-alert"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('hides the DNS warning when the DNS matches', async () => {
    const { wrapper } = await mountModal({ dnsMismatchDetected: false })
    expect(bodyQuery('[data-testid="phpmyadmin-sso-alert"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows no database select for a Plesk account with one database, and sends its id', async () => {
    const { wrapper } = await mountModal({ serverType: 'plesk', databases: ONE_DATABASE })
    expect(bodyQuery('[data-testid="phpmyadmin-sso-database"]')).toBeNull()

    await click('phpmyadmin-sso-direct')

    expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11, 5)
    expect(getPhpMyAdminPreviewSsoUrl).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('https://pma.example.com/sso')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('shows a database select for a Plesk account with several databases, and sends the chosen id', async () => {
    const { wrapper } = await mountModal({ serverType: 'plesk', databases: TWO_DATABASES })
    expect(bodyQuery('[data-testid="phpmyadmin-sso-database"]')).not.toBeNull()

    const select = wrapper.findComponent({ name: 'VSelect' })
    select.vm.$emit('update:modelValue', 6)
    await flushPromises()
    await click('phpmyadmin-sso-direct')

    expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11, 6)
    wrapper.unmount()
  })

  it('sends the first database when the select was not changed', async () => {
    const { wrapper } = await mountModal({ serverType: 'plesk', databases: TWO_DATABASES })
    await click('phpmyadmin-sso-direct')
    expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11, 5)
    wrapper.unmount()
  })

  it('requests the temporary URL only from the temporary URL button', async () => {
    const { wrapper } = await mountModal({ serverType: 'plesk', databases: ONE_DATABASE })

    await click('phpmyadmin-sso-preview')

    expect(getPhpMyAdminPreviewSsoUrl).toHaveBeenCalledWith(11, 5)
    expect(getPhpMyAdminSsoUrl).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('https://pma.example.com/preview')
    wrapper.unmount()
  })

  it('sends no database for a non-Plesk server', async () => {
    const { wrapper } = await mountModal({ serverType: 'cpanel', databases: [] })
    expect(bodyQuery('[data-testid="phpmyadmin-sso-database"]')).toBeNull()

    await click('phpmyadmin-sso-direct')

    expect(vi.mocked(getPhpMyAdminSsoUrl).mock.calls[0]![0]).toBe(11)
    expect(vi.mocked(getPhpMyAdminSsoUrl).mock.calls[0]![1]).toBeUndefined()
    wrapper.unmount()
  })

  it('alerts a failed request, keeps the dialog open and opens no window', async () => {
    vi.mocked(getPhpMyAdminSsoUrl).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountModal({ serverType: 'cpanel', databases: [] })
    vi.spyOn(alerts, 'addAlert')

    await click('phpmyadmin-sso-direct')

    expect(alerts.addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(open).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the dialog open with a login button when the browser blocked the window (review F5)', async () => {
    open.mockReturnValueOnce(null)
    const { wrapper } = await mountModal({ serverType: 'cpanel', databases: [] })

    await click('phpmyadmin-sso-direct')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(bodyQuery('[data-testid="phpmyadmin-sso-login"]')).not.toBeNull()

    await click('phpmyadmin-sso-login')

    expect(open).toHaveBeenLastCalledWith('https://pma.example.com/sso')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('alerts an empty url, keeps the dialog open and opens no window (review F5)', async () => {
    vi.mocked(getPhpMyAdminSsoUrl).mockResolvedValue('')
    const { wrapper, alerts } = await mountModal({ serverType: 'cpanel', databases: [] })
    vi.spyOn(alerts, 'addAlert')

    await click('phpmyadmin-sso-direct')

    expect(alerts.addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(open).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes on Cancel without a request', async () => {
    const { wrapper } = await mountModal()

    await click('phpmyadmin-sso-cancel')

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(getPhpMyAdminSsoUrl).not.toHaveBeenCalled()
    expect(getPhpMyAdminPreviewSsoUrl).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
