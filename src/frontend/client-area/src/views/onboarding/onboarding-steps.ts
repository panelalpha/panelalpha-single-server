import { serviceLimitReached } from '@/entities/service/service-display'
import {
  asksForDomain,
  asksForSiteName,
  availableInstallationTypes,
  canMigrateWordpress,
  getActiveServices,
  getServiceOnboardingMode,
  type InstallationTypeKey,
  type InstallationTypeOptions,
  isAdvancedOnboarding,
  type OnboardingService,
} from './onboarding-service'

/**
 * A modal of the onboarding cascade (the domain, site name, standard form, progress and deploy steps). Replaces the copies of
 * "next step" in the legacy handlers. The wrapper renders only the steps whose phase has landed (`RENDERED_STEPS`); the rest close it.
 */
export type ScopedStep
  = | 'zero-data'
    | 'no-type'
    | 'choose-installation-type'
    | 'choose-creation-type'
    | 'choose-service'
    | 'limit'
    | 'choose-template'
    | 'share-access'
    | 'user-options'
    | 'domain'
    | 'site-name'
    | 'standard-form'
    | 'domain-transfer'
    | 'dns-verify'
    | 'install-progress'
    | 'super-quick-progress'
    | 'sync-progress'
    | 'choose-onboarding-process'
    | 'import-url'
    | 'import-method'
    | 'import-simple'
    | 'import-advanced'
    | 'import-setup-complete'
    | 'deploy-git'
    | 'deploy-zip'
    | 'env-vars'
    | 'go-catalog'

export type OnboardingStep = ScopedStep

/**
 * What the files drop on the project list leads to. `deploy-files` is
 * the start of the files sequence (upload, then the deploy), not a modal step.
 */
export type FilesDropStep = 'zero-data' | 'no-type' | 'choose-service' | 'limit' | 'deploy-files'

export interface FilesDropNext {
  step: FilesDropStep
  /** The active services that enable the files installation type (empty when the step is `zero-data` or `no-type`). */
  services: OnboardingService[]
}

/**
 * Actions of the install tail: the flow runs them, they never open a
 * modal, so they are not a `step`.
 */
export type OnboardingAction = 'install' | 'demo'

/** What the install tail resolves to. */
export type TailResult = 'import-method' | 'standard-form' | 'domain' | 'site-name' | OnboardingAction

/** The import method the user picks on the method step: the plugin (simple) or FTP (advanced). */
export type ImportMethod = 'plugin' | 'ftp'

/** Where the flow started: a Create / Add new click (`start`) or the `-redirect` key after sign-in (`after-login`). */
export type OnboardingSource = 'start' | 'after-login'

/**
 * What a transition hands on: a step to show, or the `installationTypeSelected` transition, which the next phase resolves
 * (it is called directly when there is exactly one type).
 */
export type CascadeResult = OnboardingStep | OnboardingAction | 'installation-type-selected'

/** The path a flow takes after its first choice; it decides which steps follow the service. */
export type CascadePath
  = | { kind: 'installation', type: InstallationTypeKey }
    | { kind: 'create' }
    | { kind: 'import' }

/**
 * The inputs every transition reads: the `/home` services, whether the user is a reseller and
 * whether the account is the demo one.
 */
export interface CascadeInput {
  services: readonly OnboardingService[]
  isReseller: boolean
  isDemo?: boolean
}

/** The flags the install tail reads. */
export interface TailFlags {
  isDemo: boolean
}

function tailFlags (input: CascadeInput): TailFlags {
  return { isDemo: input.isDemo === true }
}

/** A reseller, or a service that lets the user pick a reseller user. */
function canShareAccess ({ isReseller }: CascadeInput, service: OnboardingService | undefined): boolean {
  return isReseller || service?.onboarding?.can_select_reseller_user === true
}

/** The first step after a Create / Add new click. */
export function resolveStart (services: readonly OnboardingService[], options: InstallationTypeOptions = {}): CascadeResult {
  const active = getActiveServices(services)

  if (active.length === 0) {
    return 'zero-data'
  }

  const types: InstallationTypeKey[] = availableInstallationTypes(active, options)
  if (types.length === 0) {
    return 'no-type'
  }

  return types.length > 1 ? 'choose-installation-type' : 'installation-type-selected'
}

/**
 * WordPress offers Create vs Import only when the
 * service can migrate; the other types go on to the service choice (several services) or straight to the service steps.
 */
export function resolveInstallationTypeSelected (input: CascadeInput, type: InstallationTypeKey): CascadeResult {
  const active = getActiveServices(input.services)

  if (type === 'wordpress') {
    if (canMigrateWordpress(active)) {
      return 'choose-creation-type'
    }
    // WordPress create only, the Create vs Import choice is skipped.
    return resolveServiceStep({ ...input, services: active }, { kind: 'create' })
  }
  return resolveServiceStep({ ...input, services: active }, { kind: 'installation', type })
}

/**
 * 0 = Create (`newInstanceSelected`), 1 = Import (`importStart`). WordPress
 * without migration reaches the Create path straight from `installationTypeSelected`.
 */
export function resolveCreationType (input: CascadeInput, creationType: 0 | 1): CascadeResult {
  const active = getActiveServices(input.services)
  return resolveServiceStep({ ...input, services: active }, creationType === 1 ? { kind: 'import' } : { kind: 'create' })
}

/**
 * The service choice comes first when there are several services; a single service goes straight to its steps.
 */
function resolveServiceStep (input: CascadeInput, path: CascadePath): CascadeResult {
  // The demo account picks the process before the service choice, also without
  // the autostart key.
  if (path.kind === 'create' && input.isDemo === true) {
    return 'choose-onboarding-process'
  }
  if (input.services.length > 1) {
    return 'choose-service'
  }
  return resolveAfterService(input, input.services[0], path)
}

/**
 * After the service: limit, then per path. The Create path
 * continues with the template, share access and user options; the installation path goes to share access and
 * then the deploy or domain step.
 */
export function resolveAfterService (input: CascadeInput, service: OnboardingService | undefined, path: CascadePath): CascadeResult {
  if (serviceLimitReached(service)) {
    return 'limit'
  }

  if (path.kind === 'import') {
    return 'import-url'
  }

  if (path.kind === 'create') {
    return canChooseTheme(service) ? 'choose-template' : resolveAfterTheme(input, service)
  }

  if (canShareAccess(input, service)) {
    return 'share-access'
  }

  return installationSourceStep(path.type)
}

/**
 * The source step of a non-WordPress installation once the service (and its share access) is set. Git and files ask for their source
 * first, WordPress for its domain; the PanelAlpha Go source opens the catalog, whose app deploys like a git source without a domain step.
 */
function installationSourceStep (type: InstallationTypeKey): CascadeResult {
  if (type === 'git') {
    return 'deploy-git'
  }
  if (type === 'go') {
    return 'go-catalog'
  }
  return type === 'files' ? 'deploy-zip' : 'domain'
}

/**
 * After the service modal's choice: with several services the picked one goes on
 * through the limit, then share access (or the domain step) for a non-WordPress installation, so the deploy steps follow the
 * domain. Every other path resolves as `resolveAfterService`.
 */
export function resolveAfterServiceChoice (input: CascadeInput, service: OnboardingService | undefined, path: CascadePath): CascadeResult {
  if (path.kind !== 'installation' || path.type === 'wordpress') {
    return resolveAfterService(input, service, path)
  }
  if (serviceLimitReached(service)) {
    return 'limit'
  }
  if (canShareAccess(input, service)) {
    return 'share-access'
  }
  // A Go app deploys like the default git path, which creates its project with the repository (no domain step).
  return path.type === 'go' ? 'go-catalog' : 'domain'
}

/**
 * What a files drop on the project list leads to. Only the active
 * services that enable the files installation type count. One such service goes on to its limit check and the upload sequence;
 * several ask for the service choice first.
 */
export function resolveFilesDropNextStep (services: readonly OnboardingService[]): FilesDropNext {
  const active = getActiveServices(services)
  if (active.length === 0) {
    return { step: 'zero-data', services: [] }
  }

  const filesServices = active.filter(service => service.onboarding?.installation_type?.files === true)
  if (filesServices.length === 0) {
    return { step: 'no-type', services: [] }
  }
  if (filesServices.length > 1) {
    return { step: 'choose-service', services: filesServices }
  }
  return {
    step: serviceLimitReached(filesServices[0]) ? 'limit' : 'deploy-files',
    services: filesServices,
  }
}

/**
 * During a files drop: the picked service goes to the limit check
 * first, then a service without the files installation type gets the no-type modal, else the files sequence runs. No share access
 * and no domain step in between.
 */
export function resolveFilesDropService (service: OnboardingService | undefined): 'limit' | 'no-type' | 'deploy-files' {
  if (serviceLimitReached(service)) {
    return 'limit'
  }
  return service?.onboarding?.installation_type?.files === true ? 'deploy-files' : 'no-type'
}

/**
 * Simple onboarding never offers themes, advanced always
 * does, legacy quick does unless the plan fixes a default theme or the service was installed from a template.
 */
export function canChooseTheme (service: OnboardingService | undefined): boolean {
  if (!service) {
    return false
  }
  const mode = getServiceOnboardingMode(service)
  if (mode === 'simple') {
    return false
  }
  if (mode === 'advanced') {
    return true
  }
  if (service.plan_default_theme) {
    return false
  }
  return !(service.is_installed_from_template === true && service.quick_allow_to_choose_themes !== true)
}

/** The user options step follows when the service has any. */
export function hasUserConfigurableOptions (service: OnboardingService | undefined): boolean {
  return (service?.onboarding?.user_configurable_options?.length ?? 0) > 0
}

/**
 * The options step when the service has any, else the install tail
 * (the `createDomain` path for WordPress, `domain` for the others).
 */
function resolveOptions (input: CascadeInput, service: OnboardingService | undefined, path: CascadePath): CascadeResult {
  return hasUserConfigurableOptions(service) ? 'user-options' : resolveInstallTail(input, service, path, tailFlags(input))
}

/**
 * For Import: the URL step, then share access and the options (the
 * caller loads them), then the import method step. The URL step is the first import step; the tail never returns to it.
 */
const IMPORT_PATH: CascadePath = { kind: 'import' }

/**
 * After the URL, share access when the service allows it, otherwise
 * the options (when the service has them) and then the import method step.
 */
export function resolveAfterImportUrl (input: CascadeInput, service: OnboardingService | undefined): 'share-access' | 'user-options' | 'import-method' {
  if (canShareAccess(input, service)) {
    return 'share-access'
  }
  // The import tail always resolves to the method step, so the only other result of `resolveOptions` is the options step.
  return resolveOptions(input, service, IMPORT_PATH) === 'user-options' ? 'user-options' : 'import-method'
}

/**
 * The plugin opens the simple form, anything else the advanced one.
 */
export function resolveImportMethod (method: ImportMethod): 'import-simple' | 'import-advanced' {
  return method === 'plugin' ? 'import-simple' : 'import-advanced'
}

/**
 * After the options: import method, standard form
 * for advanced onboarding, domain, site name, demo, then the install itself. Replaces the copies of this chain that every
 * transition used to end with `'domain'`. `input` keeps the signature the other transitions share.
 */
export function resolveInstallTail (input: CascadeInput, service: OnboardingService | undefined, path: CascadePath, flags: TailFlags): TailResult {
  if (path.kind === 'import') {
    return 'import-method'
  }
  if (isAdvancedOnboarding(service)) {
    return 'standard-form'
  }
  if (asksForDomain(service)) {
    return 'domain'
  }
  if (asksForSiteName(service)) {
    return 'site-name'
  }
  return flags.isDemo ? 'demo' : 'install'
}

/** The tail of the Create path: share access, then the options or the install tail. */
export function resolveAfterTheme (input: CascadeInput, service: OnboardingService | undefined): CascadeResult {
  return canShareAccess(input, service) ? 'share-access' : resolveOptions(input, service, { kind: 'create' })
}

/**
 * A non-WordPress installation goes straight to
 * the domain step; WordPress loads the options (the caller does that) and goes on to the options step, or the domain step.
 */
export function resolveAfterShare (input: CascadeInput, path: CascadePath, service: OnboardingService | undefined): CascadeResult {
  if (path.kind === 'installation' && path.type === 'go') {
    return 'go-catalog'
  }
  if (path.kind === 'installation' && path.type !== 'wordpress') {
    return 'domain'
  }
  return resolveOptions(input, service, path)
}

/** The options are picked, the install tail goes on. */
export function resolveAfterUserOptions (input: CascadeInput, service: OnboardingService | undefined, path: CascadePath): CascadeResult {
  return resolveInstallTail(input, service, path, tailFlags(input))
}

/**
 * The primary button of the share access step: the step that follows the share access. The options and
 * the domain flags come first; a non-WordPress installation reads "continue".
 */
export function shareAccessActionLabelKey (service: OnboardingService | undefined, installationType: InstallationTypeKey): string {
  if (hasUserConfigurableOptions(service)) {
    return 'button.onboarding.prepare-installation'
  }
  if (asksForDomain(service)) {
    return 'button.domain.set'
  }
  if (installationType !== 'wordpress') {
    return 'button.continue'
  }
  return asksForSiteName(service) ? 'button.website.set' : 'button.website.create'
}

/** The primary button of the options step: the domain or site name step follows. */
export function userOptionsActionLabelKey (service: OnboardingService | undefined): string {
  if (asksForDomain(service)) {
    return 'button.domain.set'
  }
  return asksForSiteName(service) ? 'button.website.set' : 'button.website.create'
}

/**
 * The import flow counts its steps, one more for the share
 * access and one more for the user options when the service has them.
 */
export function importStepCount (input: CascadeInput, service: OnboardingService | undefined): number {
  return 4 + (canShareAccess(input, service) ? 1 : 0) + (hasUserConfigurableOptions(service) ? 1 : 0)
}

/**
 * The copy key of the service modal's primary button: it names the step
 * that follows. Installation types other than WordPress always read "set domain"; Import reads "continue".
 */
export function serviceActionLabelKey (path: CascadePath, next: CascadeResult | null, service: OnboardingService | undefined): string {
  // The PanelAlpha Go source goes on to the catalog, with no domain step.
  if (path.kind === 'import' || (path.kind === 'installation' && path.type === 'go')) {
    return 'button.continue'
  }
  if (path.kind === 'installation' && path.type !== 'wordpress') {
    return 'button.domain.set'
  }
  if (next === 'choose-template') {
    return 'button.theme.choose'
  }
  if (next === 'share-access') {
    return 'button.continue'
  }
  if (next === 'user-options') {
    return 'button.onboarding.prepare-installation'
  }
  if (asksForDomain(service)) {
    return 'button.domain.set'
  }
  if (asksForSiteName(service)) {
    return 'button.website.set'
  }
  return 'button.website.create'
}
