<template>
  <AppDialog
    v-model="opened"
    :persistent="isRedeployPersistent(phase, form.submitting)"
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @click:outside="close"
  >
    <BasicModal
      :buttons="formButtons"
      close-testid="files-upload-close-icon"
      data-testid="files-upload-modal"
      :submitting="form.submitting && phase === 'form'"
      :title="t('heading.instance.siteDetails.uploadVersion.title')"
      :width="redeployDialogWidth(phase)"
      @button-click="onFormButton"
      @modal-close="close"
    >
      <template #custom>
        <p
          v-if="currentKey && phase === 'form'"
          class="p-3 text-gray-darken-1 mb-4"
          data-testid="files-upload-current"
        >
          {{ t(currentKey, { date: dateLabel, size: sizeLabel }) }}
        </p>

        <div v-if="phase === 'form'">
          <drop-zone
            accept=".zip,.tar.gz"
            data-testid="files-upload-dropzone"
            :disabled="!canOpenFilePicker(form)"
            :hint="t('heading.instance.siteDetails.uploadVersion.dropZone.hint', { size: uploadLimitLabel })"
            input-testid="files-upload-input"
            :items="uploadItems"
            label-testid="files-upload-filename"
            :remove-disabled="form.submitting"
            :remove-label="t('button.remove')"
            remove-testid="files-upload-clear"
            :title="t('heading.instance.siteDetails.uploadVersion.dropZone.title')"
            @files="onFiles"
            @remove="onClearFile"
          />

          <AppMessage
            v-if="errorMessage"
            class="mt-5"
            data-testid="files-upload-error"
            icon="$alertcircle"
            variant="error"
          >
            <b>{{ errorMessage }}</b>
          </AppMessage>

          <v-progress-linear
            v-if="form.uploadPercent !== null"
            class="mt-4"
            color="primary"
            data-testid="files-upload-progress"
            height="4"
            :model-value="form.uploadPercent"
          />

          <deploy-steps
            v-model="form.skippedSteps"
            class="mt-6"
            :disabled="form.submitting"
            :note="t('heading.instance.siteDetails.redeploy.steps.basedOnCurrent')"
            :steps="uploadDeploySteps(form)"
          />

          <div
            v-if="stagingCheckbox"
            class="mt-2"
          >
            <checkbox
              color="primary"
              data-testid="files-upload-staging"
              :disabled="form.submitting"
              :label="t('heading.instance.siteDetails.uploadVersion.deployStaging')"
              :model-value="form.deployStaging"
              @update:model-value="onDeployStagingChange"
            />

            <div class="option-sub text-gray-darken-1">
              {{ t('heading.instance.siteDetails.uploadVersion.deployStaging.hint') }}
            </div>
          </div>
        </div>

        <div v-else>
          <deploy-logs-viewer
            :current-stage="logs.currentStage.value"
            :error="logs.error.value"
            :lines="logs.lines.value"
            live
            source="files"
            :stages="logs.stages.value"
            :status="logs.status.value"
            :warning="logs.warning.value"
          />
        </div>
      </template>

      <template
        v-if="phase === 'logs'"
        #actions
      >
        <template v-if="viewerRunning">
          <AppButton
            v-if="!confirmingCancel"
            color="error"
            data-testid="files-upload-cancel-deploy"
            :disabled="logs.cancelling.value"
            kind="link"
            @click="confirmingCancel = true"
          >
            {{ t('deployLogs.cancelDeploy') }}
          </AppButton>

          <div
            v-else
            class="d-flex align-center flex-wrap"
          >
            <span class="text-error p-4 mr-2">
              {{ t('deployLogs.cancelConfirmTitle') }}
            </span>

            <AppButton
              kind="danger"
              :loading="logs.cancelling.value"
              size="small"
              @click="cancelDeploy"
            >
              {{ t('button.confirm') }}
            </AppButton>

            <AppButton
              :disabled="logs.cancelling.value"
              kind="text"
              size="small"
              @click="confirmingCancel = false"
            >
              {{ t('button.cancel') }}
            </AppButton>
          </div>
        </template>

        <v-spacer />

        <AppButton
          v-if="viewerDownloadLogId"
          kind="link"
          :loading="logs.downloading.value"
          @click="logs.download"
        >
          <v-icon
            class="mr-1"
            icon="$downloadcloud"
            size="16"
          />

          {{ t('deployLogs.downloadLog') }}
        </AppButton>

        <AppButton
          data-testid="files-upload-close"
          :disabled="!logsTerminal"
          kind="text"
          @click="close"
        >
          {{ t('button.close') }}
        </AppButton>
      </template>
    </BasicModal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { DropZoneItem } from '@/shared/ui/drop-zone/drop-zone'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // app-lite only (no app counterpart). Logic in `../files-upload-version.ts`; the logs phase
  // runs on the kit `DeployLogsViewer` fed by `useDeployLogs`, the dialog rules are the ones of `GitRedeployModal`. The owner (General page) calls `open()`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, reactive, ref } from 'vue'
  import {
    acceptFile,
    applyUploadSource,
    buildArchiveRedeployPayload,
    canOpenFilePicker,
    canSubmitUpload,
    captureUploadSubmit,
    changeUploadTarget,
    clearFile,
    createUploadVersionForm,
    currentLineKey,
    finishUpload,
    firstFile,
    mapUploadError,
    showUploadStagingCheckbox,
    unlockUpload,
    UPLOAD_REDEPLOY_SUCCESS_KEY,
    uploadDeploySteps,
    uploadedDate,
    uploadedSize,
    uploadPercent,
    type UploadPhase,
    uploadTargetId,
  } from '@/views/projects/project/general/files-upload-version'
  import { canCloseRedeploy, isRedeployPersistent, isRedeployTargetEvent, redeployDialogWidth } from '@/views/projects/project/general/git-redeploy'
  import { redeployUploadedArchive, uploadVersionArchive } from '@/views/projects/project/instance.api'
  import { forgetProjectSource, getProjectSource } from '@/entities/project/project-source.api'
  import DeployLogsViewer from '@/entities/project/ui/deploy/DeployLogsViewer.vue'
  import DeploySteps from '@/entities/project/ui/deploy/DeploySteps.vue'
  import { useDeployLogs } from '@/entities/project/use-deploy-logs'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { useAppEvent } from '@/shared/events/app-events'
  import { uploadMaxBytes, uploadMaxLabel } from '@/shared/files/upload-limit'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DropZone from '@/shared/ui/drop-zone/DropZone.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'reload-instance': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()

  const uploadLimitBytes = computed(() => uploadMaxBytes(session.home))
  const uploadLimitLabel = computed(() => uploadMaxLabel(session.home))
  // The refusal of a pick (wrong type, over the panel's limit) and of the upload itself show in the dialog, where the
  // user is looking: an alert in the page corner is lost behind the dialog's overlay.
  const errorMessage = ref('')

  const opened = ref(false)
  // Legacy V2 `VDialog` shifts the page under 768px while open: the `scroll-lock="mobile"` of `AppDialog`.
  const phase = ref<UploadPhase>('form')
  const form = reactive(createUploadVersionForm())
  const targetId = ref<number | string | null>(null)
  const confirmingCancel = ref(false)
  const logsTerminal = ref(false)
  // The footer's cancel button and download link follow the data layer: a deploy that is still running when the log phase opens keeps
  // its status, so the legacy `state-change` watcher (fired on a change only) left them hidden for the whole run.
  const viewerRunning = computed(() => logs.isRunning.value)
  const viewerDownloadLogId = computed(() => logs.downloadLogId.value)

  const formatDate = useDateFormat()
  const currentKey = computed(() => currentLineKey(props.instance))
  // The session date format, not the raw timestamp.
  const dateLabel = computed(() => {
    const value = uploadedDate(props.instance)
    return value ? formatDate(value) : ''
  })
  const sizeLabel = computed(() => uploadedSize(props.instance))
  const stagingCheckbox = computed(() => showUploadStagingCheckbox(props.instance))
  const submitEnabled = computed(() => canSubmitUpload(form, props.instance, phase.value))
  const uploadItems = computed<DropZoneItem[]>(() => (form.selectedFile ? [{ id: 'file', label: form.selectedFile.name }] : []))

  // The card is the kit `BasicModal`. The form phase has Upload & deploy and Cancel as its buttons (the test ids stay);
  // the logs phase has none, its footer is the `actions` slot. `submitting` (form phase only) hides the X and spins the submit, as before.
  const formButtons = computed<ModalButton[]>(() => phase.value === 'form'
    ? [
      { id: 'submit', label: t('button.uploadAndDeploy'), color: 'primary', disabled: !submitEnabled.value && !form.submitting, testId: 'files-upload-submit' },
      { ...cancelButton(t), disabled: form.submitting, testId: 'files-upload-cancel' },
    ]
    : [])

  function onFormButton (id: string): void {
    if (id === 'submit') {
      void onUploadAndDeploy()
      return
    }
    close()
  }

  const logs = useDeployLogs({
    instanceId: () => targetId.value,
    live: () => true,
    logId: () => null,
    active: () => opened.value && phase.value === 'logs',
    onTerminal: () => {
      confirmingCancel.value = false
      logsTerminal.value = true
      unlockUpload(form)
    },
  })

  /** The steps are those of the deployed version of the target, not of the archive about to be uploaded. */
  async function loadTargetSource (): Promise<void> {
    const id = uploadTargetId(props.instance, form.deployStaging)
    try {
      applyUploadSource(form, props.instance, id, await getProjectSource(id))
    } catch {
      applyUploadSource(form, props.instance, id, null)
    }
  }

  /** Resets everything, loads the target, then shows the dialog. */
  async function open (): Promise<void> {
    phase.value = 'form'
    targetId.value = null
    confirmingCancel.value = false
    logsTerminal.value = false
    Object.assign(form, createUploadVersionForm())
    errorMessage.value = ''
    await loadTargetSource()
    opened.value = true
  }

  /** Another target starts with its own steps. */
  async function onDeployStagingChange (checked: boolean): Promise<void> {
    changeUploadTarget(form, checked)
    await loadTargetSource()
  }

  function close (): void {
    if (!canCloseRedeploy(phase.value, form.submitting, logsTerminal.value)) {
      return
    }
    opened.value = false
  }

  function take (file: File | null): void {
    const result = acceptFile(form, file, uploadLimitBytes.value)
    if (!result.accepted) {
      if (result.errorKey) {
        errorMessage.value = String(t(result.errorKey, (result.errorParams ?? {}) as never))
      }
      return
    }
    errorMessage.value = ''
  }

  // A pick or a drop: the first file goes through the archive rules.
  function onFiles (files: File[]): void {
    take(firstFile(files))
  }

  // Ignored while submitting (the row button is disabled then too).
  function onClearFile (): void {
    if (clearFile(form)) {
      errorMessage.value = ''
    }
  }

  async function onUploadAndDeploy (): Promise<void> {
    if (!submitEnabled.value || !form.selectedFile) {
      return
    }
    if (!props.instance.hasRedeployPrivilege()) {
      return
    }
    form.submitting = true
    form.uploadPercent = 0
    const viewedId = props.instance.id
    const submit = captureUploadSubmit(form, props.instance)
    try {
      const remoteFilepath = await uploadVersionArchive(viewedId, form.selectedFile, {
        deployStaging: submit.deployStaging,
        onProgress: event => {
          form.uploadPercent = uploadPercent(event, form.uploadPercent)
        },
      })
      form.uploadPercent = null
      const result = await redeployUploadedArchive(viewedId, buildArchiveRedeployPayload(submit, remoteFilepath))
      targetId.value = result.target_id
      forgetProjectSource(result.target_id)
      phase.value = 'logs'
    } catch (error) {
      const failure = mapUploadError(error, uploadLimitBytes.value)
      errorMessage.value = failure.message || String(t(failure.fallbackKey, (failure.params ?? {}) as never))
    } finally {
      finishUpload(form, phase.value)
    }
  }

  async function cancelDeploy (): Promise<void> {
    if (await logs.cancelDeploy()) {
      confirmingCancel.value = false
    }
  }

  useAppEvent('instance-redeploy-finished', payload => {
    if (!isRedeployTargetEvent(payload, targetId.value)) {
      return
    }
    emit('reload-instance')
    alerts.addAlert({ success: true, successMessage: String(t(UPLOAD_REDEPLOY_SUCCESS_KEY)) })
    unlockUpload(form)
  })

  useAppEvent('instance-redeploy-failed', payload => {
    if (!isRedeployTargetEvent(payload, targetId.value)) {
      return
    }
    emit('reload-instance')
    alerts.addAlert({ success: false, errorMessage: String(t('notification.instance.files.redeploy.failed')) })
    unlockUpload(form)
  })

  defineExpose({ open })
</script>

<style lang="scss" scoped>
// The card is the kit `BasicModal` (its own `BasicModal.scss` gives the title row, the paddings and the X).

// V2 `.v-progress-linear` keeps the 0.87 text colour; the V4 bar inherits the 0.6 card text colour.
.v-progress-linear {
  color: var(--v-text-default);
}

// V2 spaced neighbouring buttons with `.v-btn + .v-btn { margin-left: 8px }` (the logs footer in the `actions` slot of the card).
.v-card-actions .v-btn + .v-btn {
  margin-left: 8px;
}

.option-sub {
  margin-top: 4px;
  margin-left: 38px;
}
</style>
