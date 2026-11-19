import type { InstallationTypeKey, OnboardingService } from './onboarding-service'
import type { ImportMethod, OnboardingSource, OnboardingStep } from './onboarding-steps'
import type { DeployGitSshBody, DeployInstanceBody, EnvExamplePreview, EnvVariable, ImportInstanceResponse, InstallInstanceBody, OnboardingTheme } from './onboarding.api'
import type { StandardFormPrefill } from './standard-form'
import type { ServiceInstanceOptions } from '@/entities/project/instance-actions.api'
import type { ShareUser } from '@/entities/project/ui/share-instance'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type DomainVerification, verifyDomain } from '@/entities/domain/domain-verification.api'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { getServiceInstanceOptions, retryInstall as retryInstallRequest } from '@/entities/project/instance-actions.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { emit as emitAppEvent, type FilesDropPayload } from '@/shared/events/app-events'
import { propagationInput } from './domain-dns'
import { disarmBackButton } from './onboarding-history'
import { createImportDomain as createImportDomainRequest, createServiceDomain, deployGitSsh, deployInstance, importInstance as importInstanceRequest, installServiceInstance } from './onboarding.api'

/** The git deploy the git form hands on: the repo, its branches and the example env preview. */
export interface GitDeploy {
  repo_url: string
  /** `null` for a public repo. */
  token: string | null
  branches: string[]
  default_branch: string | null
  preview: EnvExamplePreview
  /** The repo is an SSH address deployed with a deploy key. The HTTPS fields stay `null` / empty there. */
  mode?: 'ssh'
  /** SSH only: the branch the connect request kept. */
  branch?: string | null
  /** SSH only: the connected remote has no such branch. */
  branch_missing?: boolean
}

/**
 * The env vars step's context: the source, the example variables, and the branch or the uploaded file the
 * preview came from.
 */
export interface EnvVarsContext {
  source: 'git' | 'files'
  variables: EnvVariable[]
  hasExample: boolean
  branches: string[]
  branch: string | null
  /** The uploaded file the files preview read (the first of `remoteFilePaths`). */
  remoteFilepath?: string
  /** The git repo the branch select previews again. */
  repoUrl?: string | null
  /** The git token of the repo, sent with a branch preview. */
  token?: string | null
  /** The preview of `variables` is already read: no request on open. */
  previewReady?: boolean
  /** SSH deploy-key source: the step deploys with the branch it is given. */
  sshMode?: boolean
  /** SSH only: the branch the connect request kept is missing on the remote. */
  branchMissing?: boolean
  /** SSH only: the branch that was connected and is missing. */
  missingBranch?: string | null
}

/** The description the sign-up page keeps for the install. */
function siteDescriptionKey (): string {
  return `${window.location.origin}-new-site-description`
}

/** The trimmed description, or an empty string. Storage can throw when the browser blocks site data: then there is none. */
function readSiteDescription (): string {
  try {
    const raw = localStorage.getItem(siteDescriptionKey())
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

function clearSiteDescription (): void {
  try {
    localStorage.removeItem(siteDescriptionKey())
  } catch {
    // Blocked storage: nothing to clear.
  }
}

/** The spinner holds this long after the answer, "for UX". */
export const INSTANCE_OPTIONS_HOLD_MS = 1500

/**
 * One open onboarding modal at a time (`step`), and the
 * source of the flow. The selections of the later steps join this store.
 */
export const useOnboardingStore = defineStore('onboarding', () => {
  const step = ref<OnboardingStep | null>(null)
  /** Bumped when a flow closes or starts again: a request of the flow that answers after that does not reopen it. */
  const run = ref(0)
  const source = ref<OnboardingSource>('start')
  /** The type the user picked, or the single enabled one. */
  const selectedInstallationType = ref<InstallationTypeKey | null>(null)
  /** 0 = Create, 1 = Import. */
  const creationType = ref<0 | 1 | null>(null)
  /** The service the flow works on (the first active one until the user picks another). */
  const selectedService = ref<OnboardingService | null>(null)
  /** The template the user picked (or the plan's default slug). */
  const selectedTheme = ref<OnboardingTheme | null>(null)
  /** The modal shows its loading overlay while a request of the flow runs. */
  const submitting = ref(false)
  /** The copy key of the overlay (`button.onboarding.preparing-installation`). */
  const loadingText = ref<string | null>(null)
  /** The options of the selected service from `getServiceInstanceOptions`. */
  const instanceOptions = ref<ServiceInstanceOptions | null>(null)
  /** The users invited on the share step, kept for the domain step. */
  const sharedAccess = ref<ShareUser[]>([])
  /** The values picked on the options step, kept for the domain step. */
  const selectedUserConfigurableOptions = ref<Record<string, unknown>>({})
  /** The verify and DNS requests of the domain step (`submitting` is the create and options requests). */
  const loading = ref(false)
  /** The domain the user typed on the domain step. */
  const selectedDomainName = ref<string | null>(null)
  /** The site name the user typed on the site name step. */
  const selectedSiteName = ref<string | null>(null)
  /** Legacy import url step: the WordPress url the user entered (scheme added), kept for the import steps. */
  const importUrl = ref<string | null>(null)
  /** Legacy import url step: the optional server ip of the advanced field, kept only when it is valid. */
  const importIp = ref<string | null>(null)
  /** The import method the user picked (plugin or FTP), kept for the import steps. */
  const importMethod = ref<ImportMethod | null>(null)
  /** Beyond url, ip and method: the details the plugin or FTP form hands on. */
  const importDetails = ref<Record<string, unknown>>({})
  /** The import submit runs (domain, then import). The import modals lock while it is set. */
  const importPreparing = ref(false)
  /** The import answered, success or failure, and the setup-complete result shows it. */
  const importPreparationCompleted = ref(false)
  /** The import request failed; the setup-complete result shows the failure. */
  const importPreparationError = ref(false)
  /** The instance the import created, shown by the setup-complete result. */
  const importedInstance = ref<Record<string, unknown>>({})
  /** The nameservers the import reports, shown by the setup-complete result. */
  const nameservers = ref<string[]>([])
  /** The email of the reseller user the share step picked (first of the list). */
  const delegatedUserEmail = ref<string | null>(null)
  /** The domain the create request returned (or the existing one), kept for the install request. */
  const newDomain = ref<Record<string, unknown> | null>(null)
  /** The instance the install request returned; the progress modal follows it. */
  const newInstance = ref<Record<string, unknown> | null>(null)
  /** The progress modal shows its result (success, failure or DNS mismatch). */
  const installationCompleted = ref(false)
  /** The result is a failure. */
  const installationError = ref(false)
  /** The installed site does not resolve to the server yet. */
  const dnsMismatch = ref(false)
  /** The DNS record the transfer step asks the user to set. */
  const domainTransferDnsRecord = ref<Record<string, unknown>>({})
  /** The values of the standard form, kept for the install request. */
  const newInstanceStandardForm = ref<Record<string, unknown>>({})
  /** The instance a Try again retry runs for (`retry-install` with the form). Kept after the retry, as legacy does. */
  const retryInstanceId = ref<number | string | null>(null)
  /** The standard form is open as a Try again (its Continue becomes Retry). Reset on close. */
  const retryWithForm = ref(false)
  /** The values a Try again opens the form with. Reset on close, so a new install starts without them. */
  const standardFormPrefill = ref<StandardFormPrefill | null>(null)
  /** Set on every finished result and on a failed SSO redirect (legacy never resets it). */
  const showStartCreatingButton = ref(false)
  /** The repo, its branches and the env preview the git form hands on. */
  const gitDeploy = ref<GitDeploy | null>(null)
  /** The env vars step's source and variables. */
  const envVarsContext = ref<EnvVarsContext | null>(null)
  /** The project the Generate key request created; its deploy and its Try again use it. */
  const sshProject = ref<Record<string, unknown> | null>(null)
  /** The branch and env vars of the last SSH deploy, replayed by the progress' Try again. */
  const sshDeployPayload = ref<DeployGitSshBody | null>(null)
  /** The closing window of a step closed after its project was created. */
  const sshClosingOpen = ref(false)
  /** The files of a drop or a picker, uploaded in order. */
  const uploadItems = ref<File[]>([])
  /** The paths the upload stored the files under, sent with the files deploy. */
  const remoteFilePaths = ref<string[]>([])
  /**
   * A files sequence is still uploading its archive. The upload is the browser's, so the deployment continues in the background only once it
   * is done: while this is set, leaving the page would leave the project waiting for files. The files sequence owns the flag (a closed flow
   * keeps it), so neither `resetInstallation` nor `deactivateAll` clears it.
   */
  const filesArchiveUploadPending = ref(false)
  /** A files drop on the project list started the flow, so the service step is not the first. */
  const filesDropLaunch = ref(false)
  /** The dropped files, kept until the flow's files sequence runs. */
  const pendingFilesDropPayload = ref<FilesDropPayload | null>(null)
  /** For the service modal: the services the files drop offers, `null` for the active ones. */
  const serviceChoices = ref<OnboardingService[] | null>(null)

  /** Opens one step. The source stays what the flow set (legacy keeps it until the flow is reset). */
  function show (next: OnboardingStep): void {
    step.value = next
  }

  /**
   * Every start, every Create/Import choice and the back
   * button begin from a clean flow. The service is picked again by the caller. `loading`, `retryInstanceId` and
   * `showStartCreatingButton` stay as they are, as in legacy.
   */
  function resetInstallation (): void {
    installationCompleted.value = false
    installationError.value = false
    newInstance.value = null
    dnsMismatch.value = false
    selectedTheme.value = null
    selectedService.value = null
    selectedDomainName.value = null
    selectedSiteName.value = null
    importUrl.value = null
    importIp.value = null
    importMethod.value = null
    importDetails.value = {}
    importPreparationCompleted.value = false
    importPreparationError.value = false
    delegatedUserEmail.value = null
    sharedAccess.value = []
    selectedUserConfigurableOptions.value = {}
    domainTransferDnsRecord.value = {}
    newInstanceStandardForm.value = {}
    newDomain.value = null
    gitDeploy.value = null
    envVarsContext.value = null
    sshProject.value = null
    sshDeployPayload.value = null
    sshClosingOpen.value = false
    uploadItems.value = []
    remoteFilePaths.value = []
    filesDropLaunch.value = false
    pendingFilesDropPayload.value = null
    serviceChoices.value = null
    source.value = 'start'
    selectedInstallationType.value = 'wordpress'
  }

  /** Closes whatever is open, releases the back button, and drops a pending files drop. */
  function deactivateAll (): void {
    disarmBackButton()
    step.value = null
    retryWithForm.value = false
    standardFormPrefill.value = null
    filesDropLaunch.value = false
    pendingFilesDropPayload.value = null
    gitDeploy.value = null
    envVarsContext.value = null
    run.value++
  }

  /**
   * The options request under the
   * "preparing" overlay. A failure becomes an alert; the flow goes on either way, and the overlay stays for the fixed hold.
   */
  async function loadInstanceOptions (serviceId: number | string): Promise<void> {
    submitting.value = true
    loadingText.value = 'button.onboarding.preparing-installation'
    try {
      const options = await getServiceInstanceOptions(serviceId)
      // An array (the API's empty value) counts as no options.
      instanceOptions.value = Array.isArray(options) ? {} : options
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      await new Promise(resolve => setTimeout(resolve, INSTANCE_OPTIONS_HOLD_MS))
      submitting.value = false
      loadingText.value = null
    }
  }

  /**
   * The domain the flow installs on, under the "create
   * domain" overlay. A failure becomes an alert and resolves false; the flow stays on its step.
   */
  async function createDomain (): Promise<boolean> {
    const serviceId = selectedService.value?.id
    if (serviceId === undefined || serviceId === null) {
      return false
    }
    submitting.value = true
    loadingText.value = 'button.onboarding.create-domain'
    try {
      newDomain.value = await createServiceDomain(serviceId, {
        domain: selectedDomainName.value,
        name: selectedSiteName.value,
        delegated_user_email: delegatedUserEmail.value,
        user_configurable_options: selectedUserConfigurableOptions.value,
      })
      return true
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return false
    } finally {
      submitting.value = false
      loadingText.value = null
    }
  }

  /**
   * The verify request under the "checking domain"
   * overlay. A failure becomes an alert and resolves null; the flow stays on the domain step (legacy's TypeError left the same
   * state: alert, buttons unlocked).
   */
  async function checkDomainAvailability (): Promise<DomainVerification | null> {
    const serviceId = selectedService.value?.id
    if (serviceId === undefined || serviceId === null) {
      return null
    }
    loading.value = true
    loadingText.value = 'button.onboarding.check-domain-availability'
    try {
      return await verifyDomain(serviceId, selectedDomainName.value ?? '')
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return null
    } finally {
      loading.value = false
      loadingText.value = null
    }
  }

  /**
   * The eager DNS check of the picked domain against the
   * service's hosting data. Resolves false without a service (the sequence only asks with one).
   */
  async function checkDnsPropagation (): Promise<boolean> {
    const service = selectedService.value
    if (!service) {
      return false
    }
    loading.value = true
    try {
      return await verifyDomainResolving(propagationInput(service, selectedDomainName.value ?? ''))
    } finally {
      loading.value = false
    }
  }

  /**
   * The install request of the picked service, domain, site name
   * and template. The standard form's fields spread after the base ones. A refused install is the progress' failure (nothing was
   * installed), with an alert for its message.
   */
  async function installInstance (): Promise<void> {
    const siteDescription = readSiteDescription()
    const startRun = run.value
    try {
      const body: InstallInstanceBody = {
        service_id: selectedService.value?.id,
        domain_id: newDomain.value?.id as InstallInstanceBody['domain_id'],
        install_method: selectedService.value?.install_method,
        name: selectedSiteName.value,
        theme: selectedTheme.value?.slug,
        shared_access: sharedAccess.value.map(user => user.email),
        ...newInstanceStandardForm.value,
        ...(siteDescription ? { site_description: siteDescription } : {}),
      }
      const instance = await installServiceInstance(body)
      emitAppEvent('instance-created', instance)
      // A response after the flow closed or restarted still updates the list, but not the next flow's state (run guard).
      if (run.value === startRun) {
        newInstance.value = instance
      }
      if (siteDescription) {
        clearSiteDescription()
      }
    } catch (error) {
      if (run.value === startRun) {
        installationCompleted.value = true
        installationError.value = true
      }
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  /**
   * The domain the import runs on, kept in `newDomain` for the
   * import request. The url is the one the URL step kept. A failure becomes an alert and resolves false; the flow stays on its step.
   */
  async function createImportDomain (): Promise<boolean> {
    const serviceId = selectedService.value?.id
    if (serviceId === undefined || serviceId === null) {
      return false
    }
    try {
      newDomain.value = await createImportDomainRequest(serviceId, importUrl.value ?? '', delegatedUserEmail.value, selectedUserConfigurableOptions.value)
      return true
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return false
    }
  }

  /**
   * The import request. The body is the url step's data, the ip
   * when the advanced field kept one, then the form's details (they win on a shared key, as legacy spreads them), the domain, the method
   * and the shared users. A failure becomes an alert and resolves null.
   */
  async function importInstance (): Promise<ImportInstanceResponse | null> {
    const method = importMethod.value ?? 'plugin'
    try {
      return await importInstanceRequest({
        url: importUrl.value ?? '',
        method,
        ...(importIp.value ? { ip_address: importIp.value } : {}),
        ...importDetails.value,
        service_id: selectedService.value?.id,
        domain_id: newDomain.value?.id,
        type: method,
        shared_access: sharedAccess.value.map(user => user.email),
      })
    } catch (error) {
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return null
    }
  }

  /**
   * Retries the install with the standard form's values as the body:
   * `PUT /instances/{id}/retry-install` under `submitting`. Resolves true on success, so the caller goes on (dashboard or progress).
   * A failure sets the failed result and an alert. Without an instance id no request goes out.
   */
  async function retryInstallInstance (instanceId: number | string | null | undefined, form: Record<string, unknown>): Promise<boolean> {
    if (submitting.value || instanceId === null || instanceId === undefined || instanceId === '') {
      return false
    }
    submitting.value = true
    installationCompleted.value = false
    installationError.value = false
    try {
      emitAppEvent('instance-item-changed', await retryInstallRequest(instanceId, form))
      return true
    } catch (error) {
      installationCompleted.value = true
      installationError.value = true
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return false
    } finally {
      submitting.value = false
    }
  }

  /**
   * The git and files deploy request: `POST /instances/deploy`
   * under the progress the flow already opened, for the git repo or the uploaded files. Success emits `instance-created` and keeps the
   * instance for the progress; a failure shows the failed result and an alert. A flow closed or restarted during the request keeps the next
   * flow's state (run guard, as `installInstance`).
   */
  async function deployInstanceRequest (body: DeployInstanceBody): Promise<void> {
    const startRun = run.value
    try {
      const instance = await deployInstance(body)
      emitAppEvent('instance-created', instance)
      if (run.value === startRun) {
        newInstance.value = instance
      }
    } catch (error) {
      if (run.value === startRun) {
        installationCompleted.value = true
        installationError.value = true
      }
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  /**
   * The SSH deploy request: `POST /instances/{id}/git/deploy` under the progress the
   * flow already opened. Unlike `deployInstanceRequest` it does not announce the instance: the project was announced when its key was
   * created. A flow closed or restarted during the request keeps the next flow's state (run guard, as `deployInstanceRequest`).
   */
  async function deploySshInstanceRequest (projectId: number | string, body: DeployGitSshBody): Promise<void> {
    const startRun = run.value
    try {
      const instance = await deployGitSsh(projectId, body)
      if (run.value === startRun) {
        newInstance.value = instance
      }
    } catch (error) {
      if (run.value === startRun) {
        installationCompleted.value = true
        installationError.value = true
      }
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  return {
    step,
    run,
    source,
    selectedInstallationType,
    creationType,
    selectedService,
    selectedTheme,
    submitting,
    loadingText,
    instanceOptions,
    sharedAccess,
    selectedUserConfigurableOptions,
    loading,
    selectedDomainName,
    selectedSiteName,
    importUrl,
    importIp,
    importMethod,
    importDetails,
    importPreparing,
    importPreparationCompleted,
    importPreparationError,
    importedInstance,
    nameservers,
    delegatedUserEmail,
    newDomain,
    newInstance,
    installationCompleted,
    installationError,
    dnsMismatch,
    domainTransferDnsRecord,
    newInstanceStandardForm,
    retryInstanceId,
    retryWithForm,
    standardFormPrefill,
    showStartCreatingButton,
    gitDeploy,
    envVarsContext,
    sshProject,
    sshDeployPayload,
    sshClosingOpen,
    uploadItems,
    remoteFilePaths,
    filesArchiveUploadPending,
    filesDropLaunch,
    pendingFilesDropPayload,
    serviceChoices,
    show,
    resetInstallation,
    deactivateAll,
    loadInstanceOptions,
    createDomain,
    checkDomainAvailability,
    checkDnsPropagation,
    installInstance,
    createImportDomain,
    importInstance,
    retryInstallInstance,
    deployInstanceRequest,
    deploySshInstanceRequest,
  }
})
