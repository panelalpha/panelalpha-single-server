import type { OnboardingService } from './onboarding-service'
import { describe, expect, it } from 'vitest'
import {
  hasUserConfigurableOptions,
  importStepCount,
  resolveAfterImportUrl,
  resolveAfterService,
  resolveAfterServiceChoice,
  resolveAfterShare,
  resolveAfterTheme,
  resolveAfterUserOptions,
  resolveCreationType,
  resolveFilesDropNextStep,
  resolveFilesDropService,
  resolveImportMethod,
  resolveInstallationTypeSelected,
  resolveInstallTail,
  resolveStart,
  serviceActionLabelKey,
  shareAccessActionLabelKey,
  userOptionsActionLabelKey,
} from './onboarding-steps'

function service (patch: Partial<OnboardingService> = {}): OnboardingService {
  return {
    id: 1,
    status: 'active',
    instance_count: 0,
    instance_limit: 5,
    onboarding: { installation_type: { wordpress: true } },
    ...patch,
  }
}

describe('resolveStart', () => {
  it('shows ZeroData when there is no active service', () => {
    expect(resolveStart([])).toBe('zero-data')
    expect(resolveStart([service({ status: 'expired' })])).toBe('zero-data')
  })

  it('shows NoInstallationType when the active services enable no type', () => {
    expect(resolveStart([service({ onboarding: { installation_type: {} } })])).toBe('no-type')
  })

  it('shows the installation type choice when more than one type is enabled', () => {
    const services = [service({ onboarding: { installation_type: { wordpress: true, git: true } } })]

    expect(resolveStart(services)).toBe('choose-installation-type')
  })

  it('skips the choice when the only other type is PanelAlpha Go, which is hidden', () => {
    const services = [service({ onboarding: { installation_type: { wordpress: true, go: true } } })]

    expect(resolveStart(services)).toBe('installation-type-selected')
  })

  it('offers the choice with the PanelAlpha Go source when the panel reads the Go catalog', () => {
    const services = [service({ onboarding: { installation_type: { wordpress: true, go: true } } })]

    expect(resolveStart(services, { go: true })).toBe('choose-installation-type')
  })

  it('goes on to the installation type transition when exactly one type is enabled', () => {
    expect(resolveStart([service()])).toBe('installation-type-selected')
  })

  it('ignores enabled types of inactive services', () => {
    const services = [
      service({ status: 'expired', onboarding: { installation_type: { git: true, go: true } } }),
      service({ id: 2, onboarding: { installation_type: { wordpress: true } } }),
    ]

    expect(resolveStart(services)).toBe('installation-type-selected')
  })
})

describe('resolveInstallationTypeSelected', () => {
  const input = (services: OnboardingService[], isReseller = false) => ({ services, isReseller })

  it('offers Create vs Import for WordPress when the service can migrate', () => {
    const services = [service({ onboarding: { installation_type: { wordpress: true, migrations: true } } })]

    expect(resolveInstallationTypeSelected(input(services), 'wordpress')).toBe('choose-creation-type')
  })

  it('goes on to Create without the choice when WordPress cannot migrate', () => {
    expect(resolveInstallationTypeSelected(input([service()]), 'wordpress')).toBe('install')
    expect(resolveInstallationTypeSelected(input([service({ ask_for_domain: true })]), 'wordpress')).toBe('domain')
  })

  it('asks for the service first when there are several services', () => {
    const services = [service(), service({ id: 2 })]

    expect(resolveInstallationTypeSelected(input(services), 'git')).toBe('choose-service')
  })

  it('shows Limit when the only service is full', () => {
    expect(resolveInstallationTypeSelected(input([service({ instance_count: 5 })]), 'git')).toBe('limit')
  })

  it('shows share access for a reseller before the deploy steps', () => {
    expect(resolveInstallationTypeSelected(input([service()], true), 'files')).toBe('share-access')
  })

  it('hands git and zip to their deploy steps (a single service, no share access)', () => {
    expect(resolveInstallationTypeSelected(input([service()]), 'git')).toBe('deploy-git')
    expect(resolveInstallationTypeSelected(input([service()]), 'files')).toBe('deploy-zip')
  })
})

describe('resolveCreationType', () => {
  const input = (services: OnboardingService[]) => ({ services, isReseller: false })

  it('sends Import to the import URL step when one service has room', () => {
    expect(resolveCreationType(input([service()]), 1)).toBe('import-url')
  })

  it('asks for the service on Import when there are several', () => {
    expect(resolveCreationType(input([service(), service({ id: 2 })]), 1)).toBe('choose-service')
  })

  it('opens the process choice on Create for the demo account, before the service choice (legacy newInstanceSelected)', () => {
    const demo = (services: OnboardingService[]) => ({ services, isReseller: false, isDemo: true })
    expect(resolveCreationType(demo([service(), service({ id: 2 })]), 0)).toBe('choose-onboarding-process')
    expect(resolveInstallationTypeSelected(demo([service()]), 'wordpress')).toBe('choose-onboarding-process')
    expect(resolveCreationType(demo([service()]), 1)).toBe('import-url')
  })

  it('shows Limit on Create when the service is full', () => {
    expect(resolveCreationType(input([service({ instance_count: 5 })]), 0)).toBe('limit')
  })
})

describe('resolveAfterServiceChoice (several services: the service modal\'s choice, LITE 1163-1170)', () => {
  const input = (isReseller = false) => ({ services: [service(), service({ id: 2 })], isReseller })

  it('shows Limit for a full service on an installation path', () => {
    const full = service({ instance_count: 5 })

    expect(resolveAfterServiceChoice(input(), full, { kind: 'installation', type: 'git' })).toBe('limit')
    expect(resolveAfterServiceChoice(input(), full, { kind: 'installation', type: 'files' })).toBe('limit')
  })

  it('goes to share access for git and zip when the user can share, else to the domain step', () => {
    expect(resolveAfterServiceChoice(input(true), service(), { kind: 'installation', type: 'git' })).toBe('share-access')
    expect(resolveAfterServiceChoice(input(true), service(), { kind: 'installation', type: 'files' })).toBe('share-access')
    expect(resolveAfterServiceChoice(input(), service(), { kind: 'installation', type: 'git' })).toBe('domain')
    expect(resolveAfterServiceChoice(input(), service(), { kind: 'installation', type: 'files' })).toBe('domain')
  })

  it('keeps the other paths as resolveAfterService: WordPress installation, Create and Import', () => {
    expect(resolveAfterServiceChoice(input(), service(), { kind: 'installation', type: 'wordpress' })).toBe('domain')
    expect(resolveAfterServiceChoice(input(), service(), { kind: 'import' })).toBe('import-url')
    expect(resolveAfterServiceChoice(input(), service({ onboarding_mode: 'advanced' }), { kind: 'create' })).toBe('choose-template')
  })
})

describe('resolveFilesDropNextStep (legacy filesDropLaunch.js)', () => {
  const files = (patch: Partial<OnboardingService> = {}) => service({
    onboarding: { installation_type: { files: true } },
    ...patch,
  })

  it('shows zero-data when no service is active', () => {
    expect(resolveFilesDropNextStep([])).toEqual({ step: 'zero-data', services: [] })
    expect(resolveFilesDropNextStep([files({ status: 'expired' })])).toEqual({ step: 'zero-data', services: [] })
  })

  it('shows no-type when no active service enables the files installation type', () => {
    expect(resolveFilesDropNextStep([service({ onboarding: { installation_type: { git: true } } })])).toEqual({ step: 'no-type', services: [] })
    expect(resolveFilesDropNextStep([service({ onboarding: { installation_type: { git: true } } }), files({ status: 'expired' })])).toEqual({ step: 'no-type', services: [] })
  })

  it('asks for the service when several active services enable the files type, with only those services', () => {
    const second = files({ id: 2 })
    const result = resolveFilesDropNextStep([files(), service({ id: 3 }), second])

    expect(result.step).toBe('choose-service')
    expect(result.services.map(item => item.id)).toEqual([1, 2])
  })

  it('shows limit for the one files service when it is full', () => {
    const result = resolveFilesDropNextStep([files({ instance_count: 5 }), service({ id: 3 })])

    expect(result).toEqual({ step: 'limit', services: [expect.objectContaining({ id: 1 })] })
  })

  it('starts the deploy-files sequence for the one files service with room', () => {
    const result = resolveFilesDropNextStep([service({ id: 3 }), files()])

    expect(result).toEqual({ step: 'deploy-files', services: [expect.objectContaining({ id: 1 })] })
  })
})

describe('resolveFilesDropService (legacy serviceSelected during a files drop, LITE 1149-1160)', () => {
  it('shows limit for a full service before the installation type check', () => {
    expect(resolveFilesDropService(service({ instance_count: 5, onboarding: { installation_type: { git: true } } }))).toBe('limit')
  })

  it('shows no-type for a service without the files installation type', () => {
    expect(resolveFilesDropService(service({ onboarding: { installation_type: { wordpress: true, git: true } } }))).toBe('no-type')
  })

  it('starts the files sequence for a service with the files type and room', () => {
    expect(resolveFilesDropService(service({ onboarding: { installation_type: { files: true } } }))).toBe('deploy-files')
  })
})

describe('resolveAfterService', () => {
  const input = { services: [service()], isReseller: false }

  it('shows Limit for a full service on every path', () => {
    const full = service({ instance_count: 5 })

    expect(resolveAfterService(input, full, { kind: 'create' })).toBe('limit')
    expect(resolveAfterService(input, full, { kind: 'import' })).toBe('limit')
    expect(resolveAfterService(input, full, { kind: 'installation', type: 'files' })).toBe('limit')
  })

  it('goes to the import URL step on the Import path', () => {
    expect(resolveAfterService(input, service(), { kind: 'import' })).toBe('import-url')
  })

  it('goes to the deploy step of the chosen installation type', () => {
    expect(resolveAfterService(input, service(), { kind: 'installation', type: 'git' })).toBe('deploy-git')
  })

  it('opens the Go catalog for the PanelAlpha Go source, after the limit and the share access', () => {
    expect(resolveAfterService(input, service(), { kind: 'installation', type: 'go' })).toBe('go-catalog')
    expect(resolveAfterService(input, service({ instance_count: 5 }), { kind: 'installation', type: 'go' })).toBe('limit')
    expect(resolveAfterService({ ...input, isReseller: true }, service(), { kind: 'installation', type: 'go' })).toBe('share-access')
  })

  it('opens the Go catalog after the service choice, with no domain step', () => {
    const go = { kind: 'installation', type: 'go' } as const

    expect(resolveAfterServiceChoice(input, service(), go)).toBe('go-catalog')
    expect(resolveAfterServiceChoice(input, service({ instance_count: 5 }), go)).toBe('limit')
    expect(resolveAfterServiceChoice({ ...input, isReseller: true }, service(), go)).toBe('share-access')
    expect(resolveAfterServiceChoice(input, service(), { kind: 'installation', type: 'git' })).toBe('domain')
  })

  it('offers the template step on the Create path only when the mode allows themes', () => {
    expect(resolveAfterService(input, service({ onboarding_mode: 'advanced' }), { kind: 'create' })).toBe('choose-template')
    expect(resolveAfterService(input, service({ onboarding_mode: 'simple' }), { kind: 'create' })).toBe('install')
  })

  it('goes from the template to the options step when the service has user options', () => {
    const withOptions = service({ onboarding: { installation_type: { wordpress: true }, user_configurable_options: [{ name: 'region' }] } })

    expect(resolveAfterTheme({ services: [withOptions], isReseller: false }, withOptions)).toBe('user-options')
  })
})

describe('serviceActionLabelKey', () => {
  it('names the primary button after the next step (import continues, non-WordPress sets the domain)', () => {
    expect(serviceActionLabelKey({ kind: 'import' }, 'import-url', service())).toBe('button.continue')
    expect(serviceActionLabelKey({ kind: 'installation', type: 'git' }, 'deploy-git', service())).toBe('button.domain.set')
    expect(serviceActionLabelKey({ kind: 'installation', type: 'go' }, 'go-catalog', service())).toBe('button.continue')
  })

  it('reads the next create step: template, share access, options, then the domain or site name flags', () => {
    expect(serviceActionLabelKey({ kind: 'create' }, 'choose-template', service())).toBe('button.theme.choose')
    expect(serviceActionLabelKey({ kind: 'create' }, 'share-access', service())).toBe('button.continue')
    expect(serviceActionLabelKey({ kind: 'create' }, 'user-options', service())).toBe('button.onboarding.prepare-installation')
    expect(serviceActionLabelKey({ kind: 'create' }, 'domain', service({ ask_for_domain: true }))).toBe('button.domain.set')
    expect(serviceActionLabelKey({ kind: 'create' }, 'domain', service({ ask_for_site_name: true }))).toBe('button.website.set')
    expect(serviceActionLabelKey({ kind: 'create' }, 'domain', service())).toBe('button.website.create')
  })
})

function withOptions (patch: Partial<OnboardingService> = {}) {
  return service({
    onboarding: { installation_type: { wordpress: true }, user_configurable_options: [{ name: 'region', type: 'select' }] },
    ...patch,
  })
}

describe('resolveAfterShare', () => {
  const input = { services: [service()], isReseller: false }

  it('goes to the options step for WordPress when the service has options', () => {
    expect(resolveAfterShare(input, { kind: 'create' }, withOptions())).toBe('user-options')
  })

  it('goes to the install tail for WordPress without options', () => {
    expect(resolveAfterShare(input, { kind: 'create' }, service())).toBe('install')
  })

  it('opens the Go catalog after the share access of the PanelAlpha Go source', () => {
    expect(resolveAfterShare(input, { kind: 'installation', type: 'go' }, withOptions())).toBe('go-catalog')
  })

  it('goes straight to the domain step for a non-WordPress installation, options or not', () => {
    expect(resolveAfterShare(input, { kind: 'installation', type: 'files' }, withOptions())).toBe('domain')
    expect(resolveAfterShare(input, { kind: 'installation', type: 'files' }, service())).toBe('domain')
  })
})

describe('resolveInstallTail (legacy userConfigurableOptionsSelected tail, LITE 1320-1354)', () => {
  const input = { services: [service()], isReseller: false }
  const flags = { isDemo: false }

  it('goes to the standard form for advanced onboarding, before any domain or site name flag', () => {
    expect(resolveInstallTail(input, service({ onboarding_mode: 'advanced', ask_for_domain: true, ask_for_site_name: true }), { kind: 'create' }, flags)).toBe('standard-form')
  })

  it('goes to the domain step when the service asks for a domain', () => {
    expect(resolveInstallTail(input, service({ ask_for_domain: true }), { kind: 'create' }, flags)).toBe('domain')
  })

  it('goes to the site name step when the service asks for a site name (legacy quick always does)', () => {
    expect(resolveInstallTail(input, service({ ask_for_site_name: true }), { kind: 'create' }, flags)).toBe('site-name')
    expect(resolveInstallTail(input, service({ onboarding_mode: 'legacy_quick' }), { kind: 'create' }, flags)).toBe('site-name')
  })

  it('goes to the demo action for the demo account, after the domain and site name steps', () => {
    expect(resolveInstallTail(input, service(), { kind: 'create' }, { isDemo: true })).toBe('demo')
    expect(resolveInstallTail(input, service({ ask_for_domain: true }), { kind: 'create' }, { isDemo: true })).toBe('domain')
  })

  it('goes to the install action when nothing else is asked', () => {
    expect(resolveInstallTail(input, service(), { kind: 'create' }, flags)).toBe('install')
    expect(resolveInstallTail(input, undefined, { kind: 'create' }, flags)).toBe('install')
  })

  it('goes to the import method step on the import path (the URL step is the first import step, never the tail)', () => {
    expect(resolveInstallTail(input, service({ onboarding_mode: 'advanced' }), { kind: 'import' }, flags)).toBe('import-method')
    expect(resolveInstallTail(input, service(), { kind: 'import' }, { isDemo: true })).toBe('import-method')
  })
})

describe('import sequence: URL, share access, user options, then the method (legacy importedInstanceUrlSelected, LITE 1680-1709)', () => {
  const input = (isReseller = false) => ({ services: [service()], isReseller })
  const shareable = () => service({ onboarding: { installation_type: { wordpress: true }, can_select_reseller_user: true } })

  it('goes to share access after the URL when the service lets the user share, before the options and the method', () => {
    expect(resolveAfterImportUrl(input(), shareable())).toBe('share-access')
    expect(resolveAfterImportUrl(input(true), service())).toBe('share-access')
    expect(resolveAfterShare(input(true), { kind: 'import' }, withOptions())).toBe('user-options')
    expect(resolveAfterUserOptions(input(true), withOptions(), { kind: 'import' })).toBe('import-method')
  })

  it('goes from the URL to the options and then the method without share access', () => {
    expect(resolveAfterImportUrl(input(), withOptions())).toBe('user-options')
    expect(resolveAfterUserOptions(input(), withOptions(), { kind: 'import' })).toBe('import-method')
  })

  it('goes from the URL straight to the method without share access or options', () => {
    expect(resolveAfterImportUrl(input(), service())).toBe('import-method')
    expect(resolveAfterShare(input(true), { kind: 'import' }, service())).toBe('import-method')
  })

  it('never returns the URL step after the options or the share access', () => {
    for (const withShare of [false, true]) {
      for (const options of [false, true]) {
        const svc = options ? withOptions({ ask_for_domain: true }) : service({ ask_for_domain: true })
        const next = [
          resolveAfterImportUrl(input(withShare), svc),
          resolveAfterShare(input(withShare), { kind: 'import' }, svc),
          resolveAfterUserOptions(input(withShare), svc, { kind: 'import' }),
        ]
        expect(next).not.toContain('import-url')
      }
    }
  })

  it('maps the method to the plugin (simple) or the FTP (advanced) step, plugin by default', () => {
    expect(resolveImportMethod('plugin')).toBe('import-simple')
    expect(resolveImportMethod('ftp')).toBe('import-advanced')
  })
})

describe('resolveAfterUserOptions', () => {
  it('hands the picked options on to the install tail of the service', () => {
    const input = { services: [service()], isReseller: false }

    expect(resolveAfterUserOptions(input, service({ ask_for_domain: true }), { kind: 'create' })).toBe('domain')
    expect(resolveAfterUserOptions(input, service(), { kind: 'create' })).toBe('install')
    expect(resolveAfterUserOptions({ ...input, isDemo: true }, service(), { kind: 'create' })).toBe('demo')
  })
})

describe('share access and user options in the cascade', () => {
  const input = (services: OnboardingService[], isReseller = false) => ({ services, isReseller })

  it('shows share access for a reseller after the template (Create) and before the deploy steps (installation)', () => {
    const advanced = service({ onboarding_mode: 'advanced' })

    expect(resolveAfterService(input([advanced], true), advanced, { kind: 'create' })).toBe('choose-template')
    expect(resolveAfterTheme(input([advanced], true), advanced)).toBe('share-access')
    expect(resolveAfterService(input([service()], true), service(), { kind: 'installation', type: 'git' })).toBe('share-access')
  })

  it('shows share access when the service lets the user pick a reseller user', () => {
    const shareable = service({ onboarding: { installation_type: { wordpress: true }, can_select_reseller_user: true } })

    expect(resolveAfterTheme(input([shareable]), shareable)).toBe('share-access')
  })

  it('skips share access and goes to the options step (or the install tail) without a reseller', () => {
    expect(resolveAfterTheme(input([withOptions()]), withOptions())).toBe('user-options')
    expect(resolveAfterTheme(input([service()]), service())).toBe('install')
    expect(resolveAfterTheme(input([service({ ask_for_domain: true })]), service({ ask_for_domain: true }))).toBe('domain')
  })

  it('reads the user options from the service', () => {
    expect(hasUserConfigurableOptions(withOptions())).toBe(true)
    expect(hasUserConfigurableOptions(service())).toBe(false)
    expect(hasUserConfigurableOptions(undefined)).toBe(false)
  })
})

describe('mode helpers in the labels (legacy hasSelectedServiceAskFor*, advanced never asks)', () => {
  it('ignores the domain and site name flags of an advanced service', () => {
    const advanced = service({ onboarding_mode: 'advanced', ask_for_domain: true, ask_for_site_name: true })

    expect(userOptionsActionLabelKey(advanced)).toBe('button.website.create')
    expect(serviceActionLabelKey({ kind: 'create' }, 'domain', advanced)).toBe('button.website.create')
  })

  it('reads the site name flag from the service onboarding config when the service has none', () => {
    const configured = service({ onboarding: { installation_type: { wordpress: true }, super_quick_ask_for_site_name: true } })

    expect(userOptionsActionLabelKey(configured)).toBe('button.website.set')
  })
})

describe('shareAccessActionLabelKey', () => {
  it('names the button after the options, then the domain and site name flags (WordPress)', () => {
    expect(shareAccessActionLabelKey(withOptions({ ask_for_domain: true }), 'wordpress')).toBe('button.onboarding.prepare-installation')
    expect(shareAccessActionLabelKey(service({ ask_for_domain: true }), 'wordpress')).toBe('button.domain.set')
    expect(shareAccessActionLabelKey(service({ ask_for_site_name: true }), 'wordpress')).toBe('button.website.set')
    expect(shareAccessActionLabelKey(service(), 'wordpress')).toBe('button.website.create')
  })

  it('reads continue for a non-WordPress installation unless the domain flag comes first', () => {
    expect(shareAccessActionLabelKey(service(), 'git')).toBe('button.continue')
    expect(shareAccessActionLabelKey(service({ ask_for_site_name: true }), 'files')).toBe('button.continue')
    expect(shareAccessActionLabelKey(service({ ask_for_domain: true }), 'git')).toBe('button.domain.set')
  })
})

describe('userOptionsActionLabelKey', () => {
  it('names the button after the domain and site name flags', () => {
    expect(userOptionsActionLabelKey(service({ ask_for_domain: true }))).toBe('button.domain.set')
    expect(userOptionsActionLabelKey(service({ ask_for_site_name: true }))).toBe('button.website.set')
    expect(userOptionsActionLabelKey(service())).toBe('button.website.create')
  })
})

describe('importStepCount', () => {
  const input = (isReseller: boolean) => ({ services: [service()], isReseller })

  it('counts the four import steps, plus share access and user options when the flow has them', () => {
    expect(importStepCount(input(false), service())).toBe(4)
    expect(importStepCount(input(true), service())).toBe(5)
    expect(importStepCount(input(false), withOptions())).toBe(5)
    expect(importStepCount(input(true), withOptions())).toBe(6)
  })
})
