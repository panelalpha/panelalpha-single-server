import type { InstallationTypeKey, OnboardingService } from './onboarding-service'
import type { OnboardingStep } from './onboarding-steps'
import type { DomainVerification } from '@/entities/domain/domain-verification.api'
import { asksForSiteName, canTransferDomain, hasEagerDnsVerification, isSuperQuick } from './onboarding-service'

// The domain sequence. One module so the order of the steps lives in one place; the flow binds the effects.

/** What the sequence reads from the flow: the service, the installation type and the demo flag. */
export interface DomainSequenceContext {
  service: OnboardingService | undefined
  installationType: InstallationTypeKey
  isDemo: boolean
  /**
   * The form already holds the site name and has no deploy branch, so
   * after the domain (and the DNS check) it goes straight to the demo or the install.
   */
  fromStandardForm?: boolean
}

/**
 * The effects the sequence runs. The flow binds them to the store and the requests; the sequence only decides the order and
 * stops on a closed or restarted flow (`inRun`, checked after every `await`).
 */
export interface DomainSequenceDeps {
  /**
   * The verify request: the answer, or null when the request failed (the store shows the alert).
   * A failure keeps the flow on the domain step, as the legacy TypeError did.
   */
  checkDomainAvailability: () => Promise<DomainVerification | null>
  /** Resolves true when the domain was created (and stored as the new domain). */
  createDomain: () => Promise<boolean>
  /** The record to add and the transfer step. */
  showTransfer: (record: Record<string, unknown>) => void
  /** True when the domain already resolves to the service. */
  checkDnsPropagation: () => Promise<boolean>
  /** Opens a step of the cascade (a step the wrapper does not render closes the flow). */
  show: (step: OnboardingStep) => void
  /** Opens the progress and runs the install request. */
  install: () => Promise<void>
  demo: () => Promise<void>
  /** True while the flow that started the sequence is still open (the run did not change). */
  inRun: () => boolean
}

/**
 * The transfer check when the server allows transfers (a verification still required
 * opens the transfer step), the domain is created, then the DNS check, then the rest of the tail.
 */
export async function runAfterDomain (deps: DomainSequenceDeps, ctx: DomainSequenceContext): Promise<void> {
  if (canTransferDomain(ctx.service)) {
    const verification = await deps.checkDomainAvailability()
    if (!deps.inRun() || !verification) {
      return
    }
    if (verification.verification_required) {
      deps.showTransfer(verification.verification_record ?? {})
      return
    }
  }

  const created = await deps.createDomain()
  if (!deps.inRun() || !created) {
    return
  }

  await afterDomainCreated(deps, ctx)
}

/** The transfer step's "Transfer now" creates the domain, then the same DNS and tail. */
export async function runAfterTransfer (deps: DomainSequenceDeps, ctx: DomainSequenceContext): Promise<void> {
  const created = await deps.createDomain()
  if (!deps.inRun() || !created) {
    return
  }
  await afterDomainCreated(deps, ctx)
}

/** The DNS step's "Continue" or "Skip" goes straight to the tail. */
export async function runAfterVerification (deps: DomainSequenceDeps, ctx: DomainSequenceContext): Promise<void> {
  await continueInstall(deps, ctx)
}

/** The eager DNS check (`hasSelectedServiceInstantVerificationEnabled`); a domain that does not resolve yet opens the DNS step. */
async function afterDomainCreated (deps: DomainSequenceDeps, ctx: DomainSequenceContext): Promise<void> {
  if (hasEagerDnsVerification(ctx.service)) {
    const resolved = await deps.checkDnsPropagation()
    if (!deps.inRun()) {
      return
    }
    if (!resolved) {
      deps.show('dns-verify')
      return
    }
  }
  await continueInstall(deps, ctx)
}

/** The tail shared by every domain branch: deploy steps, site name (both skipped on the standard form path), demo, then the install. */
async function continueInstall (deps: DomainSequenceDeps, ctx: DomainSequenceContext): Promise<void> {
  const step = ctx.fromStandardForm ? null : tailStep(ctx)
  if (step) {
    deps.show(step)
    return
  }
  if (ctx.isDemo) {
    await deps.demo()
    return
  }
  await deps.install()
}

/** The deploy step of the installation type, or the site name step when the service asks for one. */
function tailStep (ctx: DomainSequenceContext): OnboardingStep | null {
  if (ctx.installationType === 'git') {
    return 'deploy-git'
  }
  if (ctx.installationType === 'files') {
    return 'deploy-zip'
  }
  return asksForSiteName(ctx.service) ? 'site-name' : null
}

// The install: the progress
// opens, the install request runs, and the same run guard as the domain sequence stops a closed or restarted flow.

/** The effects of the install, bound to the store and the flow. */
export interface InstallDeps {
  /** Resolves true when the domain was created (and stored as the new domain). */
  createDomain: () => Promise<boolean>
  /** Opens a step: the progress modal. */
  show: (step: OnboardingStep) => void
  /** The request. A failure is an alert only, the progress stays in its state (1:1). */
  installInstance: () => Promise<void>
  /** A failed create on the after-login path shows the failure. */
  failInstallation: () => void
  demo: () => Promise<void>
  /** True while the flow that started the install is still open. */
  inRun: () => boolean
}

export interface InstallContext {
  service: OnboardingService | undefined
  /** A domain already exists for the flow, so no create request runs. */
  hasDomain: boolean
  /** The progress opens before the create request. */
  afterLogin: boolean
  isDemo: boolean
  /** The installation type is a custom deploy (see `isCustomDeployType`): its progress is the standard one with the deploy logs. */
  customDeploy?: boolean
}

/**
 * The installation types that deploy a custom project: the
 * repository and the uploaded files, and a PanelAlpha Go app (deployed from its repository). Their progress shows the deploy logs.
 */
const CUSTOM_DEPLOY_TYPES: ReadonlySet<InstallationTypeKey> = new Set(['git', 'files', 'go'])

export function isCustomDeployType (type: InstallationTypeKey | null | undefined): boolean {
  return type != null && CUSTOM_DEPLOY_TYPES.has(type)
}

/**
 * The super-quick progress for the simple mode, else the standard one.
 * A custom deploy always opens the standard progress, also for the simple mode.
 */
export function installProgressStep (service: OnboardingService | undefined, customDeploy = false): OnboardingStep {
  if (customDeploy) {
    return 'install-progress'
  }
  return isSuperQuick(service) ? 'super-quick-progress' : 'install-progress'
}

/**
 * The install after a domain (or the options path): a domain is created first only when the flow has none, then the
 * progress opens and the request runs. The after-login path opens the progress before the create request.
 */
export async function startInstall (deps: InstallDeps, ctx: InstallContext): Promise<void> {
  if (ctx.afterLogin) {
    deps.show(installProgressStep(ctx.service, ctx.customDeploy))
    if (!ctx.hasDomain) {
      const created = await deps.createDomain()
      if (!deps.inRun()) {
        return
      }
      if (!created) {
        deps.failInstallation()
        return
      }
    }
    await deps.installInstance()
    return
  }

  if (!ctx.hasDomain) {
    const created = await deps.createDomain()
    if (!deps.inRun() || !created) {
      return
    }
  }
  deps.show(installProgressStep(ctx.service, ctx.customDeploy))
  await deps.installInstance()
}

/**
 * The demo account installs without a request, the create runs only when the flow
 * has no domain yet. The site name step has no after-login branch of its own.
 */
export async function runAfterSiteName (deps: InstallDeps, ctx: InstallContext): Promise<void> {
  if (ctx.isDemo) {
    await deps.demo()
    return
  }
  await startInstall(deps, { ...ctx, afterLogin: false })
}
