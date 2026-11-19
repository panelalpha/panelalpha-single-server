import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getServiceInstanceOptions, retryInstall } from '@/entities/project/instance-actions.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { on as onAppEvent } from '@/shared/events/app-events'
import { cancelFilesCreate } from '@/shared/files/files-create'
import { DEMO_EMAIL } from '@/shared/session/demo-mode'
import { useSessionStore } from '@/shared/session/session.store'
import { useOnboardingFlow } from './onboarding-flow'
import { disarmBackButton } from './onboarding-history'
import { createFilesDomain, createImportDomain, createServiceDomain, deleteDeployKeyProject, deployGitSsh, deployInstance, importInstance, installServiceInstance, listServiceDomains, previewEnvExample, uploadDeployFile } from './onboarding.api'
import { INSTANCE_OPTIONS_HOLD_MS, useOnboardingStore } from './onboarding.store'
import { createStandardForm, type StandardFormValues } from './standard-form'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/instances', query: { page: '2' } }),
  useRouter: () => router,
}))

vi.mock('@/entities/project/instance-actions.api', () => ({
  getServiceInstanceOptions: vi.fn(),
  retryInstall: vi.fn(),
}))

vi.mock('./onboarding.api', () => ({
  createFilesDomain: vi.fn(),
  createImportDomain: vi.fn(),
  createServiceDomain: vi.fn(),
  deleteDeployKeyProject: vi.fn(),
  deployGitSsh: vi.fn(),
  deployInstance: vi.fn(),
  importInstance: vi.fn(),
  installServiceInstance: vi.fn(),
  listServiceDomains: vi.fn(),
  previewEnvExample: vi.fn(),
  uploadDeployFile: vi.fn(),
}))

function service (patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 10,
    status: 'active',
    instance_count: 0,
    instance_limit: 5,
    onboarding: { installation_type: { wordpress: true }, user_configurable_options: [] },
    ...patch,
  }
}

function signIn (services: Record<string, unknown>[]): void {
  useSessionStore().hydrateHome({ user: { services } } as never)
}

/** A simple-mode WordPress service with one user option: Create goes straight to the options step. */
const ucoService = service({
  onboarding_mode: 'simple',
  onboarding: { installation_type: { wordpress: true }, user_configurable_options: ['region'] },
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.mocked(getServiceInstanceOptions).mockReset()
  vi.mocked(getServiceInstanceOptions).mockResolvedValue({ region: [{ text: 'EU', value: 'eu' }] })
  vi.mocked(createServiceDomain).mockReset()
  vi.mocked(installServiceInstance).mockReset()
  vi.mocked(createImportDomain).mockReset()
  vi.mocked(importInstance).mockReset()
  vi.mocked(retryInstall).mockReset()
  vi.mocked(deployInstance).mockReset()
})

afterEach(() => {
  disarmBackButton()
  vi.useRealTimers()
})

describe('start', () => {
  it('clears the template of the previous flow (legacy resetInstallation)', () => {
    signIn([service({ onboarding: { installation_type: { wordpress: true, git: true } } })])
    const onboarding = useOnboardingStore()
    onboarding.selectedTheme = { id: 1, slug: 'old' } as never

    useOnboardingFlow().start()

    expect(onboarding.selectedTheme).toBeNull()
    expect(onboarding.step).toBe('choose-installation-type')
  })
})

describe('creationTypeSelected', () => {
  it('goes back to WordPress and keeps the after-login source across the next steps', async () => {
    signIn([service({ onboarding: { installation_type: { git: true, wordpress: true } } }), service({ id: 11 })])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    flow.start()
    expect(onboarding.selectedInstallationType).toBe('wordpress')
    onboarding.selectedInstallationType = 'git'

    await flow.creationTypeSelected(0, { source: 'after-login' })

    expect(onboarding.selectedInstallationType).toBe('wordpress')
    expect(onboarding.step).toBe('choose-service')
    expect(onboarding.source).toBe('after-login')
  })
})

describe('installationTypeSelected for WordPress without migrations', () => {
  it('skips the Create vs Import step and goes to the service choice (legacy installationTypeSelected)', async () => {
    signIn([service({ onboarding: { installation_type: { git: true, wordpress: true } } }), service({ id: 11 })])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    flow.start()

    await flow.installationTypeSelected('wordpress')

    expect(onboarding.creationType).toBe(0)
    expect(onboarding.step).toBe('choose-service')
  })
})

describe('the Create path without template and share access', () => {
  it('loads the instance options before it shows the options step (legacy newInstanceSelected)', async () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()

    const pending = useOnboardingFlow().creationTypeSelected(0)
    expect(getServiceInstanceOptions).toHaveBeenCalledWith(10)
    expect(onboarding.step).toBeNull()

    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.instanceOptions).toEqual({ region: [{ text: 'EU', value: 'eu' }] })
    expect(onboarding.step).toBe('user-options')
  })

  it('stays closed when the flow is closed during the load', async () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()

    const pending = useOnboardingFlow().creationTypeSelected(0)
    onboarding.deactivateAll()
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.step).toBeNull()
  })
})

describe('themeSelected', () => {
  it('does not reopen the flow when the back button closed it during the options load', async () => {
    signIn([service({ install_method: 'advanced' })])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    flow.start()
    expect(onboarding.step).toBe('choose-template')

    const pending = flow.themeSelected({ id: 1, slug: 'corporate' } as never)
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.step).toBeNull()
    expect(onboarding.selectedTheme).toBeNull()
  })
})

describe('the install tail after the instance options', () => {
  it('shows the domain step when the service asks for a domain (legacy userConfigurableOptionsSelected)', async () => {
    signIn([service({ onboarding_mode: 'simple', ask_for_domain: true, onboarding: { installation_type: { wordpress: true }, user_configurable_options: ['region'] } })])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    const pending = flow.creationTypeSelected(0)
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending
    flow.userConfigurableOptionsSelected({ region: 'eu' })

    expect(onboarding.selectedUserConfigurableOptions).toEqual({ region: 'eu' })
    expect(onboarding.step).toBe('domain')
  })

  it('runs the install tail: creates the domain with no name, opens the progress and posts the install (legacy createDomain path)', async () => {
    signIn([ucoService])
    vi.mocked(createServiceDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 99 })
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    const pending = flow.creationTypeSelected(0)
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending
    await flow.userConfigurableOptionsSelected({ region: 'eu' })

    expect(createServiceDomain).toHaveBeenCalledWith(10, {
      domain: null,
      name: null,
      delegated_user_email: null,
      user_configurable_options: { region: 'eu' },
    })
    expect(installServiceInstance).toHaveBeenCalledWith(expect.objectContaining({ service_id: 10, domain_id: 5 }))
    // The simple mode opens the super-quick progress.
    expect(onboarding.step).toBe('super-quick-progress')
  })

  it('sends the first invited user as the delegated user of the domain (legacy sharedAccessSet)', async () => {
    signIn([service()])
    vi.mocked(createServiceDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 99 })
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never

    const pending = useOnboardingFlow().sharedAccessSet([{ email: 'anna@shop.pl' }, { email: 'jan@shop.pl' }] as never)
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.delegatedUserEmail).toBe('anna@shop.pl')
    expect(createServiceDomain).toHaveBeenCalledWith(10, expect.objectContaining({ delegated_user_email: 'anna@shop.pl' }))
  })

  it('sends an empty delegated user when nobody was invited (legacy sharedAccessSet)', async () => {
    signIn([service()])
    vi.mocked(createServiceDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 99 })
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never

    const pending = useOnboardingFlow().sharedAccessSet([])
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(createServiceDomain).toHaveBeenCalledWith(10, expect.objectContaining({ delegated_user_email: '' }))
  })

  it('after login, start and the after-login Create post the domain and the install once (impl-review F3)', async () => {
    signIn([service()])
    vi.mocked(createServiceDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 99 })
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    flow.start()
    const pending = flow.creationTypeSelected(0, { source: 'after-login' })
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(createServiceDomain).toHaveBeenCalledTimes(1)
    expect(installServiceInstance).toHaveBeenCalledTimes(1)
    expect(onboarding.source).toBe('after-login')
  })

  it('after-login Create: a failed domain create ends the progress in the failed state (legacy newInstanceSelected, F7)', async () => {
    signIn([service()])
    vi.mocked(createServiceDomain).mockRejectedValue(new Error('boom'))
    const onboarding = useOnboardingStore()

    const pending = useOnboardingFlow().creationTypeSelected(0, { source: 'after-login' })
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    // A service without a mode reads as simple, so the super-quick progress opens.
    expect(onboarding.step).toBe('super-quick-progress')
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
    expect(installServiceInstance).not.toHaveBeenCalled()
  })

  it('after-login past the options: a failed domain create stays on the step, no progress (legacy userConfigurableOptionsSelected, F7)', async () => {
    signIn([ucoService])
    vi.mocked(createServiceDomain).mockRejectedValue(new Error('boom'))
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    const pending = flow.creationTypeSelected(0, { source: 'after-login' })
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending
    await flow.userConfigurableOptionsSelected({ region: 'eu' })

    expect(onboarding.step).toBe('user-options')
    expect(onboarding.installationCompleted).toBe(false)
    expect(installServiceInstance).not.toHaveBeenCalled()
  })

  it('installs nothing when the flow was closed while the domain was created (run guard)', async () => {
    signIn([ucoService])
    let finishCreate: (value: unknown) => void = () => {}
    vi.mocked(createServiceDomain).mockReturnValue(new Promise(resolve => {
      finishCreate = resolve
    }) as never)
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    const pending = flow.creationTypeSelected(0)
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending
    const install = flow.userConfigurableOptionsSelected({ region: 'eu' })
    onboarding.deactivateAll()
    finishCreate({ id: 5, domain: 'shop.pl' })
    await install

    expect(installServiceInstance).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
  })

  it('the site name step creates the domain with the typed name, then installs (legacy siteNameSelected)', async () => {
    signIn([service({ onboarding_mode: 'legacy_quick' })])
    vi.mocked(createServiceDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 99 })
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    onboarding.selectedService = useSessionStore().services[0] as never

    await flow.siteNameSelected('shop')

    expect(onboarding.selectedSiteName).toBe('shop')
    expect(createServiceDomain).toHaveBeenCalledWith(10, expect.objectContaining({ domain: null, name: 'shop' }))
    expect(installServiceInstance).toHaveBeenCalledWith(expect.objectContaining({ name: 'shop' }))
    expect(onboarding.step).toBe('install-progress')
  })

  it('the site name step of the demo account opens the demo progress with no request (legacy siteNameSelected)', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [service({ onboarding_mode: 'legacy_quick' })] } } as never)
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never

    await useOnboardingFlow().siteNameSelected('shop')

    expect(createServiceDomain).not.toHaveBeenCalled()
    expect(installServiceInstance).not.toHaveBeenCalled()
    expect(onboarding.step).toBe('install-progress')
  })

  it('the demo account installs with no request after the options: the progress, then the 3 s result (legacy handleDemoInstallation)', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    const pending = flow.creationTypeSelected(0)
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending
    await flow.userConfigurableOptionsSelected({ region: 'eu' })

    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.installationCompleted).toBe(false)
    expect(createServiceDomain).not.toHaveBeenCalled()
    expect(installServiceInstance).not.toHaveBeenCalled()
  })
})

describe('the demo account (phase 10)', () => {
  it('opens the process choice on autostart, with no type or service step in front of it', () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()

    useOnboardingFlow().startDemoProcess()

    expect(onboarding.step).toBe('choose-onboarding-process')
    expect(onboarding.selectedService?.id).toBe(10)
  })

  it('classic opens the standard form and quick the template chooser (legacy demoOnboardingSelected)', () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    flow.demoOnboardingSelected(true)
    expect(onboarding.step).toBe('standard-form')

    flow.demoOnboardingSelected(false)
    expect(onboarding.step).toBe('choose-template')
  })

  it('completes the demo progress after 3 s with the success alert and no request', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    onboarding.selectedService = ucoService as never
    onboarding.selectedSiteName = 'shop'

    await useOnboardingFlow().userConfigurableOptionsSelected({ region: 'eu' })
    expect(onboarding.installationCompleted).toBe(false)

    await vi.advanceTimersByTimeAsync(3000)

    expect(onboarding.installationCompleted).toBe(true)
    expect(addAlert).toHaveBeenCalledWith({ success: true, successMessage: 'Instance "shop" installed successfully' })
    expect(installServiceInstance).not.toHaveBeenCalled()
  })

  it('names the alert after the domain when the flow has no site name (legacy selectedSiteName ?? selectedDomainName)', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    onboarding.selectedService = ucoService as never
    onboarding.selectedDomainName = 'demo.example.com'

    await useOnboardingFlow().userConfigurableOptionsSelected({ region: 'eu' })
    await vi.advanceTimersByTimeAsync(3000)

    expect(addAlert).toHaveBeenCalledWith({ success: true, successMessage: 'Instance "demo.example.com" installed successfully' })
  })

  it('raises no alert when the flow is closed during the 3 s (run guard)', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    onboarding.selectedService = ucoService as never
    onboarding.selectedSiteName = 'shop'

    await useOnboardingFlow().userConfigurableOptionsSelected({ region: 'eu' })
    onboarding.deactivateAll()
    await vi.advanceTimersByTimeAsync(3000)

    expect(onboarding.installationCompleted).toBe(false)
    expect(addAlert).not.toHaveBeenCalled()
  })

  it('the first-instance event of the demo progress closes the flow (legacy manageSite with isDemo)', () => {
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')

    useOnboardingFlow().manageFirstInstance()

    expect(onboarding.step).toBeNull()
  })
})

describe('installInstanceFromStandardForm (legacy installInstanceFromStandardForm)', () => {
  /** An advanced service that asks for no domain or site name: the form carries both, the sequence goes on to the install. */
  function advancedSignIn (): void {
    signIn([service({ onboarding_mode: 'advanced', install_method: 'advanced' })])
  }

  function standardForm (patch: Partial<StandardFormValues> = {}): StandardFormValues {
    return { ...createStandardForm('owner@shop.pl', 'Abcdef1234'), name: 'shop', domain: 'shop.pl', version: '6.7', ...patch }
  }

  it('creates the domain the form names, then installs with the form values', async () => {
    advancedSignIn()
    vi.mocked(createServiceDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 99 })
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    const form = standardForm()

    await useOnboardingFlow().installInstanceFromStandardForm(form)

    expect(onboarding.selectedDomainName).toBe('shop.pl')
    expect(onboarding.selectedSiteName).toBe('shop')
    expect(onboarding.newInstanceStandardForm).toEqual(form)
    expect(createServiceDomain).toHaveBeenCalledWith(10, expect.objectContaining({ domain: 'shop.pl', name: 'shop' }))
    expect(installServiceInstance).toHaveBeenCalledWith(expect.objectContaining({
      service_id: 10,
      domain_id: 5,
      name: 'shop',
      install_method: 'advanced',
      version: '6.7',
    }))
    expect(onboarding.step).toBe('install-progress')
  })

  it('never installs into a project of the service list: a domain the create refuses stops at the domain step', async () => {
    advancedSignIn()
    vi.mocked(createServiceDomain).mockRejectedValue({ response: { data: { message: 'The domain is already in use.' } } })
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never

    await useOnboardingFlow().installInstanceFromStandardForm(standardForm())

    expect(createServiceDomain).toHaveBeenCalledOnce()
    expect(installServiceInstance).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
  })

  it('does nothing while a request of the flow runs (legacy guard)', async () => {
    advancedSignIn()
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.submitting = true

    await useOnboardingFlow().installInstanceFromStandardForm(standardForm())

    expect(createServiceDomain).not.toHaveBeenCalled()
    expect(installServiceInstance).not.toHaveBeenCalled()
    expect(onboarding.selectedSiteName).toBeNull()
  })
})

describe('importUrlSelected and importMethodSelected (legacy importedInstanceUrlSelected, importMethodSelected)', () => {
  /** The import path on one service: the URL step is open, as after `resolveAfterService`. */
  function importOn (svc: Record<string, unknown>): ReturnType<typeof useOnboardingStore> {
    signIn([svc])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.show('import-url')
    return onboarding
  }

  it('keeps the url and the ip, then goes to share access without loading the options', async () => {
    const onboarding = importOn(service({
      onboarding: { installation_type: { wordpress: true }, user_configurable_options: [], can_select_reseller_user: true },
    }))

    await useOnboardingFlow().importUrlSelected({ url: 'https://shop.pl', ip: '10.0.0.1' })

    expect(onboarding.importUrl).toBe('https://shop.pl')
    expect(onboarding.importIp).toBe('10.0.0.1')
    expect(getServiceInstanceOptions).not.toHaveBeenCalled()
    expect(onboarding.step).toBe('share-access')
  })

  it('loads the instance options, then shows the options step when the service has them', async () => {
    const onboarding = importOn(ucoService)

    const pending = useOnboardingFlow().importUrlSelected({ url: 'https://shop.pl' })
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.importIp).toBeNull()
    expect(getServiceInstanceOptions).toHaveBeenCalledWith(10)
    expect(onboarding.step).toBe('user-options')
  })

  it('goes straight to the method step with no share access and no options', async () => {
    const onboarding = importOn(service())

    const pending = useOnboardingFlow().importUrlSelected({ url: 'https://shop.pl' })
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.step).toBe('import-method')
  })

  it('stays closed when the flow is closed while the options load', async () => {
    const onboarding = importOn(service())

    const pending = useOnboardingFlow().importUrlSelected({ url: 'https://shop.pl' })
    onboarding.deactivateAll()
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.step).toBeNull()
  })

  it('opens the plugin form for plugin and the FTP form for ftp, keeping the method', async () => {
    const onboarding = importOn(service())
    const flow = useOnboardingFlow()

    await flow.importMethodSelected('plugin')
    expect(onboarding.importMethod).toBe('plugin')
    expect(onboarding.step).toBe('import-simple')

    await flow.importMethodSelected('ftp')
    expect(onboarding.importMethod).toBe('ftp')
    expect(onboarding.step).toBe('import-advanced')
  })
})

describe('importInstanceStarted (legacy importInstanceStarted)', () => {
  const importPayload = { id: 99, name: 'shop' }
  const importResponse = { data: importPayload, meta: { nameservers: ['ns1.shop.pl'] } }

  /** A WordPress import on the first active service, with the URL step's data and the form's details. */
  function importReady (): ReturnType<typeof useOnboardingStore> {
    signIn([ucoService])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.importUrl = 'https://shop.pl'
    onboarding.importMethod = 'plugin'
    onboarding.show('import-simple')
    return onboarding
  }

  it('creates the domain, posts the import with the merged payload, then opens the setup-complete result', async () => {
    const onboarding = importReady()
    onboarding.importIp = '10.0.0.1'
    vi.mocked(createImportDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(importInstance).mockResolvedValue(importResponse)

    await useOnboardingFlow().importInstanceStarted({ login_url: 'https://shop.pl/wp-login.php' })

    expect(createImportDomain).toHaveBeenCalledWith(10, 'https://shop.pl', null, {})
    expect(importInstance).toHaveBeenCalledWith({
      url: 'https://shop.pl',
      method: 'plugin',
      ip_address: '10.0.0.1',
      login_url: 'https://shop.pl/wp-login.php',
      service_id: 10,
      domain_id: 5,
      type: 'plugin',
      shared_access: [],
    })
    expect(onboarding.importedInstance).toEqual(importPayload)
    expect(onboarding.nameservers).toEqual(['ns1.shop.pl'])
    expect(onboarding.importPreparationCompleted).toBe(true)
    expect(onboarding.importPreparationError).toBe(false)
    expect(onboarding.importPreparing).toBe(false)
    expect(onboarding.step).toBe('import-setup-complete')
  })

  it('ignores a second submit while the preparation runs (legacy preparingImport guard)', async () => {
    const onboarding = importReady()
    let finishDomain: (value: unknown) => void = () => {}
    vi.mocked(createImportDomain).mockReturnValue(new Promise(resolve => {
      finishDomain = resolve
    }) as never)
    vi.mocked(importInstance).mockResolvedValue(importResponse)
    const flow = useOnboardingFlow()

    const first = flow.importInstanceStarted({})
    expect(onboarding.importPreparing).toBe(true)
    await flow.importInstanceStarted({ second: true })
    expect(onboarding.importDetails).toEqual({})
    finishDomain({ id: 5, domain: 'shop.pl' })
    await first

    expect(createImportDomain).toHaveBeenCalledTimes(1)
    expect(importInstance).toHaveBeenCalledTimes(1)
  })

  it('a domain failure resets the preparation and keeps the form open with the alert (legacy createImportDomain)', async () => {
    const onboarding = importReady()
    vi.mocked(createImportDomain).mockRejectedValue(new Error('boom'))
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

    await useOnboardingFlow().importInstanceStarted({})

    expect(importInstance).not.toHaveBeenCalled()
    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
    expect(onboarding.importPreparing).toBe(false)
    expect(onboarding.importPreparationCompleted).toBe(false)
    expect(onboarding.step).toBe('import-simple')
  })

  it('a failed import request opens the setup-complete result in its error state (legacy importInstance false)', async () => {
    const onboarding = importReady()
    vi.mocked(createImportDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    vi.mocked(importInstance).mockRejectedValue(new Error('boom'))
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

    await useOnboardingFlow().importInstanceStarted({})

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
    expect(onboarding.importPreparationCompleted).toBe(true)
    expect(onboarding.importPreparationError).toBe(true)
    expect(onboarding.importPreparing).toBe(false)
    expect(onboarding.step).toBe('import-setup-complete')
  })

  it('posts no import and opens nothing when the flow closes while the domain is created (run guard)', async () => {
    const onboarding = importReady()
    let finishDomain: (value: unknown) => void = () => {}
    vi.mocked(createImportDomain).mockReturnValue(new Promise(resolve => {
      finishDomain = resolve
    }) as never)
    const pending = useOnboardingFlow().importInstanceStarted({})

    onboarding.deactivateAll()
    finishDomain({ id: 5, domain: 'shop.pl' })
    await pending

    expect(importInstance).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
    expect(onboarding.importPreparing).toBe(false)
  })

  it('posts nothing when the form was closed during its connection test (step guard, not in legacy)', async () => {
    const onboarding = importReady()
    onboarding.deactivateAll()

    await useOnboardingFlow().importInstanceStarted({ login_url: 'https://shop.pl/wp-login.php' })

    expect(createImportDomain).not.toHaveBeenCalled()
    expect(importInstance).not.toHaveBeenCalled()
    expect(onboarding.importDetails).toEqual({})
    expect(onboarding.step).toBeNull()
  })

  it('the demo account gets the sample result after 2 s with no request (legacy handleDemoImport)', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    onboarding.importUrl = 'https://example.com'
    onboarding.show('import-advanced')
    const emitted = vi.fn()
    const unsubscribe = onAppEvent('instance-created', emitted)

    const pending = useOnboardingFlow().importInstanceStarted({})
    await vi.advanceTimersByTimeAsync(2000)
    await pending
    unsubscribe()

    expect(createImportDomain).not.toHaveBeenCalled()
    expect(importInstance).not.toHaveBeenCalled()
    expect(onboarding.importedInstance).toEqual({ url: 'https://example.com' })
    expect(onboarding.nameservers).toHaveLength(3)
    expect(onboarding.step).toBe('import-setup-complete')
    expect(emitted).toHaveBeenCalledWith({ url: 'https://example.com' })
  })

  it('the demo result ends with the exit visible: the completed flag is set before the result opens (phase 7)', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    onboarding.importUrl = 'https://example.com'
    onboarding.show('import-advanced')

    const pending = useOnboardingFlow().importInstanceStarted({})
    await vi.advanceTimersByTimeAsync(2000)
    await pending

    expect(onboarding.step).toBe('import-setup-complete')
    expect(onboarding.importPreparationCompleted).toBe(true)
    expect(onboarding.importPreparationError).toBe(false)
  })

  it('ignores a second demo submit within the 2 s delay (preparing guard, not in legacy)', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    onboarding.importUrl = 'https://example.com'
    onboarding.show('import-advanced')
    const emitted = vi.fn()
    const unsubscribe = onAppEvent('instance-created', emitted)
    const flow = useOnboardingFlow()

    const first = flow.importInstanceStarted({})
    expect(onboarding.importPreparing).toBe(true)
    const second = flow.importInstanceStarted({})
    await vi.advanceTimersByTimeAsync(2000)
    await Promise.all([first, second])
    unsubscribe()

    expect(emitted).toHaveBeenCalledTimes(1)
    expect(onboarding.importPreparing).toBe(false)
    expect(onboarding.step).toBe('import-setup-complete')
  })

  it('the demo reject url posts nothing and opens no result (legacy reject(false))', async () => {
    useSessionStore().hydrateHome({ user: { email: DEMO_EMAIL, services: [ucoService] } } as never)
    const onboarding = useOnboardingStore()
    onboarding.importUrl = 'reject'
    onboarding.show('import-advanced')

    await useOnboardingFlow().importInstanceStarted({})

    expect(onboarding.step).toBe('import-advanced')
    expect(onboarding.importPreparing).toBe(false)
    expect(createImportDomain).not.toHaveBeenCalled()
  })
})

describe('importSetupCompleted (legacy gotoDashboard of an import)', () => {
  it('replaces the route with the instances list and a reload query, then closes the flow', async () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()
    onboarding.show('import-setup-complete')
    router.replace.mockClear()

    await useOnboardingFlow().importSetupCompleted()

    expect(router.replace).toHaveBeenCalledWith({
      name: 'instances',
      query: { page: '2', reload: expect.any(String) },
    })
    expect(onboarding.step).toBeNull()
  })
})

describe('changeServiceButtonClicked and gotoDashboard', () => {
  it('clears the domain of the previous attempt when the service is changed (legacy changeServiceButtonClicked)', () => {
    signIn([service(), service({ id: 11 })])
    const onboarding = useOnboardingStore()
    onboarding.selectedDomainName = 'old.example.com'
    onboarding.newDomain = { id: 5 }

    useOnboardingFlow().changeServiceButtonClicked()

    expect(onboarding.selectedDomainName).toBeNull()
    expect(onboarding.newDomain).toBeNull()
    expect(onboarding.step).toBe('choose-service')
  })

  it('resets the install state when the flow goes to the dashboard (legacy gotoDashboard)', () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()
    onboarding.installationCompleted = true
    onboarding.newInstance = { id: 9 }
    onboarding.selectedDomainName = 'example.com'

    useOnboardingFlow().gotoDashboard()

    expect(onboarding.step).toBeNull()
    expect(onboarding.installationCompleted).toBe(false)
    expect(onboarding.newInstance).toBeNull()
    expect(onboarding.selectedDomainName).toBeNull()
  })
})

describe('tryAgain (legacy progress retryInstallInstance)', () => {
  it('retries the installed instance with its own install details, with no form, and the progress goes back to in-progress', async () => {
    signIn([ucoService])
    vi.mocked(retryInstall).mockResolvedValue({ id: 9 } as never)
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')
    onboarding.installationCompleted = true
    onboarding.installationError = true
    onboarding.newInstance = { id: 9, install_details: { install_method: 'advanced', name: 'shop' } }

    await useOnboardingFlow().tryAgain()

    expect(retryInstall).toHaveBeenCalledWith(9, { install_method: 'advanced', name: 'shop' })
    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.installationCompleted).toBe(false)
    expect(onboarding.installationError).toBe(false)
  })

  it('shows the failed result with an alert when the retry fails', async () => {
    signIn([ucoService])
    vi.mocked(retryInstall).mockRejectedValue(new Error('boom'))
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')
    onboarding.newInstance = { id: 9, install_details: { install_method: 'standard' } }

    await useOnboardingFlow().tryAgain()

    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
    expect(useAlertsStore().activeAlerts).toHaveLength(1)
  })
})

describe('transferDomain (legacy transferDomain)', () => {
  it('posts no second domain while the first create request runs (impl-review F9)', async () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.submitting = true

    await useOnboardingFlow().transferDomain()

    expect(createServiceDomain).not.toHaveBeenCalled()
  })
})

describe('retryInstallInstanceFromForm (legacy retryInstallInstance from the form)', () => {
  it('goes to the dashboard after a successful retry', async () => {
    signIn([ucoService])
    vi.mocked(retryInstall).mockResolvedValue({ id: 9 } as never)
    const onboarding = useOnboardingStore()
    onboarding.show('standard-form')

    await useOnboardingFlow().retryInstallInstanceFromForm(9, { name: 'shop' })

    expect(retryInstall).toHaveBeenCalledWith(9, { name: 'shop' })
    expect(onboarding.step).toBeNull()
  })

  it('leaves a flow started during the request alone (run guard)', async () => {
    signIn([service({ onboarding: { installation_type: { wordpress: true, git: true } } })])
    let finish: (value: unknown) => void = () => {}
    vi.mocked(retryInstall).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }) as never)
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    onboarding.show('standard-form')

    const pending = flow.retryInstallInstanceFromForm(9, { name: 'shop' })
    flow.start()
    finish({ id: 9 })
    await pending

    expect(onboarding.step).toBe('choose-installation-type')
  })
})

describe('gitRepoSelected and envVarsSelected (legacy gitRepoSelected, envVarsSelected, deployFromGit)', () => {
  const repo = 'https://x.test/r.git'
  const plainDeploy = { repo_url: repo, token: null, branches: ['main'], default_branch: 'main', preview: { has_example: false, variables: [] } }
  const exampleDeploy = {
    repo_url: repo,
    token: null,
    branches: ['main', 'dev'],
    default_branch: 'main',
    preview: { has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] },
  }

  /** A git deploy on the deploy-git step, with the service and the domain the tail created. */
  function gitReady (): ReturnType<typeof useOnboardingStore> {
    signIn([service({ onboarding: { installation_type: { wordpress: true, git: true } } })])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.newDomain = { id: 5, domain: 'shop.pl' }
    onboarding.show('deploy-git')
    return onboarding
  }

  it('does nothing while the deploy-git step is not open (step guard)', async () => {
    signIn([service()])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.newDomain = { id: 5, domain: 'shop.pl' }

    await useOnboardingFlow().gitRepoSelected(plainDeploy)

    expect(onboarding.gitDeploy).toBeNull()
    expect(deployInstance).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
  })

  it('deploys at once on the default branch when there is nothing to ask (no env vars)', async () => {
    const onboarding = gitReady()
    let stepAtPost: string | null = null
    vi.mocked(deployInstance).mockImplementation(async () => {
      stepAtPost = onboarding.step
      return { id: 99 }
    })

    await useOnboardingFlow().gitRepoSelected(plainDeploy)

    expect(deployInstance).toHaveBeenCalledWith({
      service_id: 10,
      domain_id: 5,
      shared_access: [],
      source_type: 'git',
      repo_url: repo,
      token: null,
      branch: 'main',
      env_vars: {},
    })
    // The progress opens before the request (then the POST).
    expect(stepAtPost).toBe('install-progress')
    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.newInstance).toEqual({ id: 99 })
    expect(onboarding.gitDeploy).toEqual(plainDeploy)
  })

  it('opens the env vars step with the context when the repo has an example, and posts nothing yet', async () => {
    const onboarding = gitReady()

    await useOnboardingFlow().gitRepoSelected(exampleDeploy)

    expect(onboarding.step).toBe('env-vars')
    expect(onboarding.envVarsContext).toMatchObject({
      source: 'git',
      variables: [{ key: 'DB_HOST', value: 'localhost' }],
      branches: ['main', 'dev'],
      branch: 'main',
      repoUrl: repo,
      previewReady: true,
    })
    expect(deployInstance).not.toHaveBeenCalled()
  })

  it('deploys with the branch and the changed env vars the step hands on', async () => {
    const onboarding = gitReady()
    const flow = useOnboardingFlow()
    await flow.gitRepoSelected(exampleDeploy)

    await flow.envVarsSelected({ branch: 'dev', env_vars: { DB_HOST: 'db.internal' }, skipped: false })

    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({
      source_type: 'git',
      branch: 'dev',
      env_vars: { DB_HOST: 'db.internal' },
    }))
    expect(onboarding.step).toBe('install-progress')
  })

  it('a skip deploys on the default branch with no env vars', async () => {
    gitReady()
    const flow = useOnboardingFlow()
    await flow.gitRepoSelected(exampleDeploy)

    await flow.envVarsSelected({ branch: 'main', env_vars: {}, skipped: true })

    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({ branch: 'main', env_vars: {} }))
  })

  it('a failed deploy shows the failed result with an alert (legacy deployFromGit catch)', async () => {
    const onboarding = gitReady()
    vi.mocked(deployInstance).mockRejectedValue(new Error('boom'))
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

    await useOnboardingFlow().gitRepoSelected(plainDeploy)

    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
    expect(onboarding.newInstance).toBeNull()
    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
  })

  it('envVarsSelected deploys nothing when the env vars step is not open (step guard)', async () => {
    const onboarding = gitReady()
    await useOnboardingFlow().gitRepoSelected(exampleDeploy)
    onboarding.deactivateAll()

    await useOnboardingFlow().envVarsSelected({ branch: 'dev', env_vars: {} })

    expect(deployInstance).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
  })

  it('a flow closed during the deploy keeps the next flow state (run guard)', async () => {
    const onboarding = gitReady()
    let finish: (value: unknown) => void = () => {}
    vi.mocked(deployInstance).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }) as never)

    const pending = useOnboardingFlow().gitRepoSelected(plainDeploy)
    onboarding.deactivateAll()
    finish({ id: 99 })
    await pending

    expect(onboarding.newInstance).toBeNull()
    expect(onboarding.step).toBeNull()
  })
})

describe('SSH deploy-key git (legacy gitRepoSelectedSsh, envVarsSelected, deployFromGitSsh, sshProjectCreated)', () => {
  const repo = 'git@github.com:o/r.git'
  const noExample = { has_example: false, variables: [] }
  const sshDeploy = (patch: Record<string, unknown> = {}) => ({
    mode: 'ssh' as const,
    repo_url: repo,
    token: null,
    branches: ['main'],
    default_branch: 'main',
    preview: noExample,
    branch: 'main',
    branch_missing: false,
    ...patch,
  })

  /** An SSH project created by Generate key, on the deploy-git step, with the service and the domain the tail created. */
  function sshReady (): ReturnType<typeof useOnboardingStore> {
    signIn([service({ onboarding: { installation_type: { wordpress: true, git: true } } })])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.newDomain = { id: 5, domain: 'shop.pl' }
    onboarding.show('deploy-git')
    useOnboardingFlow().sshProjectCreated({ id: 41, name: 'shop' })
    return onboarding
  }

  it('sshProjectCreated keeps the project, shows it as the new instance and announces it (legacy sshProjectCreated)', () => {
    signIn([service()])
    const onboarding = useOnboardingStore()
    const emitted = vi.fn()
    const unsubscribe = onAppEvent('instance-created', emitted)

    useOnboardingFlow().sshProjectCreated({ id: 41, name: 'shop' })
    unsubscribe()

    expect(onboarding.sshProject).toEqual({ id: 41, name: 'shop' })
    expect(onboarding.newInstance).toEqual({ id: 41, name: 'shop' })
    expect(emitted).toHaveBeenCalledWith({ id: 41, name: 'shop' })
  })

  it('deploys at once on the connected branch when there is nothing to ask', async () => {
    const onboarding = sshReady()
    let stepAtPost: string | null = null
    vi.mocked(deployGitSsh).mockImplementation(async () => {
      stepAtPost = onboarding.step
      return { id: 99 }
    })

    await useOnboardingFlow().gitRepoSelected(sshDeploy())

    expect(deployGitSsh).toHaveBeenCalledWith(41, { branch: 'main', env_vars: {} })
    expect(deployInstance).not.toHaveBeenCalled()
    // The progress opens before the request (then the POST).
    expect(stepAtPost).toBe('install-progress')
    expect(onboarding.newInstance).toEqual({ id: 99 })
    expect(onboarding.sshDeployPayload).toEqual({ branch: 'main', env_vars: {} })
  })

  it('opens the env vars step with the SSH context when the repo has several branches', async () => {
    const onboarding = sshReady()

    await useOnboardingFlow().gitRepoSelected(sshDeploy({ branches: ['main', 'dev'] }))

    expect(onboarding.step).toBe('env-vars')
    expect(onboarding.envVarsContext).toMatchObject({
      source: 'git',
      branches: ['main', 'dev'],
      branch: 'main',
      repoUrl: repo,
      token: null,
      sshMode: true,
      branchMissing: false,
      missingBranch: 'main',
      previewReady: true,
    })
    expect(deployGitSsh).not.toHaveBeenCalled()
  })

  it('a missing branch opens the env step with no branch preselected when the remote has several', async () => {
    const onboarding = sshReady()

    await useOnboardingFlow().gitRepoSelected(sshDeploy({ branches: ['trunk', 'dev'], branch: 'main', branch_missing: true }))

    expect(onboarding.step).toBe('env-vars')
    expect(onboarding.envVarsContext).toMatchObject({ sshMode: true, branchMissing: true, missingBranch: 'main', branch: null })
    expect(deployGitSsh).not.toHaveBeenCalled()
  })

  it('a missing branch with exactly one remote branch preselects that branch', async () => {
    const onboarding = sshReady()

    await useOnboardingFlow().gitRepoSelected(sshDeploy({ branches: ['trunk'], branch: 'main', branch_missing: true }))

    expect(onboarding.envVarsContext).toMatchObject({ branchMissing: true, branch: 'trunk' })
  })

  it('envVarsSelected deploys the SSH project with the chosen branch and the changed env vars', async () => {
    const onboarding = sshReady()
    const flow = useOnboardingFlow()
    await flow.gitRepoSelected(sshDeploy({ branches: ['main', 'dev'] }))

    await flow.envVarsSelected({ branch: 'dev', env_vars: { DB_HOST: 'db.internal' }, skipped: false })

    expect(deployGitSsh).toHaveBeenCalledWith(41, { branch: 'dev', env_vars: { DB_HOST: 'db.internal' } })
    expect(deployInstance).not.toHaveBeenCalled()
    expect(onboarding.step).toBe('install-progress')
  })

  it('a failed SSH deploy shows the failed result with an alert', async () => {
    const onboarding = sshReady()
    vi.mocked(deployGitSsh).mockRejectedValue(new Error('boom'))
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

    await useOnboardingFlow().gitRepoSelected(sshDeploy())

    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
  })

  it('deployFromGitSsh posts nothing without a project of the deploy key', async () => {
    signIn([service()])
    const onboarding = useOnboardingStore()

    await useOnboardingFlow().deployFromGitSsh({ branch: 'main', env_vars: {} })

    expect(deployGitSsh).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
  })
})

describe('cancelSshProject (cancel of the deploy key step)', () => {
  beforeEach(() => {
    vi.mocked(deleteDeployKeyProject).mockReset()
  })

  /** The deploy-git step with the project Generate key created and no connect sent yet. */
  function sshKeyStep (): ReturnType<typeof useOnboardingStore> {
    signIn([service({ onboarding: { installation_type: { wordpress: true, git: true } } })])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.newDomain = { id: 5, domain: 'shop.pl' }
    onboarding.show('deploy-git')
    useOnboardingFlow().sshProjectCreated({ id: 41, name: 'shop' })
    return onboarding
  }

  it('removes the project the key step created, closes the flow and tells the list', async () => {
    const onboarding = sshKeyStep()
    const deleted = vi.fn()
    const unsubscribe = onAppEvent('instance-deleted', deleted)
    vi.mocked(deleteDeployKeyProject).mockResolvedValue(undefined)

    await useOnboardingFlow().cancelSshProject()
    unsubscribe()

    expect(deleteDeployKeyProject).toHaveBeenCalledWith(41)
    expect(onboarding.step).toBeNull()
    expect(onboarding.sshProject).toBeNull()
    expect(onboarding.sshClosingOpen).toBe(false)
    expect(deleted).toHaveBeenCalledWith({ id: 41, name: 'shop' })
  })

  it('a project that is already gone counts as removed', async () => {
    const onboarding = sshKeyStep()
    const deleted = vi.fn()
    const unsubscribe = onAppEvent('instance-deleted', deleted)
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    vi.mocked(deleteDeployKeyProject).mockRejectedValue({ response: { status: 404 } })

    await useOnboardingFlow().cancelSshProject()
    unsubscribe()

    expect(addAlert).not.toHaveBeenCalled()
    expect(deleteDeployKeyProject).toHaveBeenCalledTimes(1)
    expect(deleted).toHaveBeenCalledWith({ id: 41, name: 'shop' })
    expect(onboarding.step).toBeNull()
  })

  it('asks the panel once: a busy project is the panel\'s to finish, not the page\'s to retry', async () => {
    const onboarding = sshKeyStep()
    const deleted = vi.fn()
    const unsubscribe = onAppEvent('instance-deleted', deleted)
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    vi.mocked(deleteDeployKeyProject).mockRejectedValue({ response: { status: 409 } })

    const pending = useOnboardingFlow().cancelSshProject()
    await vi.advanceTimersByTimeAsync(120_000)
    await pending
    unsubscribe()

    expect(deleteDeployKeyProject).toHaveBeenCalledTimes(1)
    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
    expect(deleted).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
  })

  it('a failed removal shows its message and keeps the project', async () => {
    const onboarding = sshKeyStep()
    const deleted = vi.fn()
    const unsubscribe = onAppEvent('instance-deleted', deleted)
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    vi.mocked(deleteDeployKeyProject).mockRejectedValue(new Error('boom'))

    await useOnboardingFlow().cancelSshProject()
    unsubscribe()

    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
    expect(deleted).not.toHaveBeenCalled()
    expect(onboarding.sshProject).toBeNull()
  })

  it('with no project the step just closes and nothing is deleted', async () => {
    signIn([service()])
    const onboarding = useOnboardingStore()
    onboarding.show('deploy-git')

    await useOnboardingFlow().cancelSshProject()

    expect(deleteDeployKeyProject).not.toHaveBeenCalled()
    expect(onboarding.step).toBeNull()
  })
})

describe('closing window and SSH progress retry (legacy closeGitModal, closeSshClosing, goToGitTab, progressTryAgain)', () => {
  beforeEach(() => {
    vi.mocked(deployGitSsh).mockReset()
    vi.mocked(deployInstance).mockReset()
    router.push.mockClear()
  })

  /** The deploy-git step with the project Generate key created (the closing window's precondition). */
  function sshProjectOpen (): ReturnType<typeof useOnboardingStore> {
    signIn([service({ onboarding: { installation_type: { wordpress: true, git: true } } })])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.newDomain = { id: 5, domain: 'shop.pl' }
    onboarding.show('deploy-git')
    useOnboardingFlow().sshProjectCreated({ id: 41, name: 'shop' })
    return onboarding
  }

  it('closeGitModal with no project closes the flow and opens no closing window (legacy closeGitModal)', () => {
    signIn([service()])
    const onboarding = useOnboardingStore()
    onboarding.show('deploy-git')

    useOnboardingFlow().closeGitModal()

    expect(onboarding.step).toBeNull()
    expect(onboarding.sshClosingOpen).toBe(false)
  })

  it('closeGitModal with the project of the deploy key closes the flow, keeps the project and opens the closing window', () => {
    const onboarding = sshProjectOpen()

    useOnboardingFlow().closeGitModal()

    expect(onboarding.step).toBeNull()
    expect(onboarding.sshClosingOpen).toBe(true)
    expect(onboarding.sshProject).toEqual({ id: 41, name: 'shop' })
  })

  it('closeSshClosing closes the window and forgets the project (legacy closeSshClosing)', () => {
    const onboarding = sshProjectOpen()
    const flow = useOnboardingFlow()
    flow.closeGitModal()

    flow.closeSshClosing()

    expect(onboarding.sshClosingOpen).toBe(false)
    expect(onboarding.sshProject).toBeNull()
    expect(onboarding.step).toBeNull()
  })

  it('goToGitTab resets the flow and opens the Git tab of the project (legacy goToGitTab)', () => {
    const onboarding = sshProjectOpen()
    const flow = useOnboardingFlow()
    flow.closeGitModal()

    flow.goToGitTab()

    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('41/advanced/git'))
    expect(onboarding.sshClosingOpen).toBe(false)
    expect(onboarding.sshProject).toBeNull()
    expect(onboarding.newInstance).toBeNull()
  })

  it('progressTryAgain replays the SSH deploy with the last payload when the flow holds the project (legacy progressTryAgain)', async () => {
    const onboarding = sshProjectOpen()
    vi.mocked(deployGitSsh).mockResolvedValue({ id: 41 } as never)
    onboarding.sshDeployPayload = { branch: 'main', env_vars: {} }
    onboarding.show('install-progress')
    onboarding.installationCompleted = true
    onboarding.installationError = true

    await useOnboardingFlow().progressTryAgain()

    expect(deployGitSsh).toHaveBeenCalledWith(41, { branch: 'main', env_vars: {} })
    expect(deployInstance).not.toHaveBeenCalled()
    expect(retryInstall).not.toHaveBeenCalled()
    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.installationCompleted).toBe(false)
    expect(onboarding.installationError).toBe(false)
  })

  it('a failed SSH retry shows the failed result with an alert', async () => {
    const onboarding = sshProjectOpen()
    vi.mocked(deployGitSsh).mockRejectedValue(new Error('boom'))
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    onboarding.sshDeployPayload = { branch: 'main', env_vars: {} }
    onboarding.show('install-progress')

    await useOnboardingFlow().progressTryAgain()

    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
  })

  it('progressTryAgain without an SSH project retries the installed instance (legacy retryInstallInstance)', async () => {
    signIn([ucoService])
    vi.mocked(retryInstall).mockResolvedValue({ id: 9 } as never)
    const onboarding = useOnboardingStore()
    onboarding.show('install-progress')
    onboarding.newInstance = { id: 9, install_details: { install_method: 'standard' } }

    await useOnboardingFlow().progressTryAgain()

    expect(retryInstall).toHaveBeenCalledWith(9, { install_method: 'standard' })
    expect(deployGitSsh).not.toHaveBeenCalled()
  })
})

describe('startSync (legacy startInstanceSynchronizationProcess)', () => {
  it('opens the sync progress', () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()

    useOnboardingFlow().startSync()

    expect(onboarding.step).toBe('sync-progress')
  })

  it('a late options load of the start does not overwrite the sync progress', async () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()

    const pending = flow.creationTypeSelected(0)
    flow.startSync()
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(onboarding.step).toBe('sync-progress')
  })

  it('bumps the run so the flow that was open stops on its own loads', () => {
    signIn([ucoService])
    const onboarding = useOnboardingStore()
    const before = onboarding.run

    useOnboardingFlow().startSync()

    expect(onboarding.run).toBeGreaterThan(before)
  })
})

describe('filesSelected and envVarsSelected for files (legacy zip modal next, installFromFilesProcess, finishFilesDeploy)', () => {
  /** A files deploy on the deploy-zip step, with the service the flow picked and (optionally) the domain the flow holds. */
  function filesReady (newDomain: Record<string, unknown> | null = null): ReturnType<typeof useOnboardingStore> {
    signIn([service({ onboarding: { installation_type: { wordpress: true, files: true } } })])
    const onboarding = useOnboardingStore()
    onboarding.selectedService = useSessionStore().services[0] as never
    onboarding.newDomain = newDomain
    onboarding.show('deploy-zip')
    vi.mocked(listServiceDomains).mockResolvedValue([])
    vi.mocked(createFilesDomain).mockResolvedValue({ id: 5, domain: 'shop-site.pl' })
    vi.mocked(uploadDeployFile).mockResolvedValue('remote/shop-site.zip')
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: false, variables: [] })
    vi.mocked(deployInstance).mockResolvedValue({ id: 99 } as never)
    return onboarding
  }

  const archive = (): File => new File(['x'], 'shop-site.zip')

  it('creates the domain from the first file, uploads it, and deploys with the stored path', async () => {
    const onboarding = filesReady()
    const files = [archive()]

    await useOnboardingFlow().filesSelected({ uploadItems: files })

    expect(onboarding.uploadItems).toEqual(files)
    expect(createFilesDomain).toHaveBeenCalledWith(10, 'shop-site.zip')
    expect(uploadDeployFile).toHaveBeenCalledWith(files[0], 'application/zip', { service_id: 10, domain_id: 5, filename: 'shop-site.zip' }, expect.any(AbortSignal))
    expect(previewEnvExample).toHaveBeenCalledWith({ remote_filepath: 'remote/shop-site.zip', service_id: 10, domain_id: 5 })
    expect(deployInstance).toHaveBeenCalledWith({
      service_id: 10,
      domain_id: 5,
      shared_access: [],
      source_type: 'files',
      remote_filepath: ['remote/shop-site.zip'],
      env_vars: {},
    })
    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.newInstance).toEqual({ id: 99 })
  })

  it('takes the domain the flow already holds, with no create request', async () => {
    filesReady({ id: 8, domain: 'held.pl' })

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(createFilesDomain).not.toHaveBeenCalled()
    expect(uploadDeployFile).toHaveBeenCalledWith(expect.any(File), 'application/zip', expect.objectContaining({ domain_id: 8 }), expect.any(AbortSignal))
    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({ domain_id: 8 }))
  })

  it('with an example opens the env vars step with the files context and posts nothing yet', async () => {
    const onboarding = filesReady()
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] })

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(onboarding.step).toBe('env-vars')
    expect(onboarding.envVarsContext).toMatchObject({
      source: 'files',
      variables: [{ key: 'DB_HOST', value: 'localhost' }],
      remoteFilepath: 'remote/shop-site.zip',
      previewReady: true,
    })
    expect(deployInstance).not.toHaveBeenCalled()
  })

  it('the env vars step deploys the stored paths with the env vars it hands on', async () => {
    const onboarding = filesReady()
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] })
    const flow = useOnboardingFlow()
    await flow.filesSelected({ uploadItems: [archive()] })

    await flow.envVarsSelected({ env_vars: { DB_HOST: 'db.internal' }, skipped: false })

    expect(deployInstance).toHaveBeenCalledWith({
      service_id: 10,
      domain_id: 5,
      shared_access: [],
      source_type: 'files',
      remote_filepath: ['remote/shop-site.zip'],
      env_vars: { DB_HOST: 'db.internal' },
    })
    expect(onboarding.step).toBe('install-progress')
  })

  it('envVarsSelected deploys nothing when the env vars step is not open (step guard)', async () => {
    const onboarding = filesReady()
    onboarding.show('install-progress')

    await useOnboardingFlow().envVarsSelected({ env_vars: {} })

    expect(deployInstance).not.toHaveBeenCalled()
  })

  it('keeps nothing and starts nothing when the zip step is not open (step guard)', async () => {
    const onboarding = filesReady()
    onboarding.show('env-vars')

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(onboarding.uploadItems).toEqual([])
    expect(createFilesDomain).not.toHaveBeenCalled()
    expect(uploadDeployFile).not.toHaveBeenCalled()
    expect(onboarding.step).toBe('env-vars')
  })

  it('a failed upload shows the failed result with an alert (legacy catch)', async () => {
    const onboarding = filesReady({ id: 8, domain: 'held.pl' })
    vi.mocked(uploadDeployFile).mockRejectedValue(new Error('too large'))
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.installationCompleted).toBe(true)
    expect(onboarding.installationError).toBe(true)
    expect(deployInstance).not.toHaveBeenCalled()
    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
  })

  it('closing the progress dialog while the archive uploads still deploys the project', async () => {
    // Back to Dashboard during the upload: the flow is closed and reset, and the sequence goes on with the target it read (FX-60).
    const onboarding = filesReady({ id: 8, domain: 'held.pl' })
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    vi.mocked(uploadDeployFile).mockImplementation(async () => {
      onboarding.deactivateAll()
      onboarding.resetInstallation()
      return 'remote/shop-site.zip'
    })

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(deployInstance).toHaveBeenCalledWith({
      service_id: 10,
      domain_id: 8,
      shared_access: [],
      source_type: 'files',
      remote_filepath: ['remote/shop-site.zip'],
      env_vars: {},
    })
    expect(onboarding.step).toBeNull()
    expect(onboarding.newDomain).toBeNull()
    expect(onboarding.remoteFilePaths).toEqual([])
    expect(onboarding.filesArchiveUploadPending).toBe(false)
    expect(onboarding.installationError).toBe(false)
    expect(addAlert).not.toHaveBeenCalled()
  })

  it('the archive stays pending while it uploads and the flow closed, so the page asks before leaving', async () => {
    const onboarding = filesReady({ id: 8, domain: 'held.pl' })
    const pending: boolean[] = []
    vi.mocked(uploadDeployFile).mockImplementation(async () => {
      pending.push(onboarding.filesArchiveUploadPending)
      return 'remote/shop-site.zip'
    })

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(pending).toEqual([true])
    expect(onboarding.filesArchiveUploadPending).toBe(false)
  })

  it('Cancel Deploy during the domain create stops the sequence: no upload and no deploy, the project page says what it waits for', async () => {
    // The domain step is the long one (15-35 s): the user can confirm the cancel while the project is still being created.
    const onboarding = filesReady()
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    const flow = useOnboardingFlow()
    vi.mocked(createFilesDomain).mockImplementation(async () => {
      flow.cancelDeploy()
      return { id: 5, domain: 'shop-site.pl' }
    })

    await flow.filesSelected({ uploadItems: [archive()] })

    expect(uploadDeployFile).not.toHaveBeenCalled()
    expect(deployInstance).not.toHaveBeenCalled()
    expect(addAlert).toHaveBeenCalledWith({ success: true, successMessage: expect.any(String) })
    expect(onboarding.filesArchiveUploadPending).toBe(false)
    // The progress closes on the new project's page, where Upload new version finishes the create.
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('5/general'))
    expect(onboarding.step).toBeNull()
  })

  it('Cancel Deploy from the project itself stops the upload and posts no deploy', async () => {
    // The dialog was closed first: the project list offers Cancel Deploy, which reaches the same sequence (FX-69).
    const onboarding = filesReady({ id: 8, domain: 'held.pl' })
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
    vi.mocked(uploadDeployFile).mockImplementation(async () => {
      onboarding.deactivateAll()
      cancelFilesCreate(8)
      throw Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })
    })

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(deployInstance).not.toHaveBeenCalled()
    expect(onboarding.filesArchiveUploadPending).toBe(false)
    expect(addAlert).toHaveBeenCalledWith({ success: true, successMessage: expect.any(String) })
    // A closed flow stays where the user left it.
    expect(router.push).not.toHaveBeenCalled()
  })

  it('a cancel that names a project while the domain is still being created leaves the sequence running', async () => {
    // Only the progress screen's cancel (no project id) stops an unresolved create: a cancel that names a project is that
    // project's deploy, even when the sequence resolves that project a moment later.
    const onboarding = filesReady()
    vi.mocked(createFilesDomain).mockImplementation(async () => {
      cancelFilesCreate(4)
      cancelFilesCreate(5)
      return { id: 5, domain: 'shop-site.pl' }
    })

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(uploadDeployFile).toHaveBeenCalled()
    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({ domain_id: 5, remote_filepath: ['remote/shop-site.zip'] }))
    expect(onboarding.filesArchiveUploadPending).toBe(false)
  })

  it('a cancel while the Environment variables step is open deploys nothing', async () => {
    const onboarding = filesReady({ id: 8, domain: 'held.pl' })
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] })
    const flow = useOnboardingFlow()
    await flow.filesSelected({ uploadItems: [archive()] })
    expect(onboarding.step).toBe('env-vars')

    cancelFilesCreate(8)
    await flow.envVarsSelected({ env_vars: { DB_HOST: 'db.internal' }, skipped: false })

    expect(deployInstance).not.toHaveBeenCalled()
    expect(onboarding.filesArchiveUploadPending).toBe(false)
  })

  it('a closed flow with an example env file deploys without the env vars step instead of reopening it', async () => {
    const onboarding = filesReady({ id: 8, domain: 'held.pl' })
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] })
    vi.mocked(uploadDeployFile).mockImplementation(async () => {
      onboarding.deactivateAll()
      return 'remote/shop-site.zip'
    })

    await useOnboardingFlow().filesSelected({ uploadItems: [archive()] })

    expect(onboarding.step).toBeNull()
    expect(onboarding.envVarsContext).toBeNull()
    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({ domain_id: 8, env_vars: {}, remote_filepath: ['remote/shop-site.zip'] }))
  })
})

describe('startFromFilesDrop (legacy startInstallationFromFilesDrop, filesDropLaunch.js)', () => {
  const archive = (): File => new File(['x'], 'shop-site.zip')
  const drop = (): { uploadItems: File[] } => ({ uploadItems: [archive()] })

  /** A files service (the files installation type on, WordPress off). */
  function filesService (patch: Record<string, unknown> = {}): Record<string, unknown> {
    return service({ onboarding: { installation_type: { files: true } }, ...patch })
  }

  /** The files sequence with no example file: the domain is created, the file uploads, the deploy goes at once. */
  function filesSequenceMocks (): void {
    vi.mocked(listServiceDomains).mockResolvedValue([])
    vi.mocked(createFilesDomain).mockResolvedValue({ id: 5, domain: 'shop-site.pl' })
    vi.mocked(uploadDeployFile).mockResolvedValue('remote/shop-site.zip')
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: false, variables: [] })
    vi.mocked(deployInstance).mockResolvedValue({ id: 99 } as never)
  }

  beforeEach(() => {
    vi.mocked(listServiceDomains).mockReset()
    vi.mocked(createFilesDomain).mockReset()
    vi.mocked(uploadDeployFile).mockReset()
    vi.mocked(previewEnvExample).mockReset()
  })

  it('shows zero-data when no service is active, and keeps the drop pending', async () => {
    signIn([])
    const onboarding = useOnboardingStore()
    const files = [archive()]

    await useOnboardingFlow().startFromFilesDrop({ uploadItems: files })

    expect(onboarding.step).toBe('zero-data')
    expect(onboarding.filesDropLaunch).toBe(true)
    expect(onboarding.pendingFilesDropPayload).toEqual({ uploadItems: files })
    expect(onboarding.selectedInstallationType).toBe('files')
  })

  it('shows no-type when no active service enables the files installation type', async () => {
    signIn([service()])
    const onboarding = useOnboardingStore()

    await useOnboardingFlow().startFromFilesDrop(drop())

    expect(onboarding.step).toBe('no-type')
    expect(createFilesDomain).not.toHaveBeenCalled()
  })

  it('asks for the service with the files services only (serviceChoices, legacy this.services)', async () => {
    signIn([filesService({ id: 10 }), service({ id: 11 }), filesService({ id: 12 })])
    const onboarding = useOnboardingStore()

    await useOnboardingFlow().startFromFilesDrop(drop())

    expect(onboarding.step).toBe('choose-service')
    expect(onboarding.serviceChoices?.map(item => item.id)).toEqual([10, 12])
    expect(createFilesDomain).not.toHaveBeenCalled()
  })

  it('shows the limit for the one files service when it is full', async () => {
    signIn([filesService({ instance_count: 5 })])
    const onboarding = useOnboardingStore()

    await useOnboardingFlow().startFromFilesDrop(drop())

    expect(onboarding.step).toBe('limit')
    expect(onboarding.selectedService?.id).toBe(10)
  })

  it('starts the files sequence for the one files service with room: no share access, no domain step', async () => {
    signIn([filesService()])
    filesSequenceMocks()
    const onboarding = useOnboardingStore()
    const files = [archive()]

    await useOnboardingFlow().startFromFilesDrop({ uploadItems: files })

    expect(onboarding.selectedService?.id).toBe(10)
    expect(createFilesDomain).toHaveBeenCalledWith(10, 'shop-site.zip')
    expect(uploadDeployFile).toHaveBeenCalledWith(files[0], 'application/zip', { service_id: 10, domain_id: 5, filename: 'shop-site.zip' }, expect.any(AbortSignal))
    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({ service_id: 10, domain_id: 5, source_type: 'files', remote_filepath: ['remote/shop-site.zip'] }))
    expect(onboarding.step).toBe('install-progress')
  })

  it('runs the reseller drop with no share access step either', async () => {
    useSessionStore().hydrateHome({ user: { reseller_settings: {}, services: [filesService()] } } as never)
    filesSequenceMocks()
    const onboarding = useOnboardingStore()

    await useOnboardingFlow().startFromFilesDrop(drop())

    expect(onboarding.step).toBe('install-progress')
    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({ source_type: 'files' }))
  })

  it('ignores a drop while a flow is open (legacy isAnyOpen)', async () => {
    signIn([filesService()])
    const onboarding = useOnboardingStore()
    onboarding.show('choose-installation-type')
    const run = onboarding.run

    await useOnboardingFlow().startFromFilesDrop(drop())

    expect(onboarding.step).toBe('choose-installation-type')
    expect(onboarding.filesDropLaunch).toBe(false)
    expect(onboarding.run).toBe(run)
    expect(createFilesDomain).not.toHaveBeenCalled()
  })

  it('ignores a second drop while the first one is pending (legacy filesDropLaunch guard)', async () => {
    signIn([filesService({ id: 10 }), filesService({ id: 12 })])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    const first = [archive()]

    await flow.startFromFilesDrop({ uploadItems: first })
    await flow.startFromFilesDrop({ uploadItems: [new File(['y'], 'other.zip')] })

    expect(onboarding.pendingFilesDropPayload).toEqual({ uploadItems: first })
    expect(onboarding.serviceChoices?.map(item => item.id)).toEqual([10, 12])
  })

  it('ignores a drop while the files sequence of an earlier drop is pending, even with no step open', async () => {
    signIn([filesService()])
    const onboarding = useOnboardingStore()
    onboarding.filesDropLaunch = true
    const run = onboarding.run

    await useOnboardingFlow().startFromFilesDrop(drop())

    expect(onboarding.step).toBeNull()
    expect(onboarding.run).toBe(run)
    expect(createFilesDomain).not.toHaveBeenCalled()
  })

  it('ignores an empty drop', async () => {
    signIn([filesService()])
    const onboarding = useOnboardingStore()

    await useOnboardingFlow().startFromFilesDrop({ uploadItems: [] })

    expect(onboarding.step).toBeNull()
    expect(onboarding.filesDropLaunch).toBe(false)
    expect(onboarding.pendingFilesDropPayload).toBeNull()
  })

  it('resets the previous flow first, then sets the drop state and the files type (legacy order)', async () => {
    signIn([filesService({ instance_count: 5 })])
    const onboarding = useOnboardingStore()
    onboarding.selectedInstallationType = 'git'
    onboarding.creationType = 1
    onboarding.newDomain = { id: 8, domain: 'held.pl' }
    onboarding.selectedDomainName = 'held.pl'
    const run = onboarding.run

    await useOnboardingFlow().startFromFilesDrop(drop())

    expect(onboarding.run).toBe(run + 1)
    expect(onboarding.newDomain).toBeNull()
    expect(onboarding.selectedDomainName).toBeNull()
    expect(onboarding.creationType).toBeNull()
    expect(onboarding.selectedInstallationType).toBe('files')
    expect(onboarding.filesDropLaunch).toBe(true)
    expect(onboarding.pendingFilesDropPayload).not.toBeNull()
  })

  it('arms the back button: Back closes the drop and clears its state', async () => {
    signIn([filesService({ instance_count: 5 })])
    const onboarding = useOnboardingStore()

    await useOnboardingFlow().startFromFilesDrop(drop())
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(onboarding.step).toBeNull()
    expect(onboarding.filesDropLaunch).toBe(false)
    expect(onboarding.pendingFilesDropPayload).toBeNull()
  })
})

describe('serviceSelected during a files drop (legacy serviceSelected, filesDropLaunch branch)', () => {
  const archive = (): File => new File(['x'], 'shop-site.zip')

  function filesService (patch: Record<string, unknown> = {}): Record<string, unknown> {
    return service({ onboarding: { installation_type: { files: true } }, ...patch })
  }

  /** Two files services and a drop pending on the service choice. */
  async function choosingService (services: Record<string, unknown>[]): Promise<ReturnType<typeof useOnboardingStore>> {
    signIn(services)
    const onboarding = useOnboardingStore()
    await useOnboardingFlow().startFromFilesDrop({ uploadItems: [archive()] })
    return onboarding
  }

  beforeEach(() => {
    vi.mocked(listServiceDomains).mockReset()
    vi.mocked(createFilesDomain).mockReset()
    vi.mocked(uploadDeployFile).mockReset()
    vi.mocked(previewEnvExample).mockReset()
    vi.mocked(listServiceDomains).mockResolvedValue([])
    vi.mocked(createFilesDomain).mockResolvedValue({ id: 5, domain: 'shop-site.pl' })
    vi.mocked(uploadDeployFile).mockResolvedValue('remote/shop-site.zip')
    vi.mocked(previewEnvExample).mockResolvedValue({ has_example: false, variables: [] })
    vi.mocked(deployInstance).mockResolvedValue({ id: 99 } as never)
  })

  it('takes the chosen files service straight to the files sequence', async () => {
    const onboarding = await choosingService([filesService({ id: 10 }), filesService({ id: 11 })])
    const chosen = useSessionStore().services[1] as never

    await useOnboardingFlow().serviceSelected(chosen)

    expect(onboarding.selectedService?.id).toBe(11)
    expect(createFilesDomain).toHaveBeenCalledWith(11, 'shop-site.zip')
    expect(deployInstance).toHaveBeenCalledWith(expect.objectContaining({ service_id: 11, source_type: 'files' }))
    expect(onboarding.step).toBe('install-progress')
  })

  it('skips the share access step for a reseller: the chosen service goes straight to the sequence', async () => {
    useSessionStore().hydrateHome({ user: { reseller_settings: {}, services: [filesService({ id: 10 }), filesService({ id: 11 })] } } as never)
    const onboarding = useOnboardingStore()
    await useOnboardingFlow().startFromFilesDrop({ uploadItems: [archive()] })

    await useOnboardingFlow().serviceSelected(useSessionStore().services[0] as never)

    expect(onboarding.step).toBe('install-progress')
    expect(createFilesDomain).toHaveBeenCalledWith(10, 'shop-site.zip')
  })

  it('shows the limit for a full service before anything else', async () => {
    const onboarding = await choosingService([filesService({ id: 10 }), filesService({ id: 11, instance_count: 5 })])

    await useOnboardingFlow().serviceSelected(useSessionStore().services[1] as never)

    expect(onboarding.step).toBe('limit')
    expect(createFilesDomain).not.toHaveBeenCalled()
  })

  it('shows no-type for a service without the files installation type', async () => {
    const onboarding = await choosingService([filesService({ id: 10 }), filesService({ id: 11 })])

    await useOnboardingFlow().serviceSelected(service({ id: 12 }) as never)

    expect(onboarding.step).toBe('no-type')
    expect(createFilesDomain).not.toHaveBeenCalled()
    expect(deployInstance).not.toHaveBeenCalled()
  })

  it('keeps the share access and domain steps for the normal installation path (no drop)', async () => {
    signIn([service({ id: 10, onboarding: { installation_type: { git: true, wordpress: true } } }), service({ id: 11 })])
    const onboarding = useOnboardingStore()
    onboarding.selectedInstallationType = 'git'
    onboarding.show('choose-service')

    await useOnboardingFlow().serviceSelected(useSessionStore().services[0] as never)

    expect(onboarding.filesDropLaunch).toBe(false)
    expect(onboarding.step).toBe('domain')
  })
})

describe('the PanelAlpha Go source', () => {
  const goService = service({ onboarding: { installation_type: { wordpress: true, git: true, go: true }, user_configurable_options: [] } })

  function signInFree (services: Record<string, unknown>[]): void {
    useSessionStore().hydrateHome({ app: { community_panel: true }, user: { services } } as never)
  }

  const memos = {
    slug: 'memos',
    name: 'Memos',
    install: { source: 'git', git_repo: 'https://github.com/usememos/memos', git_branch: null, template: 'dind', memory_mb: 2048, disk_mb: 20_480 },
  }

  it('offers Go only on the Community panel', () => {
    signIn([service({ onboarding: { installation_type: { wordpress: true, go: true } } })])
    const onboarding = useOnboardingStore()
    useOnboardingFlow().start()
    // A paid panel has no Go catalog: WordPress is the only type, so the flow goes on without the choice.
    expect(onboarding.step).not.toBe('choose-installation-type')

    setActivePinia(createPinia())
    signInFree([service({ onboarding: { installation_type: { wordpress: true, go: true } } })])
    useOnboardingFlow().start()
    expect(useOnboardingStore().step).toBe('choose-installation-type')
  })

  it('opens the catalog after the type choice, with no domain step', async () => {
    signInFree([goService])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    flow.start()

    await flow.installationTypeSelected('go')

    expect(onboarding.step).toBe('go-catalog')
  })

  it('deploys the app through the git onboarding with the repository Go answered', async () => {
    signInFree([goService])
    vi.mocked(deployInstance).mockResolvedValue({ id: 77, name: 'memos' })
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    flow.start()
    await flow.installationTypeSelected('go')

    await flow.deployFromGo(memos)

    expect(deployInstance).toHaveBeenCalledWith({
      service_id: 10,
      domain_id: undefined,
      shared_access: [],
      source_type: 'git',
      repo_url: 'https://github.com/usememos/memos',
      token: null,
      branch: null,
      env_vars: {},
    })
    expect(onboarding.step).toBe('install-progress')
    expect(onboarding.newInstance).toEqual({ id: 77, name: 'memos' })
  })

  it('deploys nothing without an install recipe or once the catalog is closed', async () => {
    signInFree([goService])
    const flow = useOnboardingFlow()
    flow.start()
    await flow.installationTypeSelected('go')

    await flow.deployFromGo({ slug: 'memos', name: 'Memos', install: null })
    useOnboardingStore().deactivateAll()
    await flow.deployFromGo(memos)

    expect(deployInstance).not.toHaveBeenCalled()
  })

  it('goes back to the type choice, and sends "Connect to PanelAlpha Hub" to Settings', async () => {
    signInFree([goService])
    const onboarding = useOnboardingStore()
    const flow = useOnboardingFlow()
    flow.start()
    await flow.installationTypeSelected('go')

    flow.goCatalogBack()
    expect(onboarding.step).toBe('choose-installation-type')

    await flow.installationTypeSelected('go')
    router.push.mockClear()
    flow.goConnectHub()
    expect(onboarding.step).toBeNull()
    expect(router.push).toHaveBeenCalledWith({ name: 'settings' })
  })
})
