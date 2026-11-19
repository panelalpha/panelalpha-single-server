import type { PhpMyAdminSso } from '@/entities/sso/use-phpmyadmin-sso'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { getPhpMyAdminPreviewSsoUrl, getPhpMyAdminSsoUrl } from '@/entities/sso/phpmyadmin-sso.api'
import { usePhpMyAdminSso } from '@/entities/sso/use-phpmyadmin-sso'
import { mountKit } from '@/test/mount-kit'
import PhpMyAdminSsoDialogs from './PhpMyAdminSsoDialogs.vue'

vi.mock('@/entities/sso/phpmyadmin-sso.api', () => ({
  getPhpMyAdminSsoUrl: vi.fn(),
  getPhpMyAdminPreviewSsoUrl: vi.fn(),
  listPhpMyAdminDatabases: vi.fn(),
}))

const TWO_DATABASES = [{ value: 5, label: 'example_shop' }, { value: 6, label: 'example_blog' }]

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const bodyQueryAll = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)]

/** The button of the open dialog whose text contains `label` (the kit's i18n answers the keys). */
function buttonIn (scope: string, label: string): HTMLElement {
  return bodyQueryAll(`${scope} .v-btn`).find(button => button.textContent?.includes(label))!
}

/** Mounts the dialogs the way a screen does: the host calls the composable in its setup and embeds one component. */
async function mountDialogs () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  let sso!: PhpMyAdminSso
  const wrapper = await mountKit(defineComponent({
    setup () {
      sso = usePhpMyAdminSso()
      return () => h(PhpMyAdminSsoDialogs, { sso })
    },
  }), { global: { plugins: [pinia] }, attachTo: host })
  await flushPromises()
  return { wrapper, sso }
}

describe('PhpMyAdminSsoDialogs', () => {
  let open: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    open = vi.fn()
    vi.spyOn(window, 'open').mockImplementation(open as never)
    vi.mocked(getPhpMyAdminSsoUrl).mockResolvedValue('https://pma.example.com/sso')
    vi.mocked(getPhpMyAdminPreviewSsoUrl).mockResolvedValue('https://pma.example.com/preview')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing while both dialogs are closed', async () => {
    const { wrapper } = await mountDialogs()
    expect(bodyQuery('[data-testid="phpmyadmin-sso-modal"]')).toBeNull()
    expect(bodyQuery('[data-testid="phpmyadmin-choose-database"]')).toBeNull()
    wrapper.unmount()
  })

  it('renders the SSO modal with the DNS warning when the state opens it', async () => {
    const { wrapper, sso } = await mountDialogs()

    Object.assign(sso.state.ssoModal, {
      opened: true,
      hostingAccountId: 11,
      serverType: 'cpanel',
      databases: [],
      dnsMismatchDetected: true,
    })
    await flushPromises()

    expect(bodyQuery('[data-testid="phpmyadmin-sso-modal"]')).not.toBeNull()
    expect(bodyQuery('[data-testid="phpmyadmin-sso-alert"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('opens the database choice on BasicModal with the first database selected, and logs in to it', async () => {
    const { wrapper, sso } = await mountDialogs()

    Object.assign(sso.state.chooseDatabase, { opened: true, hostingAccountId: 11, databases: TWO_DATABASES })
    await flushPromises()

    const scope = '[data-testid="phpmyadmin-choose-database"]'
    expect(bodyQuery(scope)?.classList.contains('basic-modal')).toBe(true)

    buttonIn(scope, 'button.login.phpmyadmin').click()
    await flushPromises()

    expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11, 5)
    expect(open).toHaveBeenCalledWith('https://pma.example.com/sso')
    expect(sso.state.chooseDatabase.opened).toBe(false)
    wrapper.unmount()
  })

  it('closes the database choice on Cancel without a request', async () => {
    const { wrapper, sso } = await mountDialogs()

    Object.assign(sso.state.chooseDatabase, { opened: true, hostingAccountId: 11, databases: TWO_DATABASES })
    await flushPromises()

    buttonIn('[data-testid="phpmyadmin-choose-database"]', 'button.cancel').click()
    await flushPromises()

    expect(sso.state.chooseDatabase.opened).toBe(false)
    expect(getPhpMyAdminSsoUrl).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
