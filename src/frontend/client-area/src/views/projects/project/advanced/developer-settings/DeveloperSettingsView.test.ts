import type { InstanceResource } from '@/entities/project/instance-resource'
import type { PhpMyAdminSso } from '@/entities/sso/use-phpmyadmin-sso'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { VBtn, VSelect } from 'vuetify/components'
import { clearInstanceModeCache, getInstanceMode, updateInstanceMode } from '@/entities/project/instance-modes.api'
import { useControlPanelSso } from '@/entities/sso/use-control-panel-sso'
import { usePhpMyAdminSso } from '@/entities/sso/use-phpmyadmin-sso'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
import { mountKit } from '@/test/mount-kit'
import {
  clearPhpVersionCache,
  getPhpSettings,
  getPhpVersion,
  getPhpVersions,
  type PhpSettingsResponse,
  type PhpVersion,
  updatePhpVersion,
} from './developer-settings.api'
import DeveloperSettingsView from './DeveloperSettingsView.vue'
import InstanceModeCard from './InstanceModeCard.vue'
import PhpSettingsCard from './PhpSettingsCard.vue'
import PhpVersionCard from './PhpVersionCard.vue'
import PhpVersionModal from './PhpVersionModal.vue'
import SsoLoginCard from './SsoLoginCard.vue'

vi.mock('./developer-settings.api', () => ({
  getPhpVersion: vi.fn(),
  getPhpVersions: vi.fn(),
  getPhpSettings: vi.fn(),
  updatePhpVersion: vi.fn(),
  updatePhpSettings: vi.fn(),
  clearPhpVersionCache: vi.fn(),
}))

vi.mock('@/entities/project/instance-modes.api', () => ({
  getInstanceMode: vi.fn(),
  updateInstanceMode: vi.fn(),
  clearInstanceModeCache: vi.fn(),
}))

vi.mock('@/entities/sso/use-control-panel-sso', () => ({
  useControlPanelSso: vi.fn(),
}))

vi.mock('@/entities/sso/use-phpmyadmin-sso', () => ({
  usePhpMyAdminSso: vi.fn(),
}))

const HOSTING_ID = 77
const DOMAIN = 'example.com'
const INSTANCE_ID = 9
const SSO_HOST = 'sso.example.com'

const PRIVILEGES = [
  'hasManageDebugModePrivilege',
  'hasManageMaintenanceModePrivilege',
  'hasControlPanelSsoPrivilege',
  'hasPhpmyadminSsoPrivilege',
  'hasChangePhpVersionPrivilege',
  'hasManagePhpSettingsPrivilege',
] as const

type Privilege = typeof PRIVILEGES[number]

const PHP_8_2: PhpVersion = { label: 'PHP 8.2', value: '8.2' }
const PHP_8_3: PhpVersion = { label: 'PHP 8.3', value: '8.3' }

const CONFIGURABLE_SETTINGS: PhpSettingsResponse = {
  configurable: true,
  custom_directives: false,
  directives: [{ directive: 'memory_limit', value: '256M' }],
  suggested_directives: [{ directive: 'memory_limit' }],
  modifiable_directives_list: true,
}

const NOT_CONFIGURABLE_SETTINGS: PhpSettingsResponse = {
  configurable: false,
  custom_directives: false,
  directives: [],
  suggested_directives: [],
}

function makeInstance (granted: readonly Privilege[] = PRIVILEGES, overrides: Record<string, unknown> = {}): InstanceResource {
  const privileges = Object.fromEntries(PRIVILEGES.map(name => [name, vi.fn(() => granted.includes(name))]))
  return {
    id: INSTANCE_ID,
    hostingId: HOSTING_ID,
    domain: DOMAIN,
    hostingServerType: 'plesk',
    hostingAccountDetails: { mysql_php_my_admin_sso_host: SSO_HOST },
    isContainer: false,
    setDebugMode: vi.fn(),
    setMaintenanceMode: vi.fn(),
    ...privileges,
    ...overrides,
  } as unknown as InstanceResource
}

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function mountView (instance: InstanceResource = makeInstance()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(DeveloperSettingsView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountView>>

function modeCard (wrapper: Wrapper, titleKey: string) {
  const card = wrapper.findAllComponents(InstanceModeCard).find(item => item.props('titleKey') === titleKey)
  if (!card) {
    throw new Error(`no mode card ${titleKey}`)
  }
  return card
}

function modeSwitch (wrapper: Wrapper, titleKey: string) {
  return modeCard(wrapper, titleKey).findComponent(ButtonSwitch)
}

function ssoCard (wrapper: Wrapper, buttonKey: string) {
  const card = wrapper.findAllComponents(SsoLoginCard).find(item => item.props('buttonKey') === buttonKey)
  if (!card) {
    throw new Error(`no sso card ${buttonKey}`)
  }
  return card
}

function buttonIn (wrapper: { findAllComponents: Wrapper['findAllComponents'] }, text: string) {
  const button = wrapper.findAllComponents(VBtn).find(item => item.text() === text)
  if (!button) {
    throw new Error(`no button ${text}`)
  }
  return button
}

const DEBUG_TITLE = 'heading.instance.advanced.developer.debug.title'
const MAINTENANCE_TITLE = 'heading.instance.advanced.developer.maintenance.title'
const CONTROL_PANEL_BUTTON = 'button.login.controlPanel'
const PHPMYADMIN_BUTTON = 'button.login.phpmyadmin'

describe('DeveloperSettingsView', () => {
  let sso: PhpMyAdminSso
  let controlPanelOpen: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    // The first mount initialises i18next (mount-kit does it once); the status keys are added after that.
    await mountKit(FormHelpIcon, { props: { text: 'warm up' } })
    i18next.addResource('en', 'translation', 'heading.instance.advanced.developer.phpVersion.status', 'PHP version: {{version}}')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstanceMode).mockResolvedValue(false)
    vi.mocked(updateInstanceMode).mockResolvedValue(undefined)
    vi.mocked(getPhpVersion).mockResolvedValue(PHP_8_2)
    vi.mocked(getPhpVersions).mockResolvedValue([PHP_8_2, PHP_8_3])
    vi.mocked(updatePhpVersion).mockResolvedValue(undefined)
    vi.mocked(getPhpSettings).mockResolvedValue(CONFIGURABLE_SETTINGS)

    controlPanelOpen = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useControlPanelSso).mockReturnValue({
      open: controlPanelOpen,
      loading: ref(false),
    } as unknown as ReturnType<typeof useControlPanelSso>)

    sso = {
      state: reactive({
        loading: false,
        ssoModal: { opened: false, hostingAccountId: null, serverType: null, databases: [], dnsMismatchDetected: false },
        chooseDatabase: { opened: false, hostingAccountId: null, databases: [] },
      }),
      login: vi.fn().mockResolvedValue(undefined),
      loginToDatabase: vi.fn(),
      closeChooseDatabase: vi.fn(),
    } as unknown as PhpMyAdminSso
    vi.mocked(usePhpMyAdminSso).mockReturnValue(sso)
  })

  describe('privileges', () => {
    it('renders only the title and asks for nothing without any privilege', async () => {
      const wrapper = await mountView(makeInstance([]))

      expect(wrapper.text()).toContain('heading.instance.advanced.developer.title')
      expect(wrapper.findComponent(InstanceModeCard).exists()).toBe(false)
      expect(wrapper.findComponent(SsoLoginCard).exists()).toBe(false)
      expect(wrapper.findComponent(PhpVersionCard).exists()).toBe(false)
      expect(wrapper.findComponent(PhpSettingsCard).exists()).toBe(false)
      expect(getInstanceMode).not.toHaveBeenCalled()
      expect(getPhpVersion).not.toHaveBeenCalled()
      expect(getPhpSettings).not.toHaveBeenCalled()
    })

    it.each([
      ['debug mode', 'hasManageDebugModePrivilege', InstanceModeCard],
      ['maintenance mode', 'hasManageMaintenanceModePrivilege', InstanceModeCard],
      ['Control Panel SSO', 'hasControlPanelSsoPrivilege', SsoLoginCard],
      ['phpMyAdmin SSO', 'hasPhpmyadminSsoPrivilege', SsoLoginCard],
      ['PHP version', 'hasChangePhpVersionPrivilege', PhpVersionCard],
      ['PHP settings', 'hasManagePhpSettingsPrivilege', PhpSettingsCard],
    ] as const)('renders only the %s card with its own privilege', async (_name, privilege: Privilege, component) => {
      const wrapper = await mountView(makeInstance([privilege]))

      const cards = [InstanceModeCard, SsoLoginCard, PhpVersionCard, PhpSettingsCard]
        .reduce((sum, item) => sum + wrapper.findAllComponents(item).length, 0)
      expect(cards).toBe(1)
      expect(wrapper.findAllComponents(component)).toHaveLength(1)
    })
  })

  describe('debug and maintenance modes', () => {
    it('saves the reversed debug mode, updates the instance and the cache, and shows the new state', async () => {
      const instance = makeInstance()
      const wrapper = await mountView(instance)
      const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

      await modeSwitch(wrapper, DEBUG_TITLE).trigger('click')
      await flushPromises()

      expect(updateInstanceMode).toHaveBeenCalledTimes(1)
      expect(updateInstanceMode).toHaveBeenCalledWith(INSTANCE_ID, 'debug-mode', true)
      expect(instance.setDebugMode).toHaveBeenCalledWith(true)
      expect(clearInstanceModeCache).toHaveBeenCalledWith(INSTANCE_ID, 'debug-mode')
      expect(modeSwitch(wrapper, DEBUG_TITLE).props('modelValue')).toBe(true)
      expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('sends one PUT when the switch is clicked again while the save is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(updateInstanceMode).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await modeSwitch(wrapper, DEBUG_TITLE).trigger('click')
      await modeSwitch(wrapper, DEBUG_TITLE).trigger('click')
      await flushPromises()

      expect(updateInstanceMode).toHaveBeenCalledTimes(1)

      save.resolve()
      await flushPromises()

      expect(modeSwitch(wrapper, DEBUG_TITLE).props('modelValue')).toBe(true)
    })

    it('keeps the state, the setter and the cache untouched when the maintenance PUT fails', async () => {
      const instance = makeInstance()
      vi.mocked(updateInstanceMode).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView(instance)
      const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

      await modeSwitch(wrapper, MAINTENANCE_TITLE).trigger('click')
      await flushPromises()

      expect(updateInstanceMode).toHaveBeenCalledWith(INSTANCE_ID, 'maintenance-mode', true)
      expect(instance.setMaintenanceMode).not.toHaveBeenCalled()
      expect(clearInstanceModeCache).not.toHaveBeenCalled()
      expect(modeSwitch(wrapper, MAINTENANCE_TITLE).props('modelValue')).toBe(false)
      expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    })
  })

  describe('SSO cards', () => {
    it('opens the Control Panel for the hosting on click', async () => {
      const wrapper = await mountView()

      await buttonIn(ssoCard(wrapper, CONTROL_PANEL_BUTTON), CONTROL_PANEL_BUTTON).trigger('click')
      await flushPromises()

      expect(controlPanelOpen).toHaveBeenCalledWith(HOSTING_ID)
    })

    it('logs in to phpMyAdmin with the hosting, its server type and SSO host on click', async () => {
      const wrapper = await mountView()

      await buttonIn(ssoCard(wrapper, PHPMYADMIN_BUTTON), PHPMYADMIN_BUTTON).trigger('click')
      await flushPromises()

      expect(sso.login).toHaveBeenCalledWith(HOSTING_ID, 'plesk', SSO_HOST)
    })

    it('shows the title and the phpMyAdmin hint in the SSO card', async () => {
      const wrapper = await mountView()
      const card = ssoCard(wrapper, PHPMYADMIN_BUTTON)

      expect(card.find('h6').exists()).toBe(true)
      expect(card.text()).toContain('heading.instance.advanced.developer.phpmyadmin.alert')
    })
  })

  describe('PHP version', () => {
    it('shows the title, the subtitle and the hint of the PHP version card', async () => {
      const wrapper = await mountView()
      const card = wrapper.findComponent(PhpVersionCard)

      expect(card.get('h6').text()).toBe('heading.instance.advanced.developer.phpVersion.title')
      expect(card.text()).toContain('heading.instance.advanced.developer.phpVersion.subtitle')
      expect(card.text()).toContain('heading.instance.advanced.developer.phpVersion.alert')
    })

    it('shows the current version in the status label', async () => {
      const wrapper = await mountView()

      expect(wrapper.findComponent(PhpVersionCard).text()).toContain('PHP version: PHP 8.2')
      expect(getPhpVersion).toHaveBeenCalledWith(HOSTING_ID, DOMAIN)
    })

    it('shows the status without a version when the domain has none', async () => {
      vi.mocked(getPhpVersion).mockResolvedValue(null)
      const wrapper = await mountView()

      const text = wrapper.findComponent(PhpVersionCard).text()
      expect(text).toContain('PHP version:')
      expect(text).not.toContain('{{version}}')
    })

    it('loads the versions on Manage, opens the modal, and saves the new version into the status', async () => {
      const wrapper = await mountView()

      await buttonIn(wrapper.findComponent(PhpVersionCard), 'button.manage').trigger('click')
      await flushPromises()

      expect(getPhpVersions).toHaveBeenCalledWith(HOSTING_ID)
      const modal = wrapper.findComponent(PhpVersionModal)
      expect(modal.props('open')).toBe(true)

      modal.findComponent(VSelect).vm.$emit('update:modelValue', PHP_8_3)
      await buttonIn(modal, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(updatePhpVersion).toHaveBeenCalledWith(HOSTING_ID, DOMAIN, '8.3')
      expect(clearPhpVersionCache).toHaveBeenCalledWith(HOSTING_ID, DOMAIN)
      expect(wrapper.findComponent(PhpVersionCard).text()).toContain('PHP version: PHP 8.3')
      expect(wrapper.findComponent(PhpVersionModal).props('open')).toBe(false)
    })
  })

  describe('PHP settings', () => {
    it('disables Manage and shows the phpSettings alert when the account is not configurable', async () => {
      vi.mocked(getPhpSettings).mockResolvedValue(NOT_CONFIGURABLE_SETTINGS)
      const wrapper = await mountView()

      const card = wrapper.findComponent(PhpSettingsCard)
      expect(card.text()).toContain('heading.instance.advanced.developer.phpSettings.alert')
      expect(buttonIn(card, 'button.manage').attributes('disabled')).toBeDefined()
      expect(getPhpSettings).toHaveBeenCalledWith(HOSTING_ID, DOMAIN)
    })

    it('enables Manage for a configurable account', async () => {
      const wrapper = await mountView()

      expect(buttonIn(wrapper.findComponent(PhpSettingsCard), 'button.manage').attributes('disabled')).toBeUndefined()
    })
  })

  describe('a container project', () => {
    it('asks for no PHP version or settings and explains why instead', async () => {
      const wrapper = await mountView(makeInstance(PRIVILEGES, { type: 'custom', isContainer: true }))

      expect(getPhpVersion).not.toHaveBeenCalled()
      expect(getPhpSettings).not.toHaveBeenCalled()
      expect(wrapper.findComponent(PhpVersionCard).exists()).toBe(false)
      expect(wrapper.findComponent(PhpSettingsCard).exists()).toBe(false)
      expect(wrapper.get('[data-testid=developer-php-container]').text())
        .toContain('message.hosting.php.containerProject')
    })

    it('shows no PHP explanation to a user without a PHP privilege', async () => {
      const wrapper = await mountView(makeInstance(['hasManageDebugModePrivilege'], { type: 'custom', isContainer: true }))

      expect(wrapper.find('[data-testid=developer-php-container]').exists()).toBe(false)
    })
  })
})
