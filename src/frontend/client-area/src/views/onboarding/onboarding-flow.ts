import type { GoAppDetails } from './go/go-catalog.api'
import type { ImportUrlSelection } from './import-url'
import type { DomainSequenceContext, DomainSequenceDeps, InstallContext, InstallDeps } from './install-sequence'
import type { CascadeInput, CascadePath, CascadeResult, ImportMethod, OnboardingSource } from './onboarding-steps'
import type { DeployGitSshBody, DeployInstanceBody, OnboardingTheme } from './onboarding.api'
import type { StandardFormValues } from './standard-form'
import type { ShareUser } from '@/entities/project/ui/share-instance'
import i18next from 'i18next'
import { useRoute, useRouter } from 'vue-router'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { isSingleServerActive } from '@/shared/api/resource-paths'
import { emit as emitAppEvent, type FilesDropPayload } from '@/shared/events/app-events'
import { beginFilesCreate, cancelFilesCreate, endFilesCreate, filesCreateCancelled, filesCreateUploadSignal, setFilesCreateProject } from '@/shared/files/files-create'
import { uploadMaxBytes } from '@/shared/files/upload-limit'
import { useSessionStore } from '@/shared/session/session.store'
import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
import { isDemoAccount, scheduleDemoInstallation } from './demo'
import { type EnvVarsResult, gitEnvVarsContext, needsEnvVarsStep, sshEnvVarsContext } from './env-vars'
import { type FilesDeployDeps, runFilesDeploy } from './files-deploy'
import { resolveSshNextStep } from './git-ssh-launch'
import { isCustomDeployType, runAfterDomain, runAfterSiteName, runAfterTransfer, runAfterVerification, startInstall } from './install-sequence'
import { armBackButton } from './onboarding-history'
import {
  availableInstallationTypes,
  canMigrateWordpress,
  getActiveServices,
  type InstallationTypeKey,
  type InstallationTypeOptions,
  type OnboardingService,
} from './onboarding-service'
import { resolveAfterImportUrl, resolveAfterServiceChoice, resolveAfterShare, resolveAfterTheme, resolveAfterUserOptions, resolveCreationType, resolveFilesDropNextStep, resolveFilesDropService, resolveImportMethod, resolveInstallationTypeSelected, resolveStart } from './onboarding-steps'
import { createFilesDomain, deleteDeployKeyProject, listServiceDomains, previewEnvExample, uploadDeployFile } from './onboarding.api'
import { type GitDeploy, useOnboardingStore } from './onboarding.store'
import { prefillFromInstallDetails } from './standard-form'

/**
 * Steps that come after the instance options load on the Create path: the options are loaded
 * before any of them, as the domain step always did.
 */
const TAIL_STEPS: ReadonlySet<CascadeResult> = new Set<CascadeResult>(['user-options', 'domain', 'site-name', 'standard-form', 'install', 'demo'])

/** The demo account's answer comes after 2 s. */
const DEMO_IMPORT_DELAY_MS = 2000
/**
 * Legacy demo url that fails the import: the demo answer never comes. Dead in practice, as in legacy: the URL step
 * always prefixes a scheme, so the stored url is `https://reject`, never `reject`. Kept 1:1.
 */
const DEMO_IMPORT_REJECT_URL = 'reject'
/** The demo result nameservers. */
const DEMO_IMPORT_NAMESERVERS: readonly string[] = ['ns1.example.com', 'ns2.example.com', 'ns3.example.com']

/**
 * The onboarding cascade bound to the session and the store. The resolvers stay pure; this applies their result to the store.
 */
export function useOnboardingFlow () {
  const session = useSessionStore()
  const onboarding = useOnboardingStore()
  const router = useRouter()
  const route = useRoute()
  const spa = useSpaResourcePath()

  function input (): CascadeInput {
    return {
      services: session.services as OnboardingService[],
      isReseller: session.user?.reseller_settings != null,
      isDemo: isDemoAccount(session.user?.email),
    }
  }

  function activeServices (): OnboardingService[] {
    return getActiveServices(session.services as OnboardingService[])
  }

  /** The PanelAlpha Go source is offered on the Community panel, which reads PanelAlpha Go's catalog with its Hub token. */
  function typeOptions (): InstallationTypeOptions {
    return { go: session.home?.app?.community_panel === true }
  }

  /** Every entry starts on the first active service. */
  function resetSelectedService (): void {
    onboarding.selectedService = activeServices()[0] ?? null
  }

  /** Create or Import, or the installation type when the flow never chose Create/Import. */
  function currentPath (): CascadePath {
    if (onboarding.creationType === 1) {
      return { kind: 'import' }
    }
    if (onboarding.creationType === 0 || !onboarding.selectedInstallationType) {
      return { kind: 'create' }
    }
    return { kind: 'installation', type: onboarding.selectedInstallationType }
  }

  /**
   * `newInstance`: the step of the Create path straight after the type, with one service. It is the
   * only legacy handler with the after-login order of the install.
   */
  async function apply (next: CascadeResult, { newInstance = false }: { newInstance?: boolean } = {}): Promise<void> {
    if (next === 'installation-type-selected') {
      // The single enabled type.
      const [only] = availableInstallationTypes(activeServices(), typeOptions())
      if (only) {
        await installationTypeSelected(only)
        return
      }
      onboarding.deactivateAll()
      return
    }
    // The install tail: the domain is created when the flow has none, the progress opens, then the request runs.
    if (next === 'install') {
      await startInstall(installDeps(onboarding.run), installContext(newInstance))
      return
    }
    // The demo account installs without a request: the progress opens and the result follows after the delay.
    if (next === 'demo') {
      demoInstallation()
      return
    }
    onboarding.show(next)
  }

  /**
   * Loads the instance options under the "preparing" overlay. Resolves false when the flow was closed or started again
   * during the load (the back button, X): the closed flow stays closed.
   */
  async function loadOptionsInRun (serviceId: number | string): Promise<boolean> {
    const run = onboarding.run
    await onboarding.loadInstanceOptions(serviceId)
    return onboarding.run === run
  }

  /**
   * With no template and no share access
   * step, the Create path loads the instance options before the options step (or the install tail that follows without them).
   */
  async function applyAfterService (next: CascadeResult, options: { newInstance?: boolean } = {}): Promise<void> {
    const service = onboarding.selectedService
    if (currentPath().kind === 'create' && TAIL_STEPS.has(next) && service
      && !(await loadOptionsInRun(service.id))) {
      return
    }
    await apply(next, options)
  }

  /** Legacy back button: `deactivateAll` and `resetInstallation`. */
  function closeOnBack (): void {
    onboarding.deactivateAll()
    onboarding.resetInstallation()
  }

  /**
   * What every start shares: a new start replaces an open flow (`run` bumps, so what the previous one still loads does not reopen it),
   * arms the back button and clears the state the previous flow left.
   */
  function begin (): void {
    onboarding.run++
    armBackButton(closeOnBack)
    onboarding.resetInstallation()
    // The first enabled type is preselected.
    const [first] = availableInstallationTypes(activeServices(), typeOptions())
    onboarding.selectedInstallationType = first ?? null
    onboarding.creationType = null
    resetSelectedService()
  }

  /** Create / Add new / FAB: the first step. Replaces an open flow and arms the back button. */
  function start (): void {
    begin()
    void apply(resolveStart(session.services as OnboardingService[], typeOptions()))
  }

  /**
   * The demo autostart: the process choice opens
   * at once, with no type, service or limit step in front of it.
   */
  function startDemoProcess (): void {
    begin()
    onboarding.show('choose-onboarding-process')
  }

  /**
   * Classic opens the standard form, quick the template
   * chooser. The shell and the autostart key are the wrapper's (they are not flow state).
   */
  function demoOnboardingSelected (classic: boolean): void {
    onboarding.show(classic ? 'standard-form' : 'choose-template')
  }

  /**
   * The standard progress, then after 3 s the completed
   * result and the success alert. No request. The run guard keeps a closed or restarted flow from getting the alert.
   */
  function demoInstallation (): void {
    const run = onboarding.run
    scheduleDemoInstallation({
      showProgress: () => onboarding.show('install-progress'),
      complete: successMessage => {
        onboarding.installationCompleted = true
        useAlertsStore().addAlert({ success: true, successMessage })
      },
      inRun: () => onboarding.run === run,
    }, onboarding.selectedSiteName ?? onboarding.selectedDomainName)
  }

  /**
   * The sync progress opens after the
   * `control-panel-upgrade` start. Opening the sync progress deactivates everything and then opens the modal,
   * and `deactivateAll` bumps `run`: the options load that `start` may still have in flight does not reopen over the sync.
   */
  function startSync (): void {
    onboarding.deactivateAll()
    onboarding.show('sync-progress')
  }

  /** The chosen type comes from the installation type modal (or the single one). */
  async function installationTypeSelected (type: InstallationTypeKey): Promise<void> {
    onboarding.selectedInstallationType = type
    if (type === 'wordpress' && !canMigrateWordpress(activeServices())) {
      // The WordPress create path also sets the creation type.
      onboarding.creationType = 0
    }
    resetSelectedService()
    await applyAfterService(resolveInstallationTypeSelected(input(), type), { newInstance: currentPath().kind === 'create' })
  }

  /** 0 = Create, 1 = Import. `after-login` marks the flow the sign-in opened. */
  async function creationTypeSelected (creationType: 0 | 1, options: { source?: OnboardingSource } = {}): Promise<void> {
    // A new cascade: what the previous one still loads stops at its run guard. After login `start` and this call run back to back;
    // without the bump both would reach the install tail and post the domain and the install twice.
    onboarding.run++
    // Reset first: the installation type goes back to WordPress.
    onboarding.resetInstallation()
    onboarding.creationType = creationType
    onboarding.source = options.source ?? 'start'
    resetSelectedService()
    await applyAfterService(resolveCreationType(input(), creationType), { newInstance: creationType === 0 })
  }

  /**
   * The service modal's choice, then the steps of the flow's path (`resolveAfterServiceChoice`). A files drop
   * (`filesDropLaunch`) takes its own branch: limit, then no-type or the files sequence, with no share access or domain step.
   */
  async function serviceSelected (service: OnboardingService): Promise<void> {
    onboarding.selectedService = service
    if (onboarding.filesDropLaunch) {
      await filesDropServiceSelected(service)
      return
    }
    await applyAfterService(resolveAfterServiceChoice(input(), service, currentPath()))
  }

  /** The files drop's service choice: the limit, the no-type modal, or the files sequence. */
  async function filesDropServiceSelected (service: OnboardingService): Promise<void> {
    const next = resolveFilesDropService(service)
    if (next === 'deploy-files') {
      await runFilesDropSequence()
      return
    }
    onboarding.show(next)
  }

  /**
   * A valid drop on the project list starts the files
   * sequence. Ignored while a flow is open or a drop is already pending, and for an empty drop. The
   * order is the legacy one: the start bumps `run` and arms the back button, the reset clears the flow, then the drop's own state is set.
   * The drop skips share access and the domain: it goes to the zero-data or no-type modal, the service choice (several files services), or
   * the limit / files sequence of the one service.
   */
  async function startFromFilesDrop (payload: FilesDropPayload): Promise<void> {
    if (onboarding.step !== null || onboarding.filesDropLaunch || payload.uploadItems.length === 0) {
      return
    }
    onboarding.run++
    armBackButton(closeOnBack)
    onboarding.resetInstallation()
    onboarding.filesDropLaunch = true
    onboarding.pendingFilesDropPayload = { uploadItems: payload.uploadItems }
    onboarding.selectedInstallationType = 'files'
    onboarding.creationType = null

    const next = resolveFilesDropNextStep(session.services as OnboardingService[])
    if (next.step === 'zero-data' || next.step === 'no-type') {
      onboarding.show(next.step)
      return
    }
    if (next.step === 'choose-service') {
      onboarding.serviceChoices = next.services
      onboarding.show('choose-service')
      return
    }
    onboarding.selectedService = next.services[0] ?? null
    if (next.step === 'limit') {
      onboarding.show('limit')
      return
    }
    await runFilesDropSequence()
  }

  /**
   * The files sequence of a drop: the domain is created (the drop holds none),
   * then the upload and the deploy, as the zip step does. The drop's files are the pending payload.
   */
  async function runFilesDropSequence (): Promise<void> {
    const pending = onboarding.pendingFilesDropPayload
    if (!pending) {
      return
    }
    await runFilesDeploy(filesDeployDeps(onboarding.run), {
      serviceId: onboarding.selectedService?.id as number | string,
      existingDomainId: null,
      uploadItems: pending.uploadItems,
    })
  }

  /**
   * The picked template is stored. Without share access the
   * instance options load first (overlay on the chooser), then the cascade goes on from the template.
   */
  async function themeSelected (theme: OnboardingTheme): Promise<void> {
    onboarding.selectedTheme = theme
    const service = onboarding.selectedService
    const next = resolveAfterTheme(input(), service ?? undefined)
    if (next !== 'share-access' && service && !(await loadOptionsInRun(service.id))) {
      return
    }
    await apply(next)
  }

  /**
   * The invited users are kept, then the options are loaded (WordPress only, the
   * non-WordPress installation goes straight to the domain step) and the cascade goes on.
   */
  async function sharedAccessSet (users: ShareUser[]): Promise<void> {
    // The first invited user's email, `""` with none; `createDomain` sends it.
    onboarding.delegatedUserEmail = users[0]?.email ?? ''
    onboarding.sharedAccess = users
    const path = currentPath()
    const service = onboarding.selectedService
    // Only WordPress loads the options here.
    if ((onboarding.selectedInstallationType ?? 'wordpress') === 'wordpress' && service && !(await loadOptionsInRun(service.id))) {
      return
    }
    await apply(resolveAfterShare(input(), path, service ?? undefined))
  }

  /** The picked values are kept for the domain step, then the install tail goes on. */
  async function userConfigurableOptionsSelected (values: Record<string, unknown>): Promise<void> {
    onboarding.selectedUserConfigurableOptions = values
    await apply(resolveAfterUserOptions(input(), onboarding.selectedService ?? undefined, currentPath()))
  }

  /**
   * The ChooseDomain pick. Ignored while a request runs (legacy guard). The sequence
   * after the domain (the create, then the next step, then the install) is `runAfterDomain`.
   */
  async function domainSelected ({ domain }: { domain: string }): Promise<void> {
    if (onboarding.submitting || onboarding.loading) {
      return
    }
    onboarding.selectedDomainName = domain
    await runAfterDomain(sequenceDeps(onboarding.run), sequenceContext())
  }

  /**
   * The transfer step's "Transfer now" continues the sequence. The `domainSelected` guard
   * too, so a second click during the create request posts no second domain (legacy has none).
   */
  async function transferDomain (): Promise<void> {
    if (onboarding.submitting || onboarding.loading) {
      return
    }
    await runAfterTransfer(sequenceDeps(onboarding.run), sequenceContext())
  }

  /** The DNS step's "Continue" or "Skip" goes on to the tail. */
  async function domainVerified (): Promise<void> {
    await runAfterVerification(sequenceDeps(onboarding.run), sequenceContext())
  }

  /** The effects of the domain sequence, bound to the store; `run` is the run the sequence started in. */
  function sequenceDeps (run: number): DomainSequenceDeps {
    return {
      checkDomainAvailability: () => onboarding.checkDomainAvailability(),
      createDomain: () => onboarding.createDomain(),
      showTransfer: record => {
        onboarding.domainTransferDnsRecord = record
        onboarding.show('domain-transfer')
      },
      checkDnsPropagation: () => onboarding.checkDnsPropagation(),
      show: next => onboarding.show(next),
      install: () => startInstall(installDeps(run), installContext()),
      demo: () => apply('demo'),
      inRun: () => onboarding.run === run,
    }
  }

  /**
   * The effects of the install, bound to the store; `run` is the run the install started in. The
   * failed create of the after-login path shows the failure on the progress.
   */
  function installDeps (run: number): InstallDeps {
    return {
      createDomain: () => onboarding.createDomain(),
      show: next => onboarding.show(next),
      installInstance: () => onboarding.installInstance(),
      failInstallation: () => {
        onboarding.installationCompleted = true
        onboarding.installationError = true
      },
      demo: () => apply('demo'),
      inRun: () => onboarding.run === run,
    }
  }

  /**
   * The flow's state the install reads. The domain exists when the domain step or the transfer created it;
   * the after-login source opens the progress before the create request, but only on the `newInstanceSelected` tail (the other
   * legacy handlers keep the usual order).
   */
  function installContext (newInstance = false): InstallContext {
    return {
      service: onboarding.selectedService ?? undefined,
      hasDomain: onboarding.newDomain !== null,
      afterLogin: newInstance && onboarding.source === 'after-login',
      isDemo: input().isDemo === true,
      customDeploy: isCustomDeployType(onboarding.selectedInstallationType),
    }
  }

  /**
   * The standard form's Continue. The form
   * already holds the domain and the site name. The rest is the domain sequence (transfer, create, DNS, install), so the form path
   * shares it with the domain step, but without its deploy and site name steps (`fromStandardForm`). The DNS step's Continue goes on
   * through them, as in legacy.
   */
  async function installInstanceFromStandardForm (form: StandardFormValues): Promise<void> {
    if (onboarding.submitting || onboarding.loading) {
      return
    }
    onboarding.selectedDomainName = form.domain
    onboarding.selectedSiteName = form.name
    onboarding.newInstanceStandardForm = { ...form }
    await runAfterDomain(sequenceDeps(onboarding.run), { ...sequenceContext(), fromStandardForm: true })
  }

  /**
   * The import url step's Continue keeps the url and the optional ip, then
   * goes on to share access, or loads the options (as the Create path does) and goes on to the import method step.
   */
  async function importUrlSelected ({ url, ip }: ImportUrlSelection): Promise<void> {
    onboarding.importUrl = url
    onboarding.importIp = ip ?? null
    const service = onboarding.selectedService
    const next = resolveAfterImportUrl(input(), service ?? undefined)
    if (next !== 'share-access' && service && !(await loadOptionsInRun(service.id))) {
      return
    }
    await apply(next)
  }

  /**
   * The connected repo of the deploy-git form is kept for the deploy.
   * With nothing to ask (one branch, no example) the deploy goes at once on the default branch; otherwise the env vars step opens. A result
   * that arrives after its step closed keeps nothing and deploys nothing: the step guard, not the modal, decides.
   */
  async function gitRepoSelected (deploy: GitDeploy): Promise<void> {
    if (onboarding.step !== 'deploy-git') {
      return
    }
    onboarding.gitDeploy = deploy
    if (deploy.mode === 'ssh') {
      await gitRepoSelectedSsh(deploy)
      return
    }
    if (!needsEnvVarsStep(deploy)) {
      await deployFromGit(deploy, deploy.default_branch, {})
      return
    }
    onboarding.envVarsContext = gitEnvVarsContext(deploy)
    onboarding.show('env-vars')
  }

  /**
   * The connected SSH repo deploys at once on its branch when
   * there is nothing to ask (`resolveSshNextStep`), otherwise the env vars step opens with the SSH context.
   */
  async function gitRepoSelectedSsh (deploy: GitDeploy): Promise<void> {
    const step = resolveSshNextStep({ branchMissing: deploy.branch_missing === true, branches: deploy.branches, preview: deploy.preview })
    if (step === 'deploy') {
      await deployFromGitSsh({ branch: deploy.branch ?? null, env_vars: {} })
      return
    }
    onboarding.envVarsContext = sshEnvVarsContext(deploy)
    onboarding.show('env-vars')
  }

  /**
   * The git source sends the chosen branch (the default one when the
   * step gave none) and the env vars; the files source sends the env vars with the uploaded paths. A result that arrives after the step
   * closed deploys nothing.
   */
  async function envVarsSelected (result: EnvVarsResult): Promise<void> {
    const context = onboarding.envVarsContext
    if (onboarding.step !== 'env-vars' || !context) {
      return
    }
    if (context.source === 'files') {
      // The Environment variables step is the create's last step: a cancel that landed while it was open stops its deploy too.
      if (filesCreateCancelled(onboarding.newDomain?.id as number | string | undefined)) {
        endFilesCreate()
        onFilesCreateCancelled((onboarding.newDomain?.id as number | string | undefined) ?? null, () => true)
        return
      }
      await finishFilesDeploy(onboarding.remoteFilePaths, result.env_vars ?? {}, {
        serviceId: onboarding.selectedService?.id as DeployInstanceBody['service_id'],
        domainId: onboarding.newDomain?.id as DeployInstanceBody['domain_id'],
        sharedAccess: onboarding.sharedAccess.map(user => user.email),
        // The step is open: the progress follows the deploy.
        inFlow: () => true,
      })
      return
    }
    const deploy = onboarding.gitDeploy
    if (!deploy) {
      return
    }
    if (deploy.mode === 'ssh') {
      await deployFromGitSsh({ branch: result.branch || deploy.branch || null, env_vars: result.env_vars ?? {} })
      return
    }
    await deployFromGit(deploy, result.branch || deploy.default_branch || null, result.env_vars ?? {})
  }

  /**
   * The Generate key request created the project. It is kept for the
   * SSH deploy and announced like any new instance.
   */
  function sshProjectCreated (project: Record<string, unknown>): void {
    onboarding.sshProject = project
    onboarding.newInstance = project
    emitAppEvent('instance-created', project)
  }

  /**
   * The zip modal's Next: the picked files are kept, then
   * the files sequence runs (domain, upload, preview, then the env vars step or the deploy). A result that arrives after the zip step closed
   * keeps nothing and starts nothing (step guard, as `gitRepoSelected`).
   */
  async function filesSelected (payload: { uploadItems: File[] }): Promise<void> {
    if (onboarding.step !== 'deploy-zip') {
      return
    }
    onboarding.uploadItems = payload.uploadItems
    await runFilesDeploy(filesDeployDeps(onboarding.run), {
      serviceId: onboarding.selectedService?.id as number | string,
      existingDomainId: (onboarding.newDomain?.id as number | string | undefined) ?? null,
      uploadItems: payload.uploadItems,
    })
  }

  /**
   * The effects of the files sequence, bound to the store and the requests; `run` is the run the sequence started in.
   * The copy comes from the i18n instance, as the other flow-side messages do. A failure keeps the run guard for the result flags and always
   * shows its alert (legacy catch).
   *
   * The service and the shared access are read here, while the flow is open: the sequence finishes its upload and its deploy after the flow
   * closed, and a closed flow's state is not the sequence's to read or write any more (`inFlow`).
   */
  function filesDeployDeps (run: number): FilesDeployDeps {
    const serviceId = onboarding.selectedService?.id as DeployInstanceBody['service_id']
    const sharedAccess = onboarding.sharedAccess.map(user => user.email)
    const inFlow = (): boolean => onboarding.run === run
    return {
      translate: (key, options) => String(i18next.t(key, options)),
      uploadMaxBytes: uploadMaxBytes(useSessionStore().home),
      listServiceDomains: service => listServiceDomains(service),
      createFilesDomain: (service, name) => createFilesDomain(service, name),
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
      openProgress: openDeployProgress,
      setNewDomain: domain => {
        if (inFlow()) {
          onboarding.newDomain = domain
        }
      },
      uploadFile: (file, contentType, query) => uploadDeployFile(file, contentType, query, filesCreateUploadSignal()),
      setRemoteFilePaths: paths => {
        if (inFlow()) {
          onboarding.remoteFilePaths = paths
        }
      },
      previewEnvExample: body => previewEnvExample(body),
      openEnvVars: context => {
        if (!inFlow()) {
          return false
        }
        onboarding.envVarsContext = context
        onboarding.show('env-vars')
        return true
      },
      finish: (remoteFilePaths, domainId) => finishFilesDeploy(remoteFilePaths, {}, { serviceId, domainId, sharedAccess, inFlow }),
      fail: error => {
        if (inFlow()) {
          onboarding.installationCompleted = true
          onboarding.installationError = true
        }
        useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      },
      setArchivePending: pending => {
        onboarding.filesArchiveUploadPending = pending
      },
      beginCreate: () => beginFilesCreate(),
      setCreateProject: projectId => setFilesCreateProject(projectId),
      isCancelled: projectId => filesCreateCancelled(projectId),
      createCancelled: projectId => onFilesCreateCancelled(projectId ?? null, inFlow),
      endCreate: () => endFilesCreate(),
      uploadSignal: () => filesCreateUploadSignal(),
    }
  }

  /**
   * The files create was cancelled: nothing was uploaded and nothing deploys, so the project the domain step created stays
   * waiting for its files, where its page offers Upload new version. An open flow closes on that page; a flow the user already
   * closed only gets the alert.
   */
  function onFilesCreateCancelled (projectId: number | string | null, inFlow: () => boolean): void {
    onboarding.filesArchiveUploadPending = false
    useAlertsStore().addAlert({ success: true, successMessage: String(i18next.t('notification.instance.installation.cancelled')) })
    if (!inFlow() || projectId === null || projectId === undefined) {
      return
    }
    gotoInstanceDetails(projectId)
  }

  /**
   * The progress window's Cancel Deploy. While a files create of this tab has not posted its deploy the Engine has nothing to
   * cancel: the sequence stops itself instead, upload and deploy. A deploy that was already posted is the window's own to cancel.
   */
  function cancelDeploy (): void {
    cancelFilesCreate()
  }

  /**
   * The progress opens, then the deploy posts the uploaded paths and the
   * env vars on the service and the domain the flow holds. The request's run guard is the store's. A sequence that outlived its closed flow
   * still deploys, with the target it read while the flow was open, and leaves the progress closed.
   */
  async function finishFilesDeploy (
    remoteFilePaths: string[],
    envVars: Record<string, string>,
    target: {
      serviceId: DeployInstanceBody['service_id']
      domainId: DeployInstanceBody['domain_id']
      sharedAccess: string[]
      inFlow: () => boolean
    },
  ): Promise<void> {
    if (target.inFlow()) {
      openDeployProgress()
    }
    try {
      await onboarding.deployInstanceRequest({
        service_id: target.serviceId,
        domain_id: target.domainId,
        shared_access: target.sharedAccess,
        source_type: 'files',
        remote_filepath: remoteFilePaths,
        env_vars: envVars,
      })
    } finally {
      // The deploy is the create's last step: its project has an ordinary deploy the Engine cancels from here on.
      endFilesCreate()
    }
  }

  /** The progress of a deploy opens with the result flags cleared. */
  function openDeployProgress (): void {
    onboarding.installationCompleted = false
    onboarding.installationError = false
    onboarding.show('install-progress')
  }

  /**
   * The progress opens before the request, then the deploy posts the repo
   * with its branch and env vars, on the service and the domain the flow holds. The request's run guard is the store's.
   */
  async function deployFromGit (deploy: GitDeploy, branch: string | null, envVars: Record<string, string>): Promise<void> {
    openDeployProgress()
    await onboarding.deployInstanceRequest({
      service_id: onboarding.selectedService?.id as DeployInstanceBody['service_id'],
      domain_id: onboarding.newDomain?.id as DeployInstanceBody['domain_id'],
      shared_access: onboarding.sharedAccess.map(user => user.email),
      source_type: 'git',
      repo_url: deploy.repo_url,
      token: deploy.token,
      branch,
      env_vars: envVars,
    })
  }

  /**
   * The PanelAlpha Go source: the app the catalog's details answered deploys through the git onboarding, as the default git
   * path does (`POST /instances/deploy` creates the `dind` project with the repository). The repository and branch are the `install` Go
   * gave for this app when its details opened, never a cached list's. Ignored when the catalog step is closed.
   */
  async function deployFromGo (app: GoAppDetails): Promise<void> {
    const install = app.install
    if (onboarding.step !== 'go-catalog' || !install?.git_repo) {
      return
    }
    openDeployProgress()
    await onboarding.deployInstanceRequest({
      service_id: onboarding.selectedService?.id as DeployInstanceBody['service_id'],
      domain_id: onboarding.newDomain?.id as DeployInstanceBody['domain_id'],
      shared_access: onboarding.sharedAccess.map(user => user.email),
      source_type: 'git',
      repo_url: install.git_repo,
      token: null,
      branch: install.git_branch ?? null,
      env_vars: {},
    })
  }

  /** The catalog's Back: the installation type choice when there is one to make, otherwise the flow closes. */
  function goCatalogBack (): void {
    if (availableInstallationTypes(activeServices(), typeOptions()).length > 1) {
      onboarding.show('choose-installation-type')
      return
    }
    closeOnBack()
  }

  /** The catalog's "Connect to PanelAlpha Hub": the flow closes and Settings opens on its PanelAlpha Hub card. */
  function goConnectHub (): void {
    onboarding.deactivateAll()
    onboarding.resetInstallation()
    void router.push({ name: 'settings' })
  }

  /**
   * The payload is kept for the progress' Try again, the progress opens
   * before the request, then the deploy posts the branch and the env vars to the project of the deploy key. Nothing happens without a project.
   */
  async function deployFromGitSsh (payload: DeployGitSshBody): Promise<void> {
    const id = onboarding.sshProject?.id
    if (typeof id !== 'number' && typeof id !== 'string') {
      return
    }
    onboarding.sshDeployPayload = payload
    openDeployProgress()
    await onboarding.deploySshInstanceRequest(id, payload)
  }

  /**
   * The method is kept on the import data, then the plugin (simple) or FTP
   * (advanced) step opens. Those steps come with their forms.
   */
  async function importMethodSelected (method: ImportMethod): Promise<void> {
    onboarding.importMethod = method
    await apply(resolveImportMethod(method))
  }

  /**
   * The import form's `import-instance` (its success
   * result carries the import details). The details join the import data; a second submit while the preparation runs does nothing.
   * The demo account gets the demo result. Otherwise the domain is created first: a failure keeps the form open with its alert. The
   * import answer then opens the setup-complete result, a failed one in its error state. A flow closed meanwhile posts no import and
   * opens nothing (run guard, as the install path). A form closed during its connection test starts nothing.
   */
  async function importInstanceStarted (details: Record<string, unknown>): Promise<void> {
    // Not in legacy: a form closed while its connection test ran still emits `import-instance`; a closed flow imports nothing.
    if (onboarding.importPreparing || (onboarding.step !== 'import-simple' && onboarding.step !== 'import-advanced')) {
      return
    }
    onboarding.importDetails = { ...onboarding.importDetails, ...details }
    if (input().isDemo) {
      // Not in legacy: the demo path holds the preparing guard too, so a second click within the 2 s delay does nothing.
      onboarding.importPreparing = true
      try {
        await importDemoInstance()
      } finally {
        onboarding.importPreparing = false
      }
      return
    }
    const run = onboarding.run
    onboarding.importPreparing = true
    try {
      const domainCreated = await onboarding.createImportDomain()
      if (!domainCreated || onboarding.run !== run) {
        return
      }
      const response = await onboarding.importInstance()
      if (onboarding.run !== run) {
        return
      }
      onboarding.importPreparationCompleted = true
      if (response) {
        onboarding.importedInstance = response.data
        onboarding.nameservers = response.meta.nameservers
      } else {
        onboarding.importPreparationError = true
      }
      onboarding.show('import-setup-complete')
    } finally {
      onboarding.importPreparing = false
    }
  }

  /**
   * The demo account gets
   * a sample result after 2 s with no request, and the `instance-created` event goes out as for a real create. The url `reject` fails
   * with no result.
   */
  async function importDemoInstance (): Promise<void> {
    if (onboarding.importUrl === DEMO_IMPORT_REJECT_URL) {
      return
    }
    const run = onboarding.run
    await new Promise(resolve => setTimeout(resolve, DEMO_IMPORT_DELAY_MS))
    if (onboarding.run !== run) {
      return
    }
    const instance = { url: 'https://example.com' }
    onboarding.importedInstance = instance
    onboarding.nameservers = [...DEMO_IMPORT_NAMESERVERS]
    emitAppEvent('instance-created', instance)
    // Deviation from legacy: it never sets the completed flag on the demo path, so its result
    // stays in-progress with no exit. The flag is set before the result opens, so the setup-complete modal gets its exit.
    onboarding.importPreparationCompleted = true
    onboarding.show('import-setup-complete')
  }

  /**
   * The instances list is replaced with a `reload`
   * query, which makes the list refetch, then the flow closes and clears what it left.
   */
  async function importSetupCompleted (): Promise<void> {
    await router.replace({ name: 'instances', query: { ...route.query, reload: String(Date.now()) } })
    onboarding.deactivateAll()
    onboarding.resetInstallation()
  }

  /**
   * The site name the user typed. The create runs only when the flow has no domain
   * (`runAfterSiteName`), then the progress and the install.
   */
  async function siteNameSelected (siteName: string): Promise<void> {
    onboarding.selectedSiteName = siteName
    await runAfterSiteName(installDeps(onboarding.run), installContext())
  }

  function sequenceContext (): DomainSequenceContext {
    return {
      service: onboarding.selectedService ?? undefined,
      installationType: onboarding.selectedInstallationType ?? 'wordpress',
      isDemo: input().isDemo === true,
    }
  }

  /** The service modal opens on the first active service, with no domain picked. */
  function changeServiceButtonClicked (): void {
    onboarding.selectedDomainName = null
    onboarding.newDomain = null
    resetSelectedService()
    onboarding.show('choose-service')
  }

  /** The template chooser opens with no template picked. */
  function changeThemeButtonClicked (): void {
    onboarding.selectedTheme = null
    onboarding.show('choose-template')
  }

  /** The step a service would lead to: the service modal names its primary button after it. */
  function nextAfterService (service: OnboardingService | null): CascadeResult | null {
    return service ? resolveAfterServiceChoice(input(), service, currentPath()) : null
  }

  /** Closes the flow, clears what it left, and shows the list route (`/projects` on single server). */
  function gotoDashboard (): void {
    onboarding.deactivateAll()
    onboarding.resetInstallation()
    const target = isSingleServerActive() ? '/projects' : '/instances'
    if (route.path !== target) {
      void router.push(target)
    }
  }

  /**
   * The progress' Try again with no arguments: the
   * installed instance's own `install_details` go straight to `retry-install`, with no form and no import branch. The open progress
   * goes back to in-progress; a failure shows the failed result with an alert.
   */
  async function tryAgain (): Promise<void> {
    const instance = onboarding.newInstance
    if (!instance) {
      return
    }
    const id = instance.id
    const installDetails = instance.install_details
    await onboarding.retryInstallInstance(
      typeof id === 'number' || typeof id === 'string' ? id : null,
      installDetails && typeof installDetails === 'object' ? installDetails as Record<string, unknown> : {},
    )
  }

  /**
   * A Try again of a standard or advanced
   * install opens the standard form in retry mode, filled from its `install_details`. The form opens over whatever step was open
   * (it closes the progress too).
   */
  function openRetryForm (instance: Record<string, unknown>): void {
    const id = instance.id
    onboarding.retryInstanceId = typeof id === 'number' || typeof id === 'string' ? id : null
    onboarding.standardFormPrefill = prefillFromInstallDetails(instance.install_details)
    onboarding.retryWithForm = true
    onboarding.show('standard-form')
  }

  /**
   * The form's values go to
   * `retry-install`, success goes to the dashboard and a failure keeps the form's alert. Legacy goes back to an open progress
   * first, but `displayStandardForm` closed it, so from the form that branch never runs. A flow closed during the request stays put.
   */
  async function retryInstallInstanceFromForm (instanceId: number | string | null, form: Record<string, unknown>): Promise<void> {
    const run = onboarding.run
    const retried = await onboarding.retryInstallInstance(instanceId, form)
    if (retried && onboarding.run === run) {
      gotoDashboard()
    }
  }

  /** The progress' Manage site: the reset, the close, then the instance page. */
  function gotoInstanceDetails (id: number | string): void {
    onboarding.resetInstallation()
    onboarding.deactivateAll()
    void router.push(spa.spaPath(`${id}/general`))
  }

  /**
   * The progress' Manage site for the demo account: the event goes out
   * (no consumer in this change), the flow closes, and the route stays where it is.
   */
  function manageFirstInstance (): void {
    emitAppEvent('manage-first-instance')
    onboarding.deactivateAll()
  }

  /** Cancel of the key step before the connect removes the project Generate key created. */
  async function cancelSshProject (): Promise<void> {
    const project = onboarding.sshProject
    onboarding.sshProject = null
    onboarding.deactivateAll()
    const id = project?.id
    if (typeof id !== 'number' && typeof id !== 'string') {
      return
    }
    try {
      await removeAbandonedProject(id)
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return
    }
    emitAppEvent('instance-deleted', project ?? undefined)
  }

  /** The panel finishes a delete the Engine is too busy for; a 404 means the project is already gone. */
  async function removeAbandonedProject (id: number | string): Promise<void> {
    try {
      await deleteDeployKeyProject(id)
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status !== 404) {
        throw error
      }
    }
  }

  /**
   * The Git and env vars steps close the flow. With the project that
   * Generate key created, the closing window opens instead, and the project stays for its two exits.
   */
  function closeGitModal (): void {
    onboarding.deactivateAll()
    if (onboarding.sshProject) {
      onboarding.sshClosingOpen = true
    }
  }

  /** Close goes to the dashboard and forgets the project. */
  function closeSshClosing (): void {
    onboarding.sshClosingOpen = false
    gotoDashboard()
    onboarding.sshProject = null
  }

  /** The flow resets and the project's Git tab opens. */
  function goToGitTab (): void {
    const id = onboarding.sshProject?.id
    onboarding.sshClosingOpen = false
    onboarding.resetInstallation()
    onboarding.sshProject = null
    if (typeof id === 'number' || typeof id === 'string') {
      void router.push(spa.spaPath(`${id}/advanced/git`))
    }
  }

  /**
   * The progress' Try again replays the SSH deploy when the flow holds
   * the project of its key and the last SSH payload; otherwise it is the dashboard retry (`tryAgain`).
   */
  async function progressTryAgain (): Promise<void> {
    const payload = onboarding.sshDeployPayload
    if (onboarding.sshProject && payload) {
      await deployFromGitSsh(payload)
      return
    }
    await tryAgain()
  }

  return {
    start,
    startDemoProcess,
    demoOnboardingSelected,
    manageFirstInstance,
    cancelSshProject,
    closeGitModal,
    closeSshClosing,
    goToGitTab,
    progressTryAgain,
    cancelDeploy,
    startSync,
    installationTypeSelected,
    creationTypeSelected,
    serviceSelected,
    themeSelected,
    sharedAccessSet,
    userConfigurableOptionsSelected,
    domainSelected,
    transferDomain,
    domainVerified,
    installInstanceFromStandardForm,
    importUrlSelected,
    gitRepoSelected,
    envVarsSelected,
    sshProjectCreated,
    deployFromGitSsh,
    deployFromGo,
    goCatalogBack,
    goConnectHub,
    filesSelected,
    startFromFilesDrop,
    importMethodSelected,
    importInstanceStarted,
    importSetupCompleted,
    siteNameSelected,
    changeServiceButtonClicked,
    changeThemeButtonClicked,
    currentPath,
    nextAfterService,
    gotoDashboard,
    gotoInstanceDetails,
    tryAgain,
    openRetryForm,
    retryInstallInstanceFromForm,
  }
}
