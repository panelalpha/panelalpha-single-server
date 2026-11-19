import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as cachedGet from '@/shared/api/cached-get'
import { useSessionStore } from '@/shared/session/session.store'
import * as applyLanguageModule from '@/shared/ui/language/apply-language'
import { controlAfterLabel, labelByText } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import * as freeBackupsApi from './backups/free-backups.api'
import * as freeSettingsApi from './free-settings.api'
import SettingsView from './SettingsView.vue'
import * as sitesBaseDomainApi from './sites-base-domain.api'

// The Hub section has its own tests; here only where it sits.
vi.mock('@/views/account/settings/hub/HubConnection.vue', async () => {
  const { h } = await import('vue')
  return { default: { name: 'HubConnection', render: () => h('div', { class: 'hub-connection-stub' }) } }
})

vi.mock('./free-settings.api', () => ({
  getFreeSettings: vi.fn(),
  updateFreeSettings: vi.fn(),
  updateFreeUrl: vi.fn(),
}))

vi.mock('./sites-base-domain.api', () => ({
  getFreeSitesBaseDomain: vi.fn(),
  updateFreeSitesBaseDomain: vi.fn(),
}))

vi.mock('./backups/free-backups.api', () => ({
  getFreeBackups: vi.fn(),
  updateFreeBackups: vi.fn(),
  updateFreeBackupStore: vi.fn(),
  removeFreeBackupStore: vi.fn(),
}))

vi.mock('@/shared/ui/language/apply-language', () => ({ applyLanguage: vi.fn(() => Promise.resolve()) }))
vi.mock('@/shared/api/cached-get', () => ({ clearAllCachedGet: vi.fn() }))

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const SETTINGS = {
  name: 'Box',
  url: 'https://old.example.com:8443',
  default_language: 'en',
  default_date_format: 'DD.MM.YYYY',
  languages: ['en'],
  date_formats: ['YYYY-MM-DD', 'DD.MM.YYYY'],
}

// `GET /community/settings/sites-base-domain` of an Engine with no base domain on a public address.
const NAMING = {
  sites_base_domain: null,
  project_domain_bases: [
    { base: 'panelalpha.online', source: 'panelalpha_online', suffixed: true, publicly_resolvable: true },
    { base: '203-0-113-10.panelalpha.direct', source: 'panelalpha_direct', suffixed: false, publicly_resolvable: true },
    { base: 'local', source: 'local', suffixed: false, publicly_resolvable: false },
  ],
  certificate_issuer: 'self_signed',
  shared_zone_issuance: false,
  panelalpha_online_error: null,
}

const BACKUPS = {
  store: { id: 1, name: 'Store', driver: 'local', location: '/opt/panelalpha/backups' },
  store_selected: true,
  store_created: true,
  defaults: { auto_enable: true, frequency: 'daily', hour: 3, day_of_week: null, day_of_month: null, keep_last: 7 },
}

async function mountView (path = '/settings', attachTo?: HTMLElement) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: SettingsView }],
  })
  await router.push(path)
  await router.isReady()
  const replace = vi.spyOn(router, 'replace')
  // Unless a test sets its own: `resetAllMocks` leaves the Backups load undefined.
  if (!vi.mocked(freeBackupsApi.getFreeBackups).getMockImplementation()) {
    vi.mocked(freeBackupsApi.getFreeBackups).mockResolvedValue(BACKUPS)
  }
  if (!vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain).getMockImplementation()) {
    vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain).mockResolvedValue(NAMING)
  }
  const wrapper = await mountKit(SettingsView, { global: { plugins: [pinia, router] }, ...(attachTo ? { attachTo } : {}) })
  await flushPromises()
  return { wrapper, router, replace, pinia }
}

// Hovers the Default domain help icon and answers its tooltip (open-delay 150, as FormHelpIcon).
async function openNamingTooltip (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): Promise<HTMLElement> {
  await wrapper.get('[data-testid="settings-project-domains-help"]').trigger('mouseenter')
  await new Promise(resolve => setTimeout(resolve, 250))
  await nextTick()
  return document.body.querySelector<HTMLElement>('.v-tooltip [data-testid="settings-project-domains"]')!
}

function namesIn (tooltip: HTMLElement): string[] {
  return [...tooltip.querySelectorAll('[data-testid="settings-project-domain-name"]')].map(name => (name.textContent ?? '').trim())
}

describe('SettingsView frame and loading', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the title, the General tab and skeletons while the settings load', async () => {
    const pending = deferred<typeof SETTINGS>()
    vi.mocked(freeSettingsApi.getFreeSettings).mockReturnValue(pending.promise)
    const { wrapper } = await mountView()

    expect(wrapper.find('h1').text()).toBe('settings.title')
    const tabs = wrapper.findAll('.v-tab')
    expect(tabs.map(tab => tab.text())).toEqual(['settings.tabs.general', 'settings.tabs.backups'])
    expect(wrapper.find('.v-tab--selected').text()).toBe('settings.tabs.general')
    expect(wrapper.find('.v-tabs--page').exists()).toBe(true)
    // ui-fix-v2: the tabs have no h4 of their own.
    expect(wrapper.find('.settings-tab-title').exists()).toBe(false)
    expect(wrapper.find('h4').exists()).toBe(false)
    expect(wrapper.findAll('.settings-section')).toHaveLength(2)
    expect(wrapper.text()).toContain('settings.sections.general')
    expect(wrapper.text()).toContain('settings.sections.url')
    // Label and field of each General and URL field (the Change Domain button and its skeleton are gone).
    expect(wrapper.findAll('.v-skeleton-loader')).toHaveLength(8)
    // Legacy skeleton: one invisible details line per General field and under the URL field.
    expect(wrapper.findAll('.settings-skeleton__details')).toHaveLength(4)
    expect(wrapper.find('.settings-skeleton__details[aria-hidden="true"]').text()).toBe('settings.urlTooltip')
    expect(wrapper.find('.settings-load-error').exists()).toBe(false)
  })

  it('loads GET /community/settings once on mount and drops the skeletons', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    const { wrapper } = await mountView()

    expect(freeSettingsApi.getFreeSettings).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    expect(wrapper.find('.settings-load-error').exists()).toBe(false)
  })

  it('shows the load error without the key prefix and Retry returns to the skeleton', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockRejectedValueOnce({
      response: { status: 500, data: { errors: { engine: ['Engine is down.'] } } },
    })
    const { wrapper } = await mountView()

    const card = wrapper.find('.settings-load-error')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Engine is down.')
    expect(card.text()).not.toContain('engine:')
    expect(wrapper.findAll('.settings-section')).toHaveLength(1)

    const retry = deferred<typeof SETTINGS>()
    vi.mocked(freeSettingsApi.getFreeSettings).mockReturnValueOnce(retry.promise)
    await wrapper.find('.settings-retry').trigger('click')
    await flushPromises()
    expect(freeSettingsApi.getFreeSettings).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.settings-load-error').exists()).toBe(false)
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)

    retry.resolve(SETTINGS)
    await flushPromises()
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    expect(wrapper.find('.settings-load-error').exists()).toBe(false)
  })

  it('falls back to the message of the response when the error has no errors bag', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockRejectedValue({ response: { status: 500, data: { message: 'Server down' } } })
    const { wrapper } = await mountView()

    expect(wrapper.find('.settings-load-error').text()).toContain('Server down')
  })

  it('opens Backups for ?tab=backups without replacing the URL', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    const { wrapper, replace } = await mountView('/settings?tab=backups')

    expect(wrapper.find('.v-tab--selected').text()).toBe('settings.tabs.backups')
    expect(replace).not.toHaveBeenCalled()
  })

  it('opens General for an unknown tab without replacing the URL', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    const { wrapper, replace } = await mountView('/settings?tab=nope')

    expect(wrapper.find('.v-tab--selected').text()).toBe('settings.tabs.general')
    expect(replace).not.toHaveBeenCalled()
  })

  it('follows the query while mounted: Backups for ?tab=backups, General when it goes', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    const { wrapper, router } = await mountView()

    await router.push('/settings?tab=backups')
    await flushPromises()
    expect(wrapper.find('.v-tab--selected').text()).toBe('settings.tabs.backups')

    await router.push('/settings')
    await flushPromises()
    expect(wrapper.find('.v-tab--selected').text()).toBe('settings.tabs.general')
  })

  it('puts the tab into the URL with a replace when it changes', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    const { wrapper, replace } = await mountView()

    await wrapper.findAll('.v-tab')[1]!.trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'backups' } })
  })
})

describe('SettingsView Backups tab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
  })

  it('shows the title, the Backup storage section and the store row', async () => {
    const { wrapper } = await mountView('/settings?tab=backups')

    expect(wrapper.find('.settings-tab-title').exists()).toBe(false)
    expect(wrapper.find('h4').exists()).toBe(false)
    expect(wrapper.text()).toContain('settings.sections.backupStorage')
    expect(wrapper.find('.backup-store-location').text()).toBe('/opt/panelalpha/backups')
    expect(wrapper.find('.backup-store-driver').text()).toBe('settings.backups.drivers.local')
  })

  it('loads GET /community/backups on mount, in parallel with GET /community/settings', async () => {
    const settings = deferred<typeof SETTINGS>()
    vi.mocked(freeSettingsApi.getFreeSettings).mockReturnValue(settings.promise)
    await mountView()

    expect(freeSettingsApi.getFreeSettings).toHaveBeenCalledTimes(1)
    expect(freeBackupsApi.getFreeBackups).toHaveBeenCalledTimes(1)
  })

  it('shows the skeleton while the backups load', async () => {
    vi.mocked(freeBackupsApi.getFreeBackups).mockReturnValue(deferred<typeof BACKUPS>().promise)
    const { wrapper } = await mountView('/settings?tab=backups')

    expect(wrapper.findAll('.backup-storage .v-skeleton-loader')).toHaveLength(2)
    expect(wrapper.find('.backup-error').exists()).toBe(false)
  })

  it('a failed backups load shows its error and Retry loads again, while General is unaffected', async () => {
    vi.mocked(freeBackupsApi.getFreeBackups).mockRejectedValueOnce({
      response: { status: 500, data: { errors: { engine: ['Engine is down.'] } } },
    })
    const { wrapper } = await mountView('/settings?tab=backups')

    const card = wrapper.find('.backup-error')
    expect(card.text()).toContain('Engine is down.')
    expect(card.text()).not.toContain('engine:')
    expect(wrapper.find('.settings-load-error').exists()).toBe(false)

    vi.mocked(freeBackupsApi.getFreeBackups).mockResolvedValueOnce(BACKUPS)
    await wrapper.find('.backup-retry').trigger('click')
    await flushPromises()
    expect(freeBackupsApi.getFreeBackups).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.backup-error').exists()).toBe(false)
    expect(wrapper.find('.backup-store-summary').exists()).toBe(true)
  })

  it('a failed settings load does not block the backups', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockRejectedValue({ response: { status: 500, data: { message: 'Down' } } })
    const { wrapper } = await mountView('/settings?tab=backups')

    expect(wrapper.find('.backup-store-summary').exists()).toBe(true)
    expect(wrapper.find('.backup-error').exists()).toBe(false)
  })

  it('offers Remove only for the store the owner chose', async () => {
    vi.mocked(freeBackupsApi.getFreeBackups).mockResolvedValue({ ...BACKUPS, store_selected: false, store_created: false })
    const { wrapper } = await mountView('/settings?tab=backups')

    expect(wrapper.find('.backup-store-button').exists()).toBe(true)
    expect(wrapper.find('.backup-store-remove').exists()).toBe(false)
  })

  it('removing the store applies the answer and drops the Remove button', async () => {
    vi.mocked(freeBackupsApi.removeFreeBackupStore).mockResolvedValue({
      ...BACKUPS,
      store: { id: 25, name: 'Default', driver: 'local', location: '/opt/panelalpha/backups/default' },
      store_selected: false,
      store_created: false,
      cleanup: { id: 1, container: 'deleted', reason: null },
    })
    const { wrapper } = await mountView('/settings?tab=backups')

    expect(wrapper.find('.backup-store-remove').text()).toBe('settings.backups.removeStore')
    await wrapper.find('.backup-store-remove').trigger('click')
    await flushPromises()
    document.querySelector<HTMLInputElement>('[data-testid="store-remove-confirm-check"] input')!.click()
    await flushPromises()
    document.querySelector<HTMLElement>('.store-remove-confirm')!.click()
    await flushPromises()

    expect(freeBackupsApi.removeFreeBackupStore).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.backup-store-location').text()).toBe('/opt/panelalpha/backups/default')
    expect(wrapper.find('.backup-store-remove').exists()).toBe(false)
    expect(freeBackupsApi.getFreeBackups).toHaveBeenCalledTimes(1)
  })

  it('shows "no store" for a loaded null store', async () => {
    vi.mocked(freeBackupsApi.getFreeBackups).mockResolvedValue({ ...BACKUPS, store: null })
    const { wrapper } = await mountView('/settings?tab=backups')

    expect(wrapper.find('.backup-no-store').exists()).toBe(true)
  })
})

type Mounted = Awaited<ReturnType<typeof mountView>>['wrapper']

const saveButton = (wrapper: Mounted) => wrapper.find('button[type=submit]')
const isDisabled = (button: ReturnType<typeof saveButton>) => button.attributes('disabled') !== undefined

async function submit (wrapper: Mounted) {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

const DEFAULT_HOME = { user: { language: 'pl' }, app: { default_language: 'en' } }

function mockHome (pinia: ReturnType<typeof createPinia>, home: Record<string, unknown> = DEFAULT_HOME) {
  return vi.spyOn(useSessionStore(pinia), 'ensureHome').mockResolvedValue(home as never)
}

describe('SettingsView General form', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    vi.mocked(freeSettingsApi.updateFreeSettings).mockResolvedValue(SETTINGS)
  })

  it('prefills the fields from GET /community/settings', async () => {
    const { wrapper } = await mountView()

    expect((wrapper.find('input[name="name"]').element as HTMLInputElement).value).toBe('Box')
    expect(wrapper.find('.settings-language').text()).toContain('en')
    expect(wrapper.find('.settings-date-format').text()).toMatch(/DD\.MM\.YYYY — \d{2}\.\d{2}\.\d{4}/)
    expect(wrapper.find('.settings-error').exists()).toBe(false)
  })

  it('keeps Save disabled until a field changes and again after the save', async () => {
    const { wrapper, pinia } = await mountView()
    mockHome(pinia)
    expect(isDisabled(saveButton(wrapper))).toBe(true)

    await wrapper.find('input[name="name"]').setValue('Renamed')
    expect(isDisabled(saveButton(wrapper))).toBe(false)

    await wrapper.find('input[name="name"]').setValue('Box')
    expect(isDisabled(saveButton(wrapper))).toBe(true)

    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)
    expect(isDisabled(saveButton(wrapper))).toBe(true)
  })

  it('does not send a blank name', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('input[name="name"]').setValue(' '.repeat(3))
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeSettings).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('settings.validation.required')
  })

  it('does not send a name over 255 characters', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('input[name="name"]').setValue('a'.repeat(256))
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeSettings).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('settings.validation.maxLength')
  })

  it('saves only General, toasts, then clears the cache, refreshes /home and only then changes the language', async () => {
    const { wrapper, pinia } = await mountView()
    const ensureHome = mockHome(pinia)
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeSettings).toHaveBeenCalledTimes(1)
    expect(freeSettingsApi.updateFreeSettings).toHaveBeenCalledWith({
      name: 'Renamed',
      default_language: 'en',
      default_date_format: 'DD.MM.YYYY',
    })
    expect(freeSettingsApi.updateFreeUrl).not.toHaveBeenCalled()
    expect(ensureHome).toHaveBeenCalledWith(true)
    expect(applyLanguageModule.applyLanguage).toHaveBeenCalledWith('pl')

    const order = (fn: unknown) => (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0]!
    expect(order(freeSettingsApi.updateFreeSettings)).toBeLessThan(order(cachedGet.clearAllCachedGet))
    expect(order(cachedGet.clearAllCachedGet)).toBeLessThan(order(ensureHome))
    expect(order(ensureHome)).toBeLessThan(order(applyLanguageModule.applyLanguage))
    expect(useAlertsStore(pinia).activeAlerts).toMatchObject([{ success: true, successMessage: 'settings.saved' }])
  })

  it('falls back to the app default language when the user has none', async () => {
    const { wrapper, pinia } = await mountView()
    mockHome(pinia, { user: {}, app: { default_language: 'de' } })
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)

    expect(applyLanguageModule.applyLanguage).toHaveBeenCalledWith('de')
  })

  it('keeps the spinner until /home is refreshed', async () => {
    const { wrapper, pinia } = await mountView()
    const home = deferred<never>()
    vi.spyOn(useSessionStore(pinia), 'ensureHome').mockReturnValue(home.promise)
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)

    expect(wrapper.find('button[type=submit]').classes()).toContain('v-btn--loading')
    expect(wrapper.find('input[name="name"]').attributes('disabled')).toBeDefined()

    home.resolve({ user: { language: 'en' } } as never)
    await flushPromises()
    expect(wrapper.find('button[type=submit]').classes()).not.toContain('v-btn--loading')
  })

  it('reports the save as done and adds an error toast when only the /home refresh fails', async () => {
    const { wrapper, pinia } = await mountView()
    vi.spyOn(useSessionStore(pinia), 'ensureHome').mockRejectedValue(new Error('offline'))
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)

    const alerts = useAlertsStore(pinia).activeAlerts
    expect(alerts.map(alert => alert.success)).toEqual([true, false])
    expect(applyLanguageModule.applyLanguage).not.toHaveBeenCalled()
    expect(isDisabled(saveButton(wrapper))).toBe(true)
    expect(wrapper.find('button[type=submit]').classes()).not.toContain('v-btn--loading')
  })

  it('shows a 422 under its field without the key and does not refresh /home', async () => {
    vi.mocked(freeSettingsApi.updateFreeSettings).mockRejectedValue({
      response: { status: 422, data: { errors: { name: ['The name has already been taken.'] } } },
    })
    const { wrapper, pinia } = await mountView()
    const ensureHome = mockHome(pinia)
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)

    const field = wrapper.find('input[name="name"]').element.closest('.v-input')!
    expect(field.textContent).toContain('The name has already been taken.')
    expect(wrapper.text()).not.toContain('name:')
    expect(wrapper.find('.settings-error').exists()).toBe(false)
    expect(ensureHome).not.toHaveBeenCalled()
    expect(isDisabled(saveButton(wrapper))).toBe(false)

    await wrapper.find('input[name="name"]').setValue('Renamed again')
    await flushPromises()
    expect(wrapper.text()).not.toContain('The name has already been taken.')
  })

  it('lists a 422 key without a General field above the footer', async () => {
    vi.mocked(freeSettingsApi.updateFreeSettings).mockRejectedValue({
      response: { status: 422, data: { errors: { url: ['The url is wrong.'] } } },
    })
    const { wrapper } = await mountView()
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)

    const lines = wrapper.findAll('.settings-error')
    expect(lines.map(line => line.text())).toEqual(['The url is wrong.'])
    expect(lines[0]!.classes()).toContain('text-error')
    expect(wrapper.find('.v-card-text .settings-error').exists()).toBe(true)
  })

  it('shows a toast for a failure other than 422 and keeps Save enabled', async () => {
    vi.mocked(freeSettingsApi.updateFreeSettings).mockRejectedValue({ response: { status: 500, data: { message: 'Boom' } } })
    const { wrapper, pinia } = await mountView()
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await submit(wrapper)

    expect(useAlertsStore(pinia).activeAlerts).toMatchObject([{ success: false, errorMessage: 'Boom' }])
    expect(isDisabled(saveButton(wrapper))).toBe(false)
  })

  it('has no Save while the load failed', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockRejectedValue({ response: { status: 500, data: { message: 'Down' } } })
    const { wrapper } = await mountView()

    expect(wrapper.find('button[type=submit]').exists()).toBe(false)
    expect(wrapper.find('input[name="name"]').exists()).toBe(false)
  })
})

// The Application URL is edited in place and saved with Save Changes (legacy: readonly, Change Domain opened a modal).
describe('SettingsView Application URL', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
  })

  it('shows the URL in an editable field with its hint, and no Change Domain button', async () => {
    const { wrapper } = await mountView()

    const field = wrapper.find('.settings-url input')
    expect((field.element as HTMLInputElement).value).toBe('https://old.example.com:8443')
    expect(field.attributes('readonly')).toBeUndefined()
    expect(wrapper.find('.settings-url').text()).toContain('settings.urlTooltip')
    expect(wrapper.find('.change-domain').exists()).toBe(false)
    expect(isDisabled(saveButton(wrapper))).toBe(true)
    wrapper.unmount()
  })

  it('saves a changed URL with Save Changes alone, without refreshing /home', async () => {
    vi.mocked(freeSettingsApi.updateFreeUrl).mockResolvedValue({ url: 'https://new.example.com:8443' })
    const { wrapper, pinia } = await mountView()
    const ensureHome = vi.spyOn(useSessionStore(pinia), 'ensureHome')

    await wrapper.find('.settings-url input').setValue(' https://new.example.com:8443 ')
    // The DNS note replaces the hint while the URL differs from the saved one.
    expect(wrapper.find('.settings-url').text()).toContain('settings.urlModal.dnsNote')
    expect(isDisabled(saveButton(wrapper))).toBe(false)
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeUrl).toHaveBeenCalledWith('https://new.example.com:8443')
    expect(freeSettingsApi.updateFreeSettings).not.toHaveBeenCalled()
    expect((wrapper.find('.settings-url input').element as HTMLInputElement).value).toBe('https://new.example.com:8443')
    expect(useAlertsStore(pinia).activeAlerts).toMatchObject([{ success: true, successMessage: 'settings.saved' }])
    expect(ensureHome).not.toHaveBeenCalled()
    expect(isDisabled(saveButton(wrapper))).toBe(true)
    expect(wrapper.find('[data-testid="settings-oauth-callbacks"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('refuses an address with a path before any request', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('.settings-url input').setValue('https://new.example.com/panel')
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeUrl).not.toHaveBeenCalled()
    expect(wrapper.find('.settings-url').text()).toContain('settings.validation.url')
    wrapper.unmount()
  })

  it('shows a 422 of the URL under its field and keeps the rest saved', async () => {
    vi.mocked(freeSettingsApi.updateFreeSettings).mockResolvedValue(SETTINGS)
    vi.mocked(freeSettingsApi.updateFreeUrl).mockRejectedValue({
      response: { status: 422, data: { message: 'x', errors: { url: ['The SSL certificate could not be issued.'] } } },
    })
    const { wrapper, pinia } = await mountView()
    mockHome(pinia)

    await wrapper.find('input[name="name"]').setValue('Renamed')
    await wrapper.find('.settings-url input').setValue('https://new.example.com')
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeSettings).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.settings-url').text()).toContain('The SSL certificate could not be issued.')
    expect(useAlertsStore(pinia).activeAlerts).toEqual([])
    // The name is saved; the URL still differs, so Save stays on for another try.
    expect(isDisabled(saveButton(wrapper))).toBe(false)
    wrapper.unmount()
  })

  it('refuses an http address before any request', async () => {
    const { wrapper } = await mountView()

    // eslint-disable-next-line unicorn/prefer-https -- the refused http scheme is the point of this test
    await wrapper.find('.settings-url input').setValue('http://new.example.com')
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeUrl).not.toHaveBeenCalled()
    expect(wrapper.find('.settings-url').text()).toContain('settings.validation.urlHttps')
    wrapper.unmount()
  })

  it('refuses a port no server can listen on before any request', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('.settings-url input').setValue('https://new.example.com:99999')
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeUrl).not.toHaveBeenCalled()
    expect(wrapper.find('.settings-url').text()).toContain('settings.validation.port')
    wrapper.unmount()
  })

  it('links to the new address once the panel moved there (G49), and shows nothing when it did not', async () => {
    vi.mocked(freeSettingsApi.updateFreeUrl).mockResolvedValue({ url: 'https://new.example.com', moved: true })
    const { wrapper } = await mountView()

    await wrapper.find('.settings-url input').setValue('https://new.example.com')
    await submit(wrapper)

    const moved = wrapper.find('[data-testid="settings-url-moved"]')
    expect(moved.text()).toContain('settings.urlMoved.title')
    expect(moved.text()).toContain('settings.urlMoved.text')
    expect(wrapper.find('[data-testid="settings-url-moved-open"]').attributes('href')).toBe('https://new.example.com/')

    vi.mocked(freeSettingsApi.updateFreeUrl).mockResolvedValue({ url: 'https://other.example.com', moved: false })
    await wrapper.find('.settings-url input').setValue('https://other.example.com')
    await submit(wrapper)

    expect(wrapper.find('[data-testid="settings-url-moved"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('lists the OAuth callback URLs after a URL change with social login on', async () => {
    vi.mocked(freeSettingsApi.updateFreeUrl).mockResolvedValue({ url: 'https://new.example.com' })
    const { wrapper, pinia } = await mountView()
    useSessionStore(pinia).hydrateHome({ app: { integrations: { auth: ['google', 'github'] } } } as never)

    await wrapper.find('.settings-url input').setValue('https://new.example.com')
    await submit(wrapper)

    const callbacks = wrapper.find('[data-testid="settings-oauth-callbacks"]')
    expect(callbacks.text()).toContain('settings.urlModal.oauthTitle')
    expect(callbacks.findAll('code').map(code => code.text())).toEqual([
      'https://new.example.com/auth/google/callback',
      'https://new.example.com/auth/github/callback',
    ])
    wrapper.unmount()
  })
})

describe('SettingsView sites base domain (ID-51)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
  })

  it('shows the Engine\'s domain in an editable field with its hint, below the URL, and no Change button', async () => {
    vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain).mockResolvedValue({ ...NAMING, sites_base_domain: 'apps.example.com' })
    const { wrapper } = await mountView()

    const field = wrapper.find('.settings-sites-base-domain input')
    expect((field.element as HTMLInputElement).value).toBe('apps.example.com')
    expect(field.attributes('readonly')).toBeUndefined()
    expect(field.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.settings-sites-base-domain').text()).toContain('settings.sitesBaseDomainHint')
    expect(wrapper.text()).toContain('settings.sections.sitesBaseDomain')
    expect(wrapper.find('.change-sites-base-domain').exists()).toBe(false)
    const html = wrapper.html()
    expect(html.indexOf('settings-sites-base-domain')).toBeGreaterThan(html.indexOf('settings-url'))
    expect(sitesBaseDomainApi.getFreeSitesBaseDomain).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('says when the Engine has none', async () => {
    const { wrapper } = await mountView()

    const field = wrapper.find('.settings-sites-base-domain input')
    expect((field.element as HTMLInputElement).value).toBe('')
    expect(field.attributes('placeholder')).toBe('settings.sitesBaseDomainNotSet')
    wrapper.unmount()
  })

  it('shows its own load error with a Retry link, while General stays usable', async () => {
    vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain)
      .mockRejectedValueOnce({ response: { status: 503, data: { message: 'The Engine is down' } } })
      .mockResolvedValueOnce({ ...NAMING, sites_base_domain: 'apps.example.com' })
    const { wrapper } = await mountView()

    expect(wrapper.find('.settings-sites-base-domain').text()).toContain('The Engine is down')
    expect(wrapper.find('.settings-sites-base-domain input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="settings-field-name"]').exists()).toBe(true)

    await wrapper.get('[data-testid="settings-sites-base-domain-retry"]').trigger('click')
    await flushPromises()

    expect(sitesBaseDomainApi.getFreeSitesBaseDomain).toHaveBeenCalledTimes(2)
    expect((wrapper.find('.settings-sites-base-domain input').element as HTMLInputElement).value).toBe('apps.example.com')
    expect(wrapper.find('[data-testid="settings-sites-base-domain-retry"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('saves it with Save Changes alone, and the tooltip follows the answer', async () => {
    vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain).mockResolvedValue({ ...NAMING, sites_base_domain: 'old.example.com' })
    vi.mocked(sitesBaseDomainApi.updateFreeSitesBaseDomain).mockResolvedValue({
      ...NAMING,
      sites_base_domain: 'apps.example.com',
      project_domain_bases: [{ base: 'apps.example.com', source: 'sites_base_domain', suffixed: false, publicly_resolvable: null }, ...NAMING.project_domain_bases],
    })
    const host = document.createElement('div')
    document.body.append(host)
    const { wrapper, pinia } = await mountView('/settings', host)

    await wrapper.find('.settings-sites-base-domain input').setValue(' Apps.Example.com ')
    expect(isDisabled(saveButton(wrapper))).toBe(false)
    await submit(wrapper)

    expect(sitesBaseDomainApi.updateFreeSitesBaseDomain).toHaveBeenCalledWith('Apps.Example.com')
    expect(freeSettingsApi.updateFreeSettings).not.toHaveBeenCalled()
    expect((wrapper.find('.settings-sites-base-domain input').element as HTMLInputElement).value).toBe('apps.example.com')
    expect(useAlertsStore(pinia).activeAlerts).toMatchObject([{ success: true, successMessage: 'settings.saved' }])
    expect(isDisabled(saveButton(wrapper))).toBe(true)
    // The tooltip follows the save's answer, without another load.
    expect(namesIn(await openNamingTooltip(wrapper))[0]).toBe('<project>.apps.example.com')
    expect(sitesBaseDomainApi.getFreeSitesBaseDomain).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    host.remove()
  })

  it('clears it with an empty field', async () => {
    vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain).mockResolvedValue({ ...NAMING, sites_base_domain: 'old.example.com' })
    vi.mocked(sitesBaseDomainApi.updateFreeSitesBaseDomain).mockResolvedValue(NAMING)
    const { wrapper } = await mountView()

    await wrapper.find('.settings-sites-base-domain input').setValue('')
    await submit(wrapper)

    expect(sitesBaseDomainApi.updateFreeSitesBaseDomain).toHaveBeenCalledWith('')
    expect(wrapper.find('.settings-sites-base-domain input').attributes('placeholder')).toBe('settings.sitesBaseDomainNotSet')
    wrapper.unmount()
  })

  it('refuses a value that is not a domain name, and shows the Engine\'s 422 under the field', async () => {
    vi.mocked(sitesBaseDomainApi.updateFreeSitesBaseDomain).mockRejectedValue({
      response: { status: 422, data: { message: 'x', errors: { sites_base_domain: ['localhost is not a hostname sites can be named under.'] } } },
    })
    const { wrapper, pinia } = await mountView()

    await wrapper.find('.settings-sites-base-domain input').setValue('not a domain')
    await submit(wrapper)
    expect(sitesBaseDomainApi.updateFreeSitesBaseDomain).not.toHaveBeenCalled()
    expect(wrapper.find('.settings-sites-base-domain').text()).toContain('settings.validation.domain')

    await wrapper.find('.settings-sites-base-domain input').setValue('localhost')
    await submit(wrapper)
    expect(wrapper.find('.settings-sites-base-domain').text()).toContain('localhost is not a hostname sites can be named under.')
    expect(useAlertsStore(pinia).activeAlerts).toEqual([])
    wrapper.unmount()
  })

  it('keeps the whole General form unsent while the default domain is invalid', async () => {
    const { wrapper, pinia } = await mountView()

    // The reported sequence: another field changed as well, so Save is enabled and the domain is the only invalid field.
    await wrapper.find('input[name="name"]').setValue('Renamed')
    await wrapper.find('.settings-sites-base-domain input').setValue('not_a_domain')
    expect(isDisabled(saveButton(wrapper))).toBe(false)
    expect(wrapper.find('.settings-sites-base-domain').text()).toContain('settings.validation.domain')
    await submit(wrapper)

    expect(freeSettingsApi.updateFreeSettings).not.toHaveBeenCalled()
    expect(sitesBaseDomainApi.updateFreeSitesBaseDomain).not.toHaveBeenCalled()
    expect(useAlertsStore(pinia).activeAlerts).toEqual([])
    wrapper.unmount()
  })

  it('lists the names the Engine gives new projects in a tooltip on the label, best first', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const { wrapper } = await mountView('/settings', host)

    // Nothing under the field: only the help icon after the label.
    expect(wrapper.find('[data-testid="settings-project-domains"]').exists()).toBe(false)
    const help = wrapper.get('[data-testid="settings-project-domains-help"]')
    expect(help.attributes('aria-label')).toBe('settings.projectDomains.help')
    expect(help.element.closest('label')).not.toBeNull()

    const tooltip = await openNamingTooltip(wrapper)
    expect(namesIn(tooltip)).toEqual(['<project>-xxxx.panelalpha.online', '<project>.203-0-113-10.panelalpha.direct'])
    const lines = [...tooltip.querySelectorAll('[data-testid="settings-project-domain"]')].map(line => line.textContent ?? '')
    expect(lines[0]).toContain('settings.projectDomains.title')
    expect(lines[0]).toContain('settings.projectDomains.panelalphaOnline')
    expect(lines[1]).toContain('settings.projectDomains.fallback')
    expect(lines[1]).toContain('settings.projectDomains.certificateSelfSigned')
    wrapper.unmount()
    host.remove()
  })

  it('says the Engine chooses when it does not report its names', async () => {
    vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain).mockResolvedValue({ ...NAMING, project_domain_bases: null })
    const host = document.createElement('div')
    document.body.append(host)
    const { wrapper } = await mountView('/settings', host)

    expect((await openNamingTooltip(wrapper)).textContent?.trim()).toBe('settings.projectDomains.engineChooses')
    wrapper.unmount()
    host.remove()
  })

  it('has no help icon while the names cannot be loaded', async () => {
    vi.mocked(sitesBaseDomainApi.getFreeSitesBaseDomain).mockRejectedValue({ response: { status: 503, data: { message: 'The Engine is down' } } })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="settings-project-domains-help"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('SettingsView Hub section', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the Hub as its own card above the form card, without a section heading, while the settings load', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockReturnValue(deferred<typeof SETTINGS>().promise)
    const { wrapper } = await mountView()

    expect(wrapper.find('.hub-connection-stub').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('settings.sections.hub')
    expect(wrapper.find('.v-card .hub-connection-stub').exists()).toBe(false)
    const sections = wrapper.findAll('.settings-section')
    expect(sections).toHaveLength(2)
    expect(sections[1]?.find('.v-divider').exists()).toBe(false)
  })

  it('keeps the Hub section when the settings fail to load', async () => {
    vi.mocked(freeSettingsApi.getFreeSettings).mockRejectedValue({ response: { status: 500, data: { message: 'Server Error' } } })
    const { wrapper } = await mountView()

    expect(wrapper.find('.settings-load-error').exists()).toBe(true)
    expect(wrapper.find('.hub-connection-stub').exists()).toBe(true)
  })
})

describe('SettingsView Backups save', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    vi.mocked(freeBackupsApi.getFreeBackups).mockResolvedValue(BACKUPS)
    vi.mocked(freeBackupsApi.updateFreeBackups).mockResolvedValue({ defaults: { ...BACKUPS.defaults, keep_last: 10 } })
  })

  async function mountBackups () {
    const mounted = await mountView('/settings?tab=backups')
    const form = mounted.wrapper.findAll('form').find(item => item.find('.backup-keep-last').exists())!
    return { ...mounted, form, save: () => form.find('button[type=submit]') }
  }

  async function submitForm (form: Awaited<ReturnType<typeof mountBackups>>['form']) {
    await form.trigger('submit')
    await flushPromises()
  }

  async function editKeepLast (wrapper: Mounted, value: string) {
    await wrapper.find('.backup-keep-last input').setValue(value)
    await flushPromises()
  }

  it('keeps Save disabled until the schedule changes', async () => {
    const { wrapper, save } = await mountBackups()
    expect(isDisabled(save())).toBe(true)

    await editKeepLast(wrapper, '10')
    expect(isDisabled(save())).toBe(false)
  })

  it('has no Save and no fields when the backups failed to load', async () => {
    vi.mocked(freeBackupsApi.getFreeBackups).mockRejectedValue({ response: { status: 500, data: { message: 'Down' } } })
    const { wrapper } = await mountView('/settings?tab=backups')

    expect(wrapper.find('.backup-error').exists()).toBe(true)
    expect(wrapper.find('.backup-retry').exists()).toBe(true)
    expect(wrapper.find('.backup-keep-last').exists()).toBe(false)
    expect(wrapper.find('button[type=submit]').exists()).toBe(false)
  })

  it('sends the payload, applies the returned defaults and toasts', async () => {
    const { wrapper, form, save, pinia } = await mountBackups()
    await editKeepLast(wrapper, '10')
    await submitForm(form)

    expect(freeBackupsApi.updateFreeBackups).toHaveBeenCalledTimes(1)
    expect(vi.mocked(freeBackupsApi.updateFreeBackups).mock.calls[0]![0]).toMatchObject({ frequency: 'daily', keepLast: 10 })
    expect(useAlertsStore(pinia).activeAlerts).toMatchObject([{ success: true, successMessage: 'settings.saved' }])
    expect(isDisabled(save())).toBe(true)
    expect(freeBackupsApi.getFreeBackups).toHaveBeenCalledTimes(1)
  })

  it('does not send an empty keep last', async () => {
    const { wrapper, form } = await mountBackups()
    await editKeepLast(wrapper, '')
    await submitForm(form)

    expect(freeBackupsApi.updateFreeBackups).not.toHaveBeenCalled()
  })

  it('lists a 422 for a day without a field (weekly)', async () => {
    vi.mocked(freeBackupsApi.updateFreeBackups).mockRejectedValue({ response: { status: 422, data: { errors: { day_of_month: ['Bad day.'] } } } })
    vi.mocked(freeBackupsApi.getFreeBackups).mockResolvedValue({ ...BACKUPS, defaults: { ...BACKUPS.defaults, frequency: 'weekly', day_of_week: 2, day_of_month: 5 } })
    const { wrapper, form } = await mountBackups()
    await editKeepLast(wrapper, '10')
    await submitForm(form)

    expect(wrapper.findAll('.settings-error').map(line => line.text())).toEqual(['Bad day.'])
  })

  it('shows a 422 for the day of month under its field (monthly)', async () => {
    vi.mocked(freeBackupsApi.updateFreeBackups).mockRejectedValue({ response: { status: 422, data: { errors: { day_of_month: ['Bad day.'] } } } })
    vi.mocked(freeBackupsApi.getFreeBackups).mockResolvedValue({ ...BACKUPS, defaults: { ...BACKUPS.defaults, frequency: 'monthly', day_of_week: 2, day_of_month: 5 } })
    const { wrapper, form } = await mountBackups()
    await editKeepLast(wrapper, '10')
    await submitForm(form)

    expect(wrapper.findAll('.settings-error')).toHaveLength(0)
    expect(wrapper.find('.backup-day-of-month').text()).toContain('Bad day.')
  })

  it('lists a 422 with only a message', async () => {
    vi.mocked(freeBackupsApi.updateFreeBackups).mockRejectedValue({ response: { status: 422, data: { message: 'Engine says no.' } } })
    const { wrapper, form } = await mountBackups()
    await editKeepLast(wrapper, '10')
    await submitForm(form)

    expect(wrapper.findAll('.settings-error').map(line => line.text())).toEqual(['Engine says no.'])
  })

  it('toasts a failure other than 422 and loads the backups again', async () => {
    vi.mocked(freeBackupsApi.updateFreeBackups).mockRejectedValue({ response: { status: 500, data: { message: 'Boom' } } })
    const { wrapper, form, pinia } = await mountBackups()
    await editKeepLast(wrapper, '10')
    await submitForm(form)

    expect(useAlertsStore(pinia).activeAlerts).toMatchObject([{ success: false, errorMessage: 'Boom' }])
    expect(freeBackupsApi.getFreeBackups).toHaveBeenCalledTimes(2)
  })

  it('keeps the unsaved edits when the store is saved', async () => {
    const { wrapper } = await mountBackups()
    await editKeepLast(wrapper, '10')
    const store = { id: 2, name: 'S3', driver: 's3', location: 'bucket' }
    wrapper.findComponent({ name: 'BackupStorage' }).vm.$emit('saved', { store })
    await flushPromises()

    expect((wrapper.find('.backup-keep-last input').element as HTMLInputElement).value).toBe('10')
    expect(freeBackupsApi.getFreeBackups).toHaveBeenCalledTimes(1)
  })

  it('keeps the unsaved edits when the store is removed', async () => {
    const { wrapper } = await mountBackups()
    await editKeepLast(wrapper, '10')
    wrapper.findComponent({ name: 'BackupStorage' }).vm.$emit('removed', {
      ...BACKUPS,
      store: { id: 25, name: 'Default', driver: 'local', location: '/opt/panelalpha/backups/default' },
      store_selected: false,
      store_created: false,
      cleanup: { id: 1, container: 'deleted', reason: null },
    })
    await flushPromises()

    expect((wrapper.find('.backup-keep-last input').element as HTMLInputElement).value).toBe('10')
    expect(wrapper.find('.backup-store-remove').exists()).toBe(false)
  })
})

describe('SettingsView General labels (kit-form-fields)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(freeSettingsApi.getFreeSettings).mockResolvedValue(SETTINGS)
    vi.mocked(freeSettingsApi.updateFreeSettings).mockResolvedValue(SETTINGS)
  })

  it('puts each General label right above its control (kit-form-fields)', async () => {
    const { wrapper } = await mountView()
    const root = wrapper.element.parentElement ?? wrapper.element
    const pairs: Array<[string, string]> = [
      ['settings.name', '[data-testid="settings-field-name"]'],
      ['settings.defaultLanguage', '[data-testid="settings-field-language"]'],
      ['settings.defaultDateFormat', '[data-testid="settings-field-date-format"]'],
      ['settings.url', '[data-testid="settings-url"]'],
      ['settings.sitesBaseDomain', '[data-testid="settings-sites-base-domain"]'],
    ]
    for (const [text, selector] of pairs) {
      const label = labelByText(root, text)
      expect(label).not.toBeNull()
      expect(controlAfterLabel(root, label!, selector)).not.toBeNull()
    }
  })
})
