<template>
  <div>
    <OnboardingZeroDataModal
      :model-value="step === 'zero-data'"
      @go-back="onboarding.deactivateAll"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingNoInstallationTypeModal
      :model-value="step === 'no-type'"
      @go-back="onboarding.deactivateAll"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingChooseInstallationTypeModal
      v-model:selected="onboarding.selectedInstallationType"
      :available="availableTypes"
      :go-locked="session.home?.app?.hub_paired === false"
      :loading="onboarding.submitting"
      :model-value="step === 'choose-installation-type'"
      @connect-hub="flow.goConnectHub"
      @next="flow.installationTypeSelected"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingChooseOnboardingProcessModal
      :model-value="step === 'choose-onboarding-process'"
      :ready-to-render="readyToRender"
      @demo-onboarding-selected="$emit('demo-onboarding-selected', $event)"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingChooseCreationTypeModal
      :loading="onboarding.submitting"
      :model-value="step === 'choose-creation-type'"
      @next="flow.creationTypeSelected"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingImportUrlModal
      :is-open="step === 'import-url'"
      :loading="onboarding.submitting"
      :max-steps="importSteps"
      @remove-modal="onboarding.deactivateAll"
      @url-selected="flow.importUrlSelected"
    />

    <OnboardingChooseImportMethodModal
      :max-steps="importSteps"
      :model-value="step === 'import-method'"
      @import-method-selected="flow.importMethodSelected"
      @remove-modal="onboarding.deactivateAll"
    />

    <!-- The preparation locks the import forms too, so the loading state is the submit's or the preparation's. -->
    <OnboardingImportSimpleMethodModal
      :import-ip="onboarding.importIp"
      :import-url="onboarding.importUrl"
      :is-open="step === 'import-simple'"
      :loading="onboarding.submitting || onboarding.importPreparing"
      :max-steps="importSteps"
      :service-id="onboarding.selectedService?.id ?? null"
      @import-instance="flow.importInstanceStarted"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingImportAdvancedMethodModal
      :import-url="onboarding.importUrl"
      :is-open="step === 'import-advanced'"
      :loading="onboarding.submitting || onboarding.importPreparing"
      :max-steps="importSteps"
      :service-id="onboarding.selectedService?.id ?? null"
      @import-instance="flow.importInstanceStarted"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingDeployFromGitModal
      :domain-id="newDomainId"
      :is-open="step === 'deploy-git'"
      :loading="onboarding.submitting"
      :service-id="onboarding.selectedService?.id ?? null"
      :shared-access="onboarding.sharedAccess.map(user => user.email)"
      @cancel-created-project="flow.cancelSshProject"
      @deploy-key-created="flow.sshProjectCreated($event.project)"
      @next="flow.gitRepoSelected"
      @remove-modal="flow.closeGitModal"
    />

    <OnboardingEnvVarsModal
      :context="onboarding.envVarsContext"
      :is-open="step === 'env-vars'"
      :loading="onboarding.submitting"
      @next="flow.envVarsSelected"
      @remove-modal="flow.closeGitModal"
    />

    <!-- A Git or env vars step closed after its project was created. -->
    <AppDialog
      v-model="onboarding.sshClosingOpen"
      :close-on-back="false"
      data-testid="onboarding-ssh-closing-modal"
      max-width="480"
      @close="flow.closeSshClosing"
    >
      <v-card class="onboarding-modal ssh-closing-card">
        <v-card-text class="px-8 pt-8">
          {{ t('heading.onboarding.gitDeploy.closing.message') }}
        </v-card-text>

        <v-card-actions class="px-8 pb-8 pt-4 justify-end">
          <AppButton
            variant="text"
            @click="flow.closeSshClosing"
          >
            {{ ' ' + t('button.close') + ' ' }}
          </AppButton>

          <AppButton
            class="ml-2"
            kind="primary"
            @click="flow.goToGitTab"
          >
            <span class="font-weight-bold">
              {{ ' ' + t('button.onboarding.gitDeploy.goToGitTab') + ' ' }}
            </span>
          </AppButton>
        </v-card-actions>
      </v-card>
    </AppDialog>

    <!-- The PanelAlpha Go source: Go's catalog, full page; its app's repository deploys through the git onboarding. -->
    <OnboardingGoCatalogModal
      :deploying="onboarding.submitting"
      :model-value="step === 'go-catalog'"
      @connect-hub="flow.goConnectHub"
      @deploy="flow.deployFromGo"
      @go-back="flow.goCatalogBack"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingDeployFromZipModal
      :is-open="step === 'deploy-zip'"
      :loading="onboarding.submitting"
      @next="flow.filesSelected"
      @remove-modal="onboarding.deactivateAll"
    />

    <!-- The import result (in-progress, success with the domain link, failure). -->
    <OnboardingImportInstanceSetupCompleteModal
      :completed="onboarding.importPreparationCompleted"
      :error="onboarding.importPreparationError"
      :imported-instance="onboarding.importedInstance"
      :is-open="step === 'import-setup-complete'"
      :nameservers="onboarding.nameservers"
      @next="flow.importSetupCompleted"
    />

    <OnboardingChooseServiceModal
      v-model:selected-service="onboarding.selectedService"
      :action-key="serviceActionKey"
      :is-import="onboarding.creationType === 1"
      :loading="onboarding.submitting"
      :model-value="step === 'choose-service'"
      :services="onboarding.serviceChoices ?? activeServices"
      @go-back="flow.gotoDashboard"
      @remove-modal="onboarding.deactivateAll"
      @service-selected="flow.serviceSelected"
    />

    <OnboardingLimitModal
      :model-value="step === 'limit'"
      :selected-service="onboarding.selectedService"
      @go-back="onboarding.deactivateAll"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingChooseTemplateModal
      :loading="onboarding.submitting"
      :loading-text="onboarding.loadingText"
      :model-value="step === 'choose-template'"
      :service="onboarding.selectedService"
      @go-back="flow.gotoDashboard"
      @theme-selected="flow.themeSelected"
    />

    <OnboardingShareAccessModal
      :installation-type="onboarding.selectedInstallationType ?? 'wordpress'"
      :is-import="onboarding.creationType === 1"
      :loading="onboarding.submitting"
      :loading-text="onboarding.loadingText"
      :max-steps="importSteps"
      :model-value="step === 'share-access'"
      :service="onboarding.selectedService"
      :services="activeServices"
      :theme="onboarding.selectedTheme"
      @change-service-button-clicked="flow.changeServiceButtonClicked"
      @change-theme-button-clicked="flow.changeThemeButtonClicked"
      @remove-modal="onboarding.deactivateAll"
      @shared-access-set="flow.sharedAccessSet"
    />

    <OnboardingChooseUserConfigurableOptionsModal
      :installation-type="onboarding.selectedInstallationType ?? 'wordpress'"
      :is-import="onboarding.creationType === 1"
      :loading="onboarding.submitting"
      :loading-text="onboarding.loadingText"
      :max-steps="importSteps"
      :model-value="step === 'user-options'"
      :option-values="onboarding.instanceOptions"
      :service="onboarding.selectedService"
      :services="activeServices"
      :theme="onboarding.selectedTheme"
      @change-service-button-clicked="flow.changeServiceButtonClicked"
      @change-theme-button-clicked="flow.changeThemeButtonClicked"
      @remove-modal="onboarding.deactivateAll"
      @user-configurable-options-selected="flow.userConfigurableOptionsSelected"
    />

    <OnboardingChooseDomainModal
      :installation-type="onboarding.selectedInstallationType ?? 'wordpress'"
      :loading="onboarding.submitting || onboarding.loading"
      :loading-text="onboarding.loadingText"
      :model-value="step === 'domain'"
      :service="onboarding.selectedService"
      :services="activeServices"
      :theme="onboarding.selectedTheme"
      @change-service-button-clicked="flow.changeServiceButtonClicked"
      @change-theme-button-clicked="flow.changeThemeButtonClicked"
      @domain-selected="flow.domainSelected"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingDomainTransferModal
      :domain="onboarding.selectedDomainName"
      :domain-verification-record="onboarding.domainTransferDnsRecord"
      :loading="onboarding.loading"
      :loading-text="onboarding.loadingText"
      :model-value="step === 'domain-transfer'"
      :service="onboarding.selectedService"
      :services="activeServices"
      @change-service-button-clicked="flow.changeServiceButtonClicked"
      @remove-modal="onboarding.deactivateAll"
      @transfer-domain="flow.transferDomain"
      @verification-record-updated="onboarding.domainTransferDnsRecord = $event ?? {}"
    />

    <OnboardingDomainInstantVerificationModal
      :domain="onboarding.selectedDomainName"
      :installation-type="onboarding.selectedInstallationType ?? 'wordpress'"
      :loading="onboarding.submitting"
      :model-value="step === 'dns-verify'"
      :new-domain="onboarding.newDomain"
      :service="onboarding.selectedService"
      @domain-verified="flow.domainVerified"
      @remove-modal="onboarding.deactivateAll"
    />

    <OnboardingChooseSiteNameModal
      :loading="onboarding.submitting"
      :model-value="step === 'site-name'"
      :service="onboarding.selectedService"
      :services="activeServices"
      :theme="onboarding.selectedTheme"
      @change-service-button-clicked="flow.changeServiceButtonClicked"
      @change-theme-button-clicked="flow.changeThemeButtonClicked"
      @remove-modal="onboarding.deactivateAll"
      @site-name-selected="flow.siteNameSelected"
    />

    <OnboardingStandardFormModal
      :loading="onboarding.submitting"
      :model-value="step === 'standard-form'"
      :prefill="onboarding.standardFormPrefill"
      :retry="onboarding.retryWithForm"
      :retry-instance-id="onboarding.retryInstanceId"
      :service="onboarding.selectedService"
      @install-instance="flow.installInstanceFromStandardForm"
      @remove-modal="onboarding.deactivateAll"
      @retry-install-instance="flow.retryInstallInstanceFromForm"
    />

    <OnboardingInstallationInProgressModal
      :archive-pending="onboarding.filesArchiveUploadPending"
      :completed="onboarding.installationCompleted"
      :custom-deploy="isCustomDeploy"
      :demo="isDemo"
      :error="onboarding.installationError"
      :installed-instance="onboarding.newInstance"
      :installed-instance-dns-mismatch="onboarding.dnsMismatch"
      :instance-id="newInstanceId"
      :model-value="step === 'install-progress'"
      :source="deploySource"
      :theme="onboarding.selectedTheme"
      @cancel-deploy="flow.cancelDeploy"
      @go-to-dashboard="flow.gotoDashboard"
      @go-to-details="flow.gotoInstanceDetails"
      @manage-first-instance="flow.manageFirstInstance"
      @try-again="flow.progressTryAgain"
    />

    <OnboardingSuperQuickInstallationProgressModal
      :completed="onboarding.installationCompleted"
      :error="onboarding.installationError"
      :installed-instance="onboarding.newInstance"
      :installed-instance-dns-mismatch="onboarding.dnsMismatch"
      :model-value="step === 'super-quick-progress'"
      :service="onboarding.selectedService"
      :show-start-creating-button="onboarding.showStartCreatingButton"
      @go-to-dashboard="flow.gotoDashboard"
      @go-to-details="flow.gotoInstanceDetails"
      @try-again="flow.tryAgain"
    />

    <!-- No `try-again` binding, as legacy (its Try button stays dead). -->
    <OnboardingSyncInstancesProgressModal
      :completed="onboarding.installationCompleted"
      :error="onboarding.installationError"
      :model-value="step === 'sync-progress'"
      @go-to-dashboard="flow.gotoDashboard"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { DeploySource } from '@/entities/project/ui/deploy/deploy-steps'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import { isDemoAccount } from './demo'
  import { isCustomDeployType } from './install-sequence'
  import { useRevealedStep } from './lazy-modals'
  import OnboardingChooseCreationTypeModal from './modals/OnboardingChooseCreationTypeModal.vue'
  import OnboardingChooseDomainModal from './modals/OnboardingChooseDomainModal.vue'
  import OnboardingChooseImportMethodModal from './modals/OnboardingChooseImportMethodModal.vue'
  import OnboardingChooseInstallationTypeModal from './modals/OnboardingChooseInstallationTypeModal.vue'
  import OnboardingChooseOnboardingProcessModal from './modals/OnboardingChooseOnboardingProcessModal.vue'
  import OnboardingChooseServiceModal from './modals/OnboardingChooseServiceModal.vue'
  import OnboardingChooseSiteNameModal from './modals/OnboardingChooseSiteNameModal.vue'
  import OnboardingChooseTemplateModal from './modals/OnboardingChooseTemplateModal.vue'
  import OnboardingChooseUserConfigurableOptionsModal from './modals/OnboardingChooseUserConfigurableOptionsModal.vue'
  import OnboardingDeployFromGitModal from './modals/OnboardingDeployFromGitModal.vue'
  import OnboardingDeployFromZipModal from './modals/OnboardingDeployFromZipModal.vue'
  import OnboardingDomainInstantVerificationModal from './modals/OnboardingDomainInstantVerificationModal.vue'
  import OnboardingDomainTransferModal from './modals/OnboardingDomainTransferModal.vue'
  import OnboardingEnvVarsModal from './modals/OnboardingEnvVarsModal.vue'
  import OnboardingGoCatalogModal from './modals/OnboardingGoCatalogModal.vue'
  import OnboardingImportAdvancedMethodModal from './modals/OnboardingImportAdvancedMethodModal.vue'
  import OnboardingImportInstanceSetupCompleteModal from './modals/OnboardingImportInstanceSetupCompleteModal.vue'
  import OnboardingImportSimpleMethodModal from './modals/OnboardingImportSimpleMethodModal.vue'
  import OnboardingImportUrlModal from './modals/OnboardingImportUrlModal.vue'
  import OnboardingInstallationInProgressModal from './modals/OnboardingInstallationInProgressModal.vue'
  import OnboardingLimitModal from './modals/OnboardingLimitModal.vue'
  import OnboardingNoInstallationTypeModal from './modals/OnboardingNoInstallationTypeModal.vue'
  import OnboardingShareAccessModal from './modals/OnboardingShareAccessModal.vue'
  import OnboardingStandardFormModal from './modals/OnboardingStandardFormModal.vue'
  import OnboardingSuperQuickInstallationProgressModal from './modals/OnboardingSuperQuickInstallationProgressModal.vue'
  import OnboardingSyncInstancesProgressModal from './modals/OnboardingSyncInstancesProgressModal.vue'
  import OnboardingZeroDataModal from './modals/OnboardingZeroDataModal.vue'
  import { useOnboardingFlow } from './onboarding-flow'
  import { availableInstallationTypes, getActiveServices, type OnboardingService } from './onboarding-service'
  import { importStepCount, serviceActionLabelKey } from './onboarding-steps'
  import { useOnboardingStore } from './onboarding.store'

  // The chunk of the 26 modals (perf-onboarding-lazy). `OnboardingModalWrapper` keeps the start-up logic (demo autostart, backdrop,
  // `beforeunload`, the list of steps it closes) in the entry file and mounts this component when a step opens.
  defineProps<{
    /** The wrapper's autostart: the process choice shows its demo copy while the shell is hidden. */
    readyToRender: boolean
  }>()

  defineEmits<{
    'demo-onboarding-selected': [classic: boolean]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const onboarding = useOnboardingStore()
  const flow = useOnboardingFlow()
  // The first mount shows no step for one tick, so the first open is still a closed → open change (see `useRevealedStep`).
  const step = useRevealedStep(() => onboarding.step)
  // The demo account's progress modal.
  const isDemo = computed(() => isDemoAccount(session.user?.email))
  // The git and files installations show the deploy logs in their progress.
  const isCustomDeploy = computed(() => isCustomDeployType(onboarding.selectedInstallationType))
  // The custom deploy's source: the live logs name their steps after it (a files deploy has no repository to clone).
  const deploySource = computed<DeploySource | null>(() => {
    const type = onboarding.selectedInstallationType
    if (type === 'go') {
      // A PanelAlpha Go app deploys from its repository: the git steps.
      return 'git'
    }
    return type === 'files' || type === 'git' ? type : null
  })
  // The deploy logs follow the instance the install request returned.
  const newInstanceId = computed<number | string | null>(() => {
    const id = onboarding.newInstance?.id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  })
  // The domain the install runs on, passed to the deploy key request.
  const newDomainId = computed<number | string | null>(() => {
    const id = onboarding.newDomain?.id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  })
  const activeServices = computed(() => getActiveServices(session.services as OnboardingService[]))
  // The PanelAlpha Go source only on the Community panel, which reads PanelAlpha Go's catalog (`/api/free/go`).
  const availableTypes = computed(() => availableInstallationTypes(activeServices.value, { go: session.home?.app?.community_panel === true }))
  // The step count of the import flow, one more for the share access and the user options.
  const importSteps = computed(() => importStepCount(
    { services: session.services as OnboardingService[], isReseller: session.user?.reseller_settings != null },
    onboarding.selectedService ?? undefined,
  ))

  // The service modal names its button after the step that follows the chosen service.
  const serviceActionKey = computed(() => serviceActionLabelKey(
    flow.currentPath(),
    flow.nextAfterService(onboarding.selectedService),
    onboarding.selectedService ?? undefined,
  ))

</script>

<style lang="scss" scoped>
  // Legacy closing window (`max-width="480"`, no inline width): the global 720px card width is capped at the 480px dialog.
  .v-card.ssh-closing-card {
    width: 100%;
    max-width: 480px;
  }

  // V2 `.v-card > :first-child` inherits the card radius (8px), V4 `.v-card-text` has none.
  .ssh-closing-card :deep(.v-card-text) {
    border-top-left-radius: inherit;
    border-top-right-radius: inherit;
  }
</style>
