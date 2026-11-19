import type { DomainSequenceDeps, InstallDeps } from './install-sequence'
import type { OnboardingService } from './onboarding-service'
import { describe, expect, it, vi } from 'vitest'
import { installProgressStep, isCustomDeployType, runAfterDomain, runAfterSiteName, runAfterTransfer, runAfterVerification, startInstall } from './install-sequence'

function service (patch: Record<string, unknown> = {}): OnboardingService {
  return { id: 10, status: 'active', onboarding_mode: 'simple', ...patch } as unknown as OnboardingService
}

/** A service that allows the transfer and the eager DNS check. */
function transferService (patch: Record<string, unknown> = {}): OnboardingService {
  return service({
    onboarding: { server_allow_domain_transfer: true, eager_domain_dns_verification_enabled: true, domain_transfer_enabled: true },
    ...patch,
  })
}

/** Deps that stay in the same run, verify the domain as free and create it; each test overrides what it checks. */
function deps (patch: Partial<DomainSequenceDeps> = {}): DomainSequenceDeps {
  return {
    checkDomainAvailability: vi.fn(async () => ({ verification_allowed: true, verification_required: false })),
    createDomain: vi.fn(async () => true),
    showTransfer: vi.fn(),
    checkDnsPropagation: vi.fn(async () => true),
    show: vi.fn(),
    install: vi.fn(async () => {}),
    demo: vi.fn(async () => {}),
    inRun: () => true,
    ...patch,
  }
}

const base = {
  service: service(),
  installationType: 'wordpress' as const,
  isDemo: false,
}

describe('runAfterDomain', () => {
  it('creates the domain, then installs when the service asks for no site name', async () => {
    const d = deps()
    await runAfterDomain(d, base)
    expect(d.createDomain).toHaveBeenCalledOnce()
    expect(d.install).toHaveBeenCalledOnce()
    expect(d.show).not.toHaveBeenCalled()
  })

  it('shows the site name step when the service asks for one', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, service: service({ ask_for_site_name: true }) })
    expect(d.show).toHaveBeenCalledWith('site-name')
    expect(d.install).not.toHaveBeenCalled()
  })

  it('stays on the domain step when the create request fails', async () => {
    const d = deps({ createDomain: vi.fn(async () => false) })
    await runAfterDomain(d, base)
    expect(d.install).not.toHaveBeenCalled()
    expect(d.show).not.toHaveBeenCalled()
  })

  it('stops after the create request when the flow was closed or restarted meanwhile', async () => {
    const d = deps({ createDomain: vi.fn(async () => true), inRun: () => false })
    await runAfterDomain(d, base)
    expect(d.install).not.toHaveBeenCalled()
    expect(d.show).not.toHaveBeenCalled()
  })

  it('opens the deploy steps for git and files installations', async () => {
    const git = deps()
    await runAfterDomain(git, { ...base, installationType: 'git' })
    expect(git.show).toHaveBeenCalledWith('deploy-git')

    const files = deps()
    await runAfterDomain(files, { ...base, installationType: 'files' })
    expect(files.show).toHaveBeenCalledWith('deploy-zip')
  })

  it('runs the demo instead of the install for the demo account', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, isDemo: true })
    expect(d.demo).toHaveBeenCalledOnce()
    expect(d.install).not.toHaveBeenCalled()
  })

  it('does not check the domain when the server does not allow transfers', async () => {
    const d = deps()
    await runAfterDomain(d, base)
    expect(d.checkDomainAvailability).not.toHaveBeenCalled()
    expect(d.checkDnsPropagation).not.toHaveBeenCalled()
  })

  it('a failed verify request stays on the domain step, with nothing created', async () => {
    const d = deps({ checkDomainAvailability: vi.fn(async () => null) })
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.createDomain).not.toHaveBeenCalled()
    expect(d.showTransfer).not.toHaveBeenCalled()
    expect(d.show).not.toHaveBeenCalled()
    expect(d.install).not.toHaveBeenCalled()
  })

  it('a verification still required opens the transfer step with the record and creates nothing', async () => {
    const record = { type: 'TXT', name: '_verify.shop.pl', content: 'abc' }
    const d = deps({
      checkDomainAvailability: vi.fn(async () => ({ verification_required: true, verification_record: record })),
    })
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.showTransfer).toHaveBeenCalledWith(record)
    expect(d.createDomain).not.toHaveBeenCalled()
    expect(d.install).not.toHaveBeenCalled()
  })

  it('stops after the verify request when the flow was closed meanwhile', async () => {
    const d = deps({
      checkDomainAvailability: vi.fn(async () => ({ verification_required: true, verification_record: {} })),
      inRun: () => false,
    })
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.showTransfer).not.toHaveBeenCalled()
  })

  it('a verified domain goes on to create the domain', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.checkDomainAvailability).toHaveBeenCalledOnce()
    expect(d.createDomain).toHaveBeenCalledOnce()
  })

  it('a domain that does not resolve yet opens the DNS step and installs nothing', async () => {
    const d = deps({ checkDnsPropagation: vi.fn(async () => false) })
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.show).toHaveBeenCalledWith('dns-verify')
    expect(d.install).not.toHaveBeenCalled()
  })

  it('a resolving domain goes on to the install after the DNS check', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.checkDnsPropagation).toHaveBeenCalledOnce()
    expect(d.install).toHaveBeenCalledOnce()
  })

  it('skips the DNS check without the eager verification flag', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, service: transferService({ onboarding: { server_allow_domain_transfer: true } }) })
    expect(d.checkDnsPropagation).not.toHaveBeenCalled()
    expect(d.install).toHaveBeenCalledOnce()
  })

  it('stops after the DNS check when the flow was closed meanwhile', async () => {
    let open = true
    const d = deps({
      checkDnsPropagation: vi.fn(async () => {
        open = false
        return false
      }),
      inRun: () => open,
    })
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.show).not.toHaveBeenCalled()
    expect(d.install).not.toHaveBeenCalled()
  })

  it('on a transfer server checks the verify first, then creates the domain', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, service: transferService() })
    expect(d.checkDomainAvailability).toHaveBeenCalledOnce()
    expect(d.createDomain).toHaveBeenCalledOnce()
    expect(d.install).toHaveBeenCalledOnce()
  })
})

describe('runAfterDomain from the standard form (legacy installInstanceFromStandardForm)', () => {
  it('installs without the site name step: the form already holds the name', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, service: service({ ask_for_site_name: true }), fromStandardForm: true })
    expect(d.show).not.toHaveBeenCalled()
    expect(d.install).toHaveBeenCalledOnce()
  })

  it('runs the demo without the site name step for the demo account', async () => {
    const d = deps()
    await runAfterDomain(d, { ...base, service: service({ ask_for_site_name: true }), isDemo: true, fromStandardForm: true })
    expect(d.show).not.toHaveBeenCalled()
    expect(d.demo).toHaveBeenCalledOnce()
  })

  it('still opens the DNS step when the domain does not resolve yet', async () => {
    const d = deps({ checkDnsPropagation: vi.fn(async () => false) })
    await runAfterDomain(d, { ...base, service: transferService({ ask_for_site_name: true }), fromStandardForm: true })
    expect(d.show).toHaveBeenCalledWith('dns-verify')
    expect(d.install).not.toHaveBeenCalled()
  })
})

describe('runAfterTransfer', () => {
  it('creates the domain after the transfer step, then installs', async () => {
    const d = deps()
    await runAfterTransfer(d, { ...base, service: transferService() })
    expect(d.createDomain).toHaveBeenCalledOnce()
    expect(d.checkDomainAvailability).not.toHaveBeenCalled()
    expect(d.install).toHaveBeenCalledOnce()
  })

  it('a failed create keeps the transfer step closed without an install', async () => {
    const d = deps({ createDomain: vi.fn(async () => false) })
    await runAfterTransfer(d, { ...base, service: transferService() })
    expect(d.install).not.toHaveBeenCalled()
    expect(d.show).not.toHaveBeenCalled()
  })

  it('runs the DNS check after the create, and opens the DNS step when it fails', async () => {
    const d = deps({ checkDnsPropagation: vi.fn(async () => false) })
    await runAfterTransfer(d, { ...base, service: transferService() })
    expect(d.checkDnsPropagation).toHaveBeenCalledOnce()
    expect(d.show).toHaveBeenCalledWith('dns-verify')
    expect(d.install).not.toHaveBeenCalled()
  })

  it('stops after the create when the flow was restarted meanwhile', async () => {
    const d = deps({ inRun: () => false })
    await runAfterTransfer(d, { ...base, service: transferService() })
    expect(d.checkDnsPropagation).not.toHaveBeenCalled()
    expect(d.install).not.toHaveBeenCalled()
  })
})

describe('runAfterVerification', () => {
  it('goes straight to the install after the DNS step (Skip counts as done)', async () => {
    const d = deps()
    await runAfterVerification(d, base)
    expect(d.createDomain).not.toHaveBeenCalled()
    expect(d.checkDnsPropagation).not.toHaveBeenCalled()
    expect(d.install).toHaveBeenCalledOnce()
  })

  it('opens the site name step when the service asks for one', async () => {
    const d = deps()
    await runAfterVerification(d, { ...base, service: service({ ask_for_site_name: true }) })
    expect(d.show).toHaveBeenCalledWith('site-name')
    expect(d.install).not.toHaveBeenCalled()
  })

  it('opens the deploy step for git after the DNS step', async () => {
    const d = deps()
    await runAfterVerification(d, { ...base, installationType: 'git' })
    expect(d.show).toHaveBeenCalledWith('deploy-git')
    expect(d.install).not.toHaveBeenCalled()
  })
})

/** Install deps that stay in the same run; each test overrides what it checks. */
function installDeps (patch: Partial<InstallDeps> = {}): InstallDeps {
  return {
    createDomain: vi.fn(async () => true),
    show: vi.fn(),
    installInstance: vi.fn(async () => {}),
    failInstallation: vi.fn(),
    demo: vi.fn(async () => {}),
    inRun: () => true,
    ...patch,
  }
}

const installBase = {
  service: service({ onboarding_mode: 'legacy_quick' }),
  hasDomain: false,
  afterLogin: false,
  isDemo: false,
}

describe('installProgressStep', () => {
  it('opens the super-quick progress for the simple mode', () => {
    expect(installProgressStep(service({ onboarding_mode: 'simple' }))).toBe('super-quick-progress')
  })

  it('opens the standard progress for the other modes', () => {
    expect(installProgressStep(service({ onboarding_mode: 'legacy_quick' }))).toBe('install-progress')
    expect(installProgressStep(service({ onboarding_mode: 'advanced' }))).toBe('install-progress')
  })

  it('a custom deploy opens the standard progress also for the simple mode', () => {
    expect(installProgressStep(service({ onboarding_mode: 'simple' }), true)).toBe('install-progress')
    expect(installProgressStep(service({ onboarding_mode: 'legacy_quick' }), true)).toBe('install-progress')
  })

  it('without the custom deploy flag the simple mode keeps the super-quick progress', () => {
    expect(installProgressStep(service({ onboarding_mode: 'simple' }), false)).toBe('super-quick-progress')
  })
})

describe('isCustomDeployType', () => {
  it('is true for the git, files and Go installation types only', () => {
    expect(isCustomDeployType('git')).toBe(true)
    expect(isCustomDeployType('files')).toBe(true)
    expect(isCustomDeployType('wordpress')).toBe(false)
    // A PanelAlpha Go app deploys from its repository.
    expect(isCustomDeployType('go')).toBe(true)
    expect(isCustomDeployType(null)).toBe(false)
  })
})

describe('startInstall', () => {
  it('creates the domain when the flow has none, then opens the progress, then installs', async () => {
    const order: string[] = []
    const d = installDeps({
      createDomain: vi.fn(async () => {
        order.push('create')
        return true
      }),
      show: vi.fn(() => order.push('show')),
      installInstance: vi.fn(async () => {
        order.push('install')
      }),
    })

    await startInstall(d, installBase)

    expect(order).toEqual(['create', 'show', 'install'])
    expect(d.show).toHaveBeenCalledWith('install-progress')
  })

  it('skips the create request when the flow already has a domain', async () => {
    const d = installDeps()

    await startInstall(d, { ...installBase, hasDomain: true })

    expect(d.createDomain).not.toHaveBeenCalled()
    expect(d.show).toHaveBeenCalledWith('install-progress')
    expect(d.installInstance).toHaveBeenCalledOnce()
  })

  it('opens the super-quick progress for the simple mode', async () => {
    const d = installDeps()

    await startInstall(d, { ...installBase, service: service({ onboarding_mode: 'simple' }), hasDomain: true })

    expect(d.show).toHaveBeenCalledWith('super-quick-progress')
  })

  it('a custom deploy of the simple mode opens the standard progress, then installs', async () => {
    const d = installDeps()

    await startInstall(d, { ...installBase, service: service({ onboarding_mode: 'simple' }), hasDomain: true, customDeploy: true })

    expect(d.show).toHaveBeenCalledWith('install-progress')
    expect(d.show).not.toHaveBeenCalledWith('super-quick-progress')
    expect(d.installInstance).toHaveBeenCalledOnce()
  })

  it('stays before the progress when the create request fails', async () => {
    const d = installDeps({ createDomain: vi.fn(async () => false) })

    await startInstall(d, installBase)

    expect(d.show).not.toHaveBeenCalled()
    expect(d.installInstance).not.toHaveBeenCalled()
  })

  it('installs nothing when the flow was closed during the create request', async () => {
    const d = installDeps({ inRun: () => false })

    await startInstall(d, installBase)

    expect(d.show).not.toHaveBeenCalled()
    expect(d.installInstance).not.toHaveBeenCalled()
  })

  it('after-login opens the progress before the create request', async () => {
    const order: string[] = []
    const d = installDeps({
      createDomain: vi.fn(async () => {
        order.push('create')
        return true
      }),
      show: vi.fn(() => order.push('show')),
      installInstance: vi.fn(async () => {
        order.push('install')
      }),
    })

    await startInstall(d, { ...installBase, afterLogin: true })

    expect(order).toEqual(['show', 'create', 'install'])
  })

  it('after-login: a failed create ends the progress in the failed state and installs nothing', async () => {
    const d = installDeps({ createDomain: vi.fn(async () => false) })

    await startInstall(d, { ...installBase, afterLogin: true })

    expect(d.show).toHaveBeenCalledWith('install-progress')
    expect(d.failInstallation).toHaveBeenCalledOnce()
    expect(d.installInstance).not.toHaveBeenCalled()
  })

  it('after-login: a create that finishes after the flow closed neither fails nor installs', async () => {
    const d = installDeps({ createDomain: vi.fn(async () => false), inRun: () => false })

    await startInstall(d, { ...installBase, afterLogin: true })

    expect(d.failInstallation).not.toHaveBeenCalled()
    expect(d.installInstance).not.toHaveBeenCalled()
  })

  it('after-login with a domain opens the progress and installs without a create', async () => {
    const d = installDeps()

    await startInstall(d, { ...installBase, afterLogin: true, hasDomain: true })

    expect(d.createDomain).not.toHaveBeenCalled()
    expect(d.installInstance).toHaveBeenCalledOnce()
    expect(d.failInstallation).not.toHaveBeenCalled()
  })
})

describe('runAfterSiteName', () => {
  it('creates the domain when the flow has none, then the progress and the install', async () => {
    const d = installDeps()

    await runAfterSiteName(d, installBase)

    expect(d.createDomain).toHaveBeenCalledOnce()
    expect(d.show).toHaveBeenCalledWith('install-progress')
    expect(d.installInstance).toHaveBeenCalledOnce()
  })

  it('does not create a second domain when the flow already has one', async () => {
    const d = installDeps()

    await runAfterSiteName(d, { ...installBase, hasDomain: true })

    expect(d.createDomain).not.toHaveBeenCalled()
    expect(d.installInstance).toHaveBeenCalledOnce()
  })

  it('a failed create keeps the site name step and installs nothing', async () => {
    const d = installDeps({ createDomain: vi.fn(async () => false) })

    await runAfterSiteName(d, installBase)

    expect(d.show).not.toHaveBeenCalled()
    expect(d.installInstance).not.toHaveBeenCalled()
  })

  it('the demo account runs the demo instead of the create and the install', async () => {
    const d = installDeps()

    await runAfterSiteName(d, { ...installBase, isDemo: true })

    expect(d.demo).toHaveBeenCalledOnce()
    expect(d.createDomain).not.toHaveBeenCalled()
    expect(d.installInstance).not.toHaveBeenCalled()
  })

  it('has no after-login branch of its own (legacy siteNameSelected): a failed create does not fail the progress', async () => {
    const d = installDeps({ createDomain: vi.fn(async () => false) })

    await runAfterSiteName(d, { ...installBase, afterLogin: true })

    expect(d.failInstallation).not.toHaveBeenCalled()
    expect(d.show).not.toHaveBeenCalled()
  })
})
