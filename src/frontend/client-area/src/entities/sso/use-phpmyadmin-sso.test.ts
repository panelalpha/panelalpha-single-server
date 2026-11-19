import type * as I18nextVue from 'i18next-vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { resolveARecord } from '@/entities/domain/dns-google'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { getPhpMyAdminSsoUrl, listPhpMyAdminDatabases } from './phpmyadmin-sso.api'
import { usePhpMyAdminSso } from './use-phpmyadmin-sso'

// The composable reads `useTranslation` (it runs in a component's setup), so the test answers the keys as they are.
vi.mock('i18next-vue', async importOriginal => ({
  ...(await importOriginal<typeof I18nextVue>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/entities/domain/dns-google', () => ({ resolveARecord: vi.fn() }))
vi.mock('./phpmyadmin-sso.api', () => ({
  listPhpMyAdminDatabases: vi.fn(),
  getPhpMyAdminSsoUrl: vi.fn(),
}))

const ONE_DATABASE = [{ value: 5, label: 'example_shop' }]
const TWO_DATABASES = [{ value: 5, label: 'example_shop' }, { value: 6, label: 'example_blog' }]

/** Sets the app flags of `/home`: single server and the preview site provider. */
function setFlags ({ singleServer = false, preview = false }: { singleServer?: boolean, preview?: boolean }) {
  useSessionStore().hydrateHome({
    app: { integrations: { preview_site_provider_enabled: preview }, single_server: { active: singleServer } },
    user: {},
  } as never)
}

/** Builds the composable inside a component's setup, as the screens call it. */
function create () {
  let sso!: ReturnType<typeof usePhpMyAdminSso>
  const wrapper = mount(defineComponent({
    setup () {
      sso = usePhpMyAdminSso()
      return () => null
    },
  }))
  return { sso, wrapper }
}

describe('usePhpMyAdminSso', () => {
  let alerts: ReturnType<typeof useAlertsStore>
  let open: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    alerts = useAlertsStore()
    vi.spyOn(alerts, 'addAlert')
    open = vi.fn(() => ({ closed: false }))
    vi.spyOn(window, 'open').mockImplementation(open as never)
    // A host with an A record unless a test says otherwise.
    vi.mocked(resolveARecord).mockResolvedValue('192.0.2.10')
    vi.mocked(getPhpMyAdminSsoUrl).mockResolvedValue('https://pma.example.com/sso')
    vi.mocked(listPhpMyAdminDatabases).mockResolvedValue([])
    setFlags({})
  })

  describe('the modal path (no A record, single server or preview provider)', () => {
    it('looks up the DNS before it fetches the databases', async () => {
      setFlags({ preview: true })
      vi.mocked(resolveARecord).mockResolvedValue(null)
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue(ONE_DATABASE)
      const { sso } = create()

      await sso.login(11, 'plesk', 'example.com')

      expect(vi.mocked(resolveARecord).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(listPhpMyAdminDatabases).mock.invocationCallOrder[0]!)
    })

    it('alerts and stops for a Plesk account without databases', async () => {
      setFlags({ preview: true })
      vi.mocked(resolveARecord).mockResolvedValue(null)
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue([])
      const { sso } = create()

      await sso.login(11, 'plesk', 'example.com')

      expect(alerts.addAlert).toHaveBeenCalledWith({ success: false, errorMessage: 'message.emptyTable.databases.database.description' })
      expect(sso.state.ssoModal.opened).toBe(false)
      expect(getPhpMyAdminSsoUrl).not.toHaveBeenCalled()
    })

    it('opens the SSO modal with the databases and the DNS warning for Plesk', async () => {
      setFlags({ singleServer: true })
      vi.mocked(resolveARecord).mockResolvedValue(null)
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue(TWO_DATABASES)
      const { sso } = create()

      await sso.login(11, 'plesk', 'example.com')

      expect(sso.state.ssoModal).toEqual({
        opened: true,
        hostingAccountId: 11,
        serverType: 'plesk',
        databases: TWO_DATABASES,
        dnsMismatchDetected: true,
      })
      expect(getPhpMyAdminSsoUrl).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
    })

    it('opens the SSO modal for a non-Plesk server without fetching databases', async () => {
      setFlags({ preview: true })
      vi.mocked(resolveARecord).mockResolvedValue(null)
      const { sso } = create()

      await sso.login(11, 'cpanel', 'example.com')

      expect(listPhpMyAdminDatabases).not.toHaveBeenCalled()
      expect(sso.state.ssoModal).toMatchObject({ opened: true, hostingAccountId: 11, serverType: 'cpanel', databases: [], dnsMismatchDetected: true })
    })
  })

  describe('the direct path (A record found, or neither flag)', () => {
    it('posts without a database for a non-Plesk server and opens the URL', async () => {
      const { sso } = create()

      await sso.login(11, 'cpanel', 'example.com')

      expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11)
      expect(open).toHaveBeenCalledWith('https://pma.example.com/sso')
      expect(sso.state.ssoModal.opened).toBe(false)
    })

    it('opens the SSO modal when the browser blocked the window, so the one-time url is not lost (review F5)', async () => {
      open.mockReturnValueOnce(null)
      const { sso } = create()

      await sso.login(11, 'cpanel', 'example.com')

      expect(sso.state.ssoModal).toMatchObject({ opened: true, hostingAccountId: 11, serverType: 'cpanel', databases: [], dnsMismatchDetected: false })
    })

    it('alerts an empty url and opens neither a window nor the modal (review F5)', async () => {
      vi.mocked(getPhpMyAdminSsoUrl).mockResolvedValue('')
      const { sso } = create()

      await sso.login(11, 'cpanel', 'example.com')

      expect(alerts.addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
      expect(open).not.toHaveBeenCalled()
      expect(sso.state.ssoModal.opened).toBe(false)
    })

    it('alerts and stops for a Plesk account without databases', async () => {
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue([])
      const { sso } = create()

      await sso.login(11, 'plesk', 'example.com')

      expect(alerts.addAlert).toHaveBeenCalledWith({ success: false, errorMessage: 'message.emptyTable.databases.database.description' })
      expect(getPhpMyAdminSsoUrl).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
    })

    it('posts the only database of a Plesk account and opens it', async () => {
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue(ONE_DATABASE)
      const { sso } = create()

      await sso.login(11, 'plesk', 'example.com')

      expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11, 5)
      expect(open).toHaveBeenCalledWith('https://pma.example.com/sso')
      expect(sso.state.chooseDatabase.opened).toBe(false)
    })

    it('opens the database choice for a Plesk account with several databases and posts nothing yet', async () => {
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue(TWO_DATABASES)
      const { sso } = create()

      await sso.login(11, 'plesk', 'example.com')

      expect(sso.state.chooseDatabase).toEqual({ opened: true, hostingAccountId: 11, databases: TWO_DATABASES })
      expect(getPhpMyAdminSsoUrl).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
    })

    it('loginToDatabase posts the chosen database and closes nothing else', async () => {
      const { sso } = create()

      await sso.loginToDatabase(11, 6)

      expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11, 6)
      expect(open).toHaveBeenCalledWith('https://pma.example.com/sso')
    })

    it('closeChooseDatabase closes the database choice', async () => {
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue(TWO_DATABASES)
      const { sso } = create()
      await sso.login(11, 'plesk', 'example.com')

      sso.closeChooseDatabase()

      expect(sso.state.chooseDatabase.opened).toBe(false)
    })
  })

  describe('errors and re-entry', () => {
    it('alerts a failed login request and does not open a window', async () => {
      vi.mocked(getPhpMyAdminSsoUrl).mockRejectedValue(new Error('boom'))
      const { sso } = create()

      await sso.login(11, 'cpanel', 'example.com')

      expect(alerts.addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
      expect(open).not.toHaveBeenCalled()
      expect(sso.state.loading).toBe(false)
    })

    it('alerts a failed database list once, without the empty-list message on top (review F9)', async () => {
      vi.mocked(listPhpMyAdminDatabases).mockRejectedValue(new Error('boom'))
      const { sso } = create()

      await sso.login(11, 'plesk', 'example.com')

      expect(alerts.addAlert).toHaveBeenCalledTimes(1)
      expect(alerts.addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false, errorMessage: expect.not.stringContaining('emptyTable') }))
      expect(sso.state.loading).toBe(false)
    })

    it('ignores a second login while the first one runs', async () => {
      let resolveDatabases!: (value: typeof ONE_DATABASE) => void
      vi.mocked(listPhpMyAdminDatabases).mockReturnValue(new Promise(resolve => {
        resolveDatabases = resolve
      }))
      const { sso } = create()

      const first = sso.login(11, 'plesk', 'example.com')
      expect(sso.state.loading).toBe(true)
      // The first login runs DNS before the database fetch, so wait until it reaches the fetch.
      await vi.waitFor(() => expect(listPhpMyAdminDatabases).toHaveBeenCalledTimes(1))
      await sso.login(11, 'plesk', 'example.com')
      expect(listPhpMyAdminDatabases).toHaveBeenCalledTimes(1)

      resolveDatabases(ONE_DATABASE)
      await first
      expect(sso.state.loading).toBe(false)
      expect(open).toHaveBeenCalledTimes(1)
    })
  })
})
