import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyDomain } from '@/entities/domain/domain-verification.api'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { getServiceInstanceOptions, retryInstall } from '@/entities/project/instance-actions.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit } from '@/shared/events/app-events'
import { createServiceDomain, deployGitSsh, installServiceInstance } from './onboarding.api'
import { INSTANCE_OPTIONS_HOLD_MS, useOnboardingStore } from './onboarding.store'

vi.mock('@/entities/project/instance-actions.api', () => ({
  getServiceInstanceOptions: vi.fn(),
  retryInstall: vi.fn(),
}))

vi.mock('./onboarding.api', () => ({
  createServiceDomain: vi.fn(),
  deployGitSsh: vi.fn(),
  installServiceInstance: vi.fn(),
}))

vi.mock('@/shared/events/app-events', () => ({
  emit: vi.fn(),
}))

vi.mock('@/entities/domain/domain-verification.api', () => ({
  verifyDomain: vi.fn(),
}))

vi.mock('@/entities/domain/verify-domain-resolving', () => ({
  verifyDomainResolving: vi.fn(),
}))

describe('installInstance', () => {
  beforeEach(() => {
    vi.mocked(installServiceInstance).mockReset()
    vi.mocked(emit).mockReset()
    localStorage.clear()
  })

  function filledStore () {
    const store = useOnboardingStore()
    store.selectedService = { id: 7, install_method: 'quick' } as never
    store.newDomain = { id: 5, domain: 'shop.pl' }
    store.selectedSiteName = 'shop'
    store.selectedTheme = { id: 1, slug: 'corporate' } as never
    store.sharedAccess = [{ email: 'a@example.com' }] as never
    return store
  }

  it('posts the legacy payload, emits instance-created and keeps the new instance', async () => {
    const instance = { id: 99, domain: 'shop.pl' }
    vi.mocked(installServiceInstance).mockResolvedValue(instance)
    const store = filledStore()

    await store.installInstance()

    expect(installServiceInstance).toHaveBeenCalledWith({
      service_id: 7,
      domain_id: 5,
      install_method: 'quick',
      name: 'shop',
      theme: 'corporate',
      shared_access: ['a@example.com'],
    })
    expect(emit).toHaveBeenCalledWith('instance-created', instance)
    expect(store.newInstance).toEqual(instance)
  })

  it('still emits instance-created but keeps no instance when the flow restarted during the request (run guard)', async () => {
    const instance = { id: 99, domain: 'shop.pl' }
    let finish: (value: unknown) => void = () => {}
    vi.mocked(installServiceInstance).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }) as never)
    const store = filledStore()

    const pending = store.installInstance()
    store.deactivateAll()
    finish(instance)
    await pending

    expect(emit).toHaveBeenCalledWith('instance-created', instance)
    expect(store.newInstance).toBeNull()
  })

  it('lets the standard form fields win over the base fields (legacy spread order)', async () => {
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 1 })
    const store = filledStore()
    store.newInstanceStandardForm = { install_method: 'advanced', name: 'form-name', admin_email: 'admin@example.com' }

    await store.installInstance()

    expect(installServiceInstance).toHaveBeenCalledWith(expect.objectContaining({
      install_method: 'advanced',
      name: 'form-name',
      admin_email: 'admin@example.com',
    }))
  })

  it('sends the trimmed site description and removes it from storage after the request', async () => {
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 1 })
    localStorage.setItem(`${window.location.origin}-new-site-description`, '  Blog o kawie  ')

    await filledStore().installInstance()

    expect(installServiceInstance).toHaveBeenCalledWith(expect.objectContaining({ site_description: 'Blog o kawie' }))
    expect(localStorage.getItem(`${window.location.origin}-new-site-description`)).toBeNull()
  })

  it('omits the site description and keeps the storage entry when the stored value is blank', async () => {
    vi.mocked(installServiceInstance).mockResolvedValue({ id: 1 })
    localStorage.setItem(`${window.location.origin}-new-site-description`, ' '.repeat(3))
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')

    await filledStore().installInstance()

    expect(installServiceInstance).toHaveBeenCalledWith(expect.not.objectContaining({ site_description: expect.anything() }))
    expect(removeItem).not.toHaveBeenCalled()
    removeItem.mockRestore()
  })

  it('a refused install is the progress failure: no instance, no event, the storage entry stays', async () => {
    vi.mocked(installServiceInstance).mockRejectedValue(new Error('quota'))
    localStorage.setItem(`${window.location.origin}-new-site-description`, 'kept')
    const store = filledStore()

    await expect(store.installInstance()).resolves.toBeUndefined()

    expect(store.newInstance).toBeNull()
    expect(store.installationCompleted).toBe(true)
    expect(store.installationError).toBe(true)
    expect(emit).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts).toHaveLength(1)
    expect(localStorage.getItem(`${window.location.origin}-new-site-description`)).toBe('kept')
  })

  it('keeps the progress of the next flow clean when the flow restarted during the request (run guard)', async () => {
    let fail: (error: unknown) => void = () => {}
    vi.mocked(installServiceInstance).mockReturnValue(new Promise((_resolve, reject) => {
      fail = reject
    }) as never)
    const store = filledStore()

    const pending = store.installInstance()
    store.deactivateAll()
    fail(new Error('quota'))
    await pending

    expect(store.installationCompleted).toBe(false)
    expect(store.installationError).toBe(false)
    expect(useAlertsStore().activeAlerts).toHaveLength(1)
  })
})

describe('createDomain', () => {
  it('posts the legacy body, stores the created domain and clears the overlay', async () => {
    vi.mocked(createServiceDomain).mockResolvedValue({ id: 5, domain: 'shop.pl' })
    const store = useOnboardingStore()
    store.selectedService = { id: 7 } as never
    store.selectedDomainName = 'shop.pl'
    store.selectedUserConfigurableOptions = { region: 'eu' }

    await expect(store.createDomain()).resolves.toBe(true)

    expect(createServiceDomain).toHaveBeenCalledWith(7, {
      domain: 'shop.pl',
      name: null,
      delegated_user_email: null,
      user_configurable_options: { region: 'eu' },
    })
    expect(store.newDomain).toEqual({ id: 5, domain: 'shop.pl' })
    expect(store.submitting).toBe(false)
    expect(store.loadingText).toBeNull()
  })

  it('a failed request resolves false, alerts, and keeps the domain empty', async () => {
    vi.mocked(createServiceDomain).mockRejectedValue(new Error('taken'))
    const store = useOnboardingStore()
    store.selectedService = { id: 7 } as never

    await expect(store.createDomain()).resolves.toBe(false)

    expect(store.newDomain).toBeNull()
    expect(store.submitting).toBe(false)
    expect(useAlertsStore().activeAlerts).toHaveLength(1)
  })
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.mocked(getServiceInstanceOptions).mockReset()
})

describe('loadInstanceOptions', () => {
  it('shows the preparing overlay while the request runs and holds it for the fixed time after the answer', async () => {
    const options = { region: [{ text: 'EU', value: 'eu' }] }
    vi.mocked(getServiceInstanceOptions).mockResolvedValue(options)
    const store = useOnboardingStore()

    const pending = store.loadInstanceOptions(10)
    expect(store.submitting).toBe(true)
    expect(store.loadingText).toBe('button.onboarding.preparing-installation')

    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(getServiceInstanceOptions).toHaveBeenCalledWith(10)
    expect(store.instanceOptions).toEqual(options)
    expect(store.submitting).toBe(false)
    expect(store.loadingText).toBeNull()
  })

  it('turns a failure into an alert and still releases the overlay', async () => {
    vi.mocked(getServiceInstanceOptions).mockRejectedValue(new Error('boom'))
    const store = useOnboardingStore()
    const alerts = useAlertsStore()

    const pending = store.loadInstanceOptions(10)
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await expect(pending).resolves.toBeUndefined()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0].success).toBe(false)
    expect(store.instanceOptions).toBeNull()
    expect(store.submitting).toBe(false)
  })
})

describe('loadInstanceOptions normalization', () => {
  it('treats an array answer as no options (LITE getInstanceOptions)', async () => {
    vi.mocked(getServiceInstanceOptions).mockResolvedValue([] as never)
    const store = useOnboardingStore()

    const pending = store.loadInstanceOptions(10)
    await vi.advanceTimersByTimeAsync(INSTANCE_OPTIONS_HOLD_MS)
    await pending

    expect(store.instanceOptions).toEqual({})
  })
})

describe('resetInstallation', () => {
  it('clears what the previous flow left and goes back to WordPress (legacy resetInstallation)', () => {
    const store = useOnboardingStore()
    store.selectedTheme = { id: 1, name: 'Old' } as never
    store.selectedService = { id: 10 } as never
    store.sharedAccess = [{ email: 'a@example.com' }] as never
    store.selectedUserConfigurableOptions = { region: 'eu' }
    store.source = 'after-login'
    store.selectedInstallationType = 'git'

    store.resetInstallation()

    expect(store.selectedTheme).toBeNull()
    expect(store.selectedService).toBeNull()
    expect(store.sharedAccess).toEqual([])
    expect(store.selectedUserConfigurableOptions).toEqual({})
    expect(store.source).toBe('start')
    expect(store.selectedInstallationType).toBe('wordpress')
  })

  it('clears the install state of the previous flow (legacy resetInstallation, LITE 1879-1898)', () => {
    const store = useOnboardingStore()
    store.installationCompleted = true
    store.installationError = true
    store.newInstance = { id: 7 }
    store.dnsMismatch = true
    store.selectedDomainName = 'example.com'
    store.selectedSiteName = 'site'
    store.delegatedUserEmail = 'reseller@example.com'
    store.newDomain = { id: 3 }
    store.domainTransferDnsRecord = { name: '_acme' }
    store.newInstanceStandardForm = { admin_email: 'a@example.com' }

    store.resetInstallation()

    expect(store.installationCompleted).toBe(false)
    expect(store.installationError).toBe(false)
    expect(store.newInstance).toBeNull()
    expect(store.dnsMismatch).toBe(false)
    expect(store.selectedDomainName).toBeNull()
    expect(store.selectedSiteName).toBeNull()
    expect(store.delegatedUserEmail).toBeNull()
    expect(store.newDomain).toBeNull()
    expect(store.domainTransferDnsRecord).toEqual({})
    expect(store.newInstanceStandardForm).toEqual({})
  })

  it('keeps the loading flag, the retry target and the start button, as legacy does', () => {
    const store = useOnboardingStore()
    store.loading = true
    store.retryInstanceId = 12
    store.showStartCreatingButton = true

    store.resetInstallation()

    expect(store.loading).toBe(true)
    expect(store.retryInstanceId).toBe(12)
    expect(store.showStartCreatingButton).toBe(true)
  })

  it('keeps the source across steps until the next reset', () => {
    const store = useOnboardingStore()
    store.source = 'after-login'

    store.show('choose-service')
    store.show('choose-template')

    expect(store.source).toBe('after-login')
  })
})

describe('deploy state (phase 1 fields)', () => {
  function filled () {
    const store = useOnboardingStore()
    store.gitDeploy = {
      repo_url: 'https://git.example.com/a.git',
      token: 't',
      branches: ['main'],
      default_branch: 'main',
      preview: { has_example: false, variables: [] },
    }
    store.envVarsContext = { source: 'git', variables: [{ key: 'DB_HOST', value: 'x' }], hasExample: true, branches: ['main'], branch: 'main' }
    store.uploadItems = [new File(['x'], 'site.zip')]
    store.remoteFilePaths = ['/uploads/site.zip']
    store.filesDropLaunch = true
    store.pendingFilesDropPayload = { uploadItems: [new File(['x'], 'site.zip')] }
    store.serviceChoices = [{ id: 3 } as never]
    return store
  }

  it('starts with no deploy state', () => {
    const store = useOnboardingStore()

    expect(store.gitDeploy).toBeNull()
    expect(store.envVarsContext).toBeNull()
    expect(store.uploadItems).toEqual([])
    expect(store.remoteFilePaths).toEqual([])
    expect(store.filesDropLaunch).toBe(false)
    expect(store.pendingFilesDropPayload).toBeNull()
    expect(store.serviceChoices).toBeNull()
  })

  it('resetInstallation returns every deploy field to its start value', () => {
    const store = filled()

    store.resetInstallation()

    expect(store.gitDeploy).toBeNull()
    expect(store.envVarsContext).toBeNull()
    expect(store.uploadItems).toEqual([])
    expect(store.remoteFilePaths).toEqual([])
    expect(store.filesDropLaunch).toBe(false)
    expect(store.pendingFilesDropPayload).toBeNull()
    expect(store.serviceChoices).toBeNull()
  })

  it('deactivateAll clears the files drop launch and its pending payload', () => {
    const store = filled()

    store.deactivateAll()

    expect(store.filesDropLaunch).toBe(false)
    expect(store.pendingFilesDropPayload).toBeNull()
  })

  it('deactivateAll clears the git token and env context, and keeps the other deploy fields', () => {
    const store = filled()

    store.deactivateAll()

    expect(store.gitDeploy).toBeNull()
    expect(store.envVarsContext).toBeNull()
    expect(store.uploadItems).toHaveLength(1)
    expect(store.remoteFilePaths).toEqual(['/uploads/site.zip'])
    expect(store.serviceChoices).toHaveLength(1)
  })
})

describe('SSH deploy state (legacy sshProject, sshDeployPayload, deployFromGitSsh)', () => {
  beforeEach(() => {
    vi.mocked(deployGitSsh).mockReset()
  })

  it('starts with no SSH project, payload or closing window', () => {
    const store = useOnboardingStore()

    expect(store.sshProject).toBeNull()
    expect(store.sshDeployPayload).toBeNull()
    expect(store.sshClosingOpen).toBe(false)
  })

  it('resetInstallation clears the SSH project, its payload and the closing window', () => {
    const store = useOnboardingStore()
    store.sshProject = { id: 41 }
    store.sshDeployPayload = { branch: 'main', env_vars: {} }
    store.sshClosingOpen = true

    store.resetInstallation()

    expect(store.sshProject).toBeNull()
    expect(store.sshDeployPayload).toBeNull()
    expect(store.sshClosingOpen).toBe(false)
  })

  it('deactivateAll keeps the SSH project for the closing window (legacy closeGitModal)', () => {
    const store = useOnboardingStore()
    store.sshProject = { id: 41 }

    store.deactivateAll()

    expect(store.sshProject).toEqual({ id: 41 })
  })

  it('deploySshInstanceRequest keeps the instance and does not announce it again', async () => {
    const store = useOnboardingStore()
    vi.mocked(deployGitSsh).mockResolvedValue({ id: 99 })

    await store.deploySshInstanceRequest(41, { branch: 'main', env_vars: {} })

    expect(deployGitSsh).toHaveBeenCalledWith(41, { branch: 'main', env_vars: {} })
    expect(store.newInstance).toEqual({ id: 99 })
    expect(emit).not.toHaveBeenCalled()
  })

  it('a failed deploySshInstanceRequest shows the failed result with an alert', async () => {
    const store = useOnboardingStore()
    vi.mocked(deployGitSsh).mockRejectedValue(new Error('boom'))
    const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

    await store.deploySshInstanceRequest(41, { branch: 'main', env_vars: {} })

    expect(store.installationCompleted).toBe(true)
    expect(store.installationError).toBe(true)
    expect(store.newInstance).toBeNull()
    expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: expect.any(String) })
  })

  it('a flow closed during the SSH deploy keeps the next flow state (run guard)', async () => {
    const store = useOnboardingStore()
    let finish: (value: unknown) => void = () => {}
    vi.mocked(deployGitSsh).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }) as never)

    const pending = store.deploySshInstanceRequest(41, { branch: 'main', env_vars: {} })
    store.run++
    finish({ id: 99 })
    await pending

    expect(store.newInstance).toBeNull()
  })
})

describe('checkDomainAvailability', () => {
  it('returns the verify answer under the checking overlay and releases it', async () => {
    vi.mocked(verifyDomain).mockResolvedValue({ verification_required: true, verification_record: { name: 'x' } })
    const store = useOnboardingStore()
    store.selectedService = { id: 7 } as never
    store.selectedDomainName = 'shop.pl'

    const pending = store.checkDomainAvailability()
    expect(store.loading).toBe(true)
    expect(store.loadingText).toBe('button.onboarding.check-domain-availability')

    await expect(pending).resolves.toEqual({ verification_required: true, verification_record: { name: 'x' } })
    expect(verifyDomain).toHaveBeenCalledWith(7, 'shop.pl')
    expect(store.loading).toBe(false)
    expect(store.loadingText).toBeNull()
  })

  it('a failed request alerts, resolves null and releases the overlay', async () => {
    vi.mocked(verifyDomain).mockRejectedValue(new Error('invalid'))
    const store = useOnboardingStore()
    store.selectedService = { id: 7 } as never
    store.selectedDomainName = 'shop.pl'

    await expect(store.checkDomainAvailability()).resolves.toBeNull()

    expect(useAlertsStore().activeAlerts).toHaveLength(1)
    expect(store.loading).toBe(false)
  })
})

describe('checkDnsPropagation', () => {
  it('checks the picked domain against the service hosting data and releases the flag', async () => {
    vi.mocked(verifyDomainResolving).mockResolvedValue(false)
    const store = useOnboardingStore()
    store.selectedService = {
      id: 7,
      dns_server: { enabled: true, nameservers: ['ns1.host.pl'] },
      hosting_server: { ip_v4_addresses: ['192.0.2.1'] },
      hosting_accounts: [{ host_c_names: ['a.host.pl'] }],
      onboarding: { dns_settings: { verification_methods: ['resolve_a_record'] }, eager_domain_dns_verification_enabled: true },
    } as never
    store.selectedDomainName = 'shop.pl'

    await expect(store.checkDnsPropagation()).resolves.toBe(false)

    expect(verifyDomainResolving).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'shop.pl',
      ipv4Addresses: ['192.0.2.1'],
      nameservers: ['ns1.host.pl'],
      hostCNames: ['a.host.pl'],
      eagerDnsVerification: true,
    }))
    expect(store.loading).toBe(false)
  })
})

describe('retryInstallInstance', () => {
  beforeEach(() => {
    vi.mocked(retryInstall).mockReset()
    vi.mocked(emit).mockReset()
  })

  it('puts the form to retry-install, emits the changed instance and reports success', async () => {
    const changed = { id: 12, install_details: { install_method: 'advanced' } }
    vi.mocked(retryInstall).mockResolvedValue(changed)
    const store = useOnboardingStore()
    const form = { name: 'shop', install_method: 'advanced' }

    await expect(store.retryInstallInstance(12, form)).resolves.toBe(true)

    expect(retryInstall).toHaveBeenCalledExactlyOnceWith(12, form)
    expect(emit).toHaveBeenCalledExactlyOnceWith('instance-item-changed', changed)
    expect(store.submitting).toBe(false)
  })

  it('runs under the submitting flag while the request is in flight', async () => {
    let release: (value: Record<string, unknown>) => void = () => undefined
    vi.mocked(retryInstall).mockReturnValue(new Promise(resolve => {
      release = resolve
    }))
    const store = useOnboardingStore()

    const pending = store.retryInstallInstance(12, {})
    expect(store.submitting).toBe(true)
    release({ id: 12 })
    await pending
    expect(store.submitting).toBe(false)
  })

  it('a failed request alerts, sets the failed result and reports false', async () => {
    vi.mocked(retryInstall).mockRejectedValue(new Error('down'))
    const store = useOnboardingStore()

    await expect(store.retryInstallInstance(12, {})).resolves.toBe(false)

    expect(store.installationCompleted).toBe(true)
    expect(store.installationError).toBe(true)
    expect(emit).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts).toHaveLength(1)
    expect(store.submitting).toBe(false)
  })

  it('sends no request without an instance id (Note 5)', async () => {
    const store = useOnboardingStore()

    await expect(store.retryInstallInstance(null, {})).resolves.toBe(false)
    await expect(store.retryInstallInstance(undefined, {})).resolves.toBe(false)

    expect(retryInstall).not.toHaveBeenCalled()
    expect(store.installationError).toBe(false)
  })

  it('a second retry while one runs sends nothing (legacy submitting guard)', async () => {
    vi.mocked(retryInstall).mockReturnValue(new Promise(() => undefined))
    const store = useOnboardingStore()

    void store.retryInstallInstance(12, {})
    await expect(store.retryInstallInstance(12, {})).resolves.toBe(false)

    expect(retryInstall).toHaveBeenCalledOnce()
  })

  it('closing the flow clears the retry form state, but keeps the retry target', () => {
    const store = useOnboardingStore()
    store.retryWithForm = true
    store.retryInstanceId = 12
    store.standardFormPrefill = { values: { name: 'shop' }, tab: 0, subdirectoryOpen: false, installMethod: 'advanced' }

    store.deactivateAll()

    expect(store.retryWithForm).toBe(false)
    expect(store.standardFormPrefill).toBeNull()
    expect(store.retryInstanceId).toBe(12)
  })
})
