<template>
  <v-dialog
    :model-value="isOpen"
    @update:model-value="onDialogModel"
  >
    <v-card
      class="deploy-logs-modal"
      data-testid="deploy-logs-modal"
      width="680px"
    >
      <v-card-title class="d-flex justify-space-between align-start pb-2">
        <div>
          <h6
            class="heading--text d-flex align-center"
            data-testid="deploy-logs-title"
          >
            {{ t('deployLogs.title') }}

            <span
              v-if="running"
              class="deploy-logs-modal__live-badge"
              data-testid="deploy-logs-live"
            >
              <span class="deploy-logs-modal__live-dot" />

              {{ t('deployLogs.live') }}
            </span>
          </h6>

          <p
            v-if="live && running"
            class="deploy-logs-modal__sub mb-0 mt-2"
          >
            {{ t('deployLogs.liveHint') }}
          </p>
        </div>

        <ModalCloseButton
          data-testid="deploy-logs-close-icon"
          @click="close"
        />
      </v-card-title>

      <v-card-text>
        <!-- Until the deploy is read (history: the log is looked up, then read; live: the first answer of the engine) the steps
             and the console are skeletons, not a spinner and not the "no lines" / "preparing" text of the empty console. -->
        <deploy-logs-skeleton v-if="loadingContent" />

        <div
          v-else-if="noLogs"
          class="d-flex flex-column align-center py-12 text-center"
          data-testid="deploy-logs-empty"
        >
          <v-icon
            class="mb-3"
            color="gray"
            icon="$filetext"
            size="32"
          />

          <p class="font-weight-bold heading--text mb-1">
            {{ t('deployLogs.noDeploys') }}
          </p>

          <p class="text-gray-darken-2 mb-0">
            {{ t('deployLogs.noDeploysSubtitle') }}
          </p>
        </div>

        <deploy-logs-viewer
          v-else
          :current-stage="currentStage"
          :error="error"
          :lines="lines"
          :live="liveMode"
          :source="source"
          :stages="stages"
          :status="status"
          :warning="warning"
        />
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <template v-if="live && running">
          <AppButton
            v-if="!confirmingCancel"
            data-testid="deploy-logs-cancel"
            :disabled="cancelling"
            kind="danger"
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
              data-testid="deploy-logs-cancel-confirm"
              kind="danger"
              :loading="cancelling"
              size="small"
              @click="emit('cancel-deploy')"
            >
              {{ t('button.confirm') }}
            </AppButton>

            <AppButton
              :disabled="cancelling"
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
          v-if="downloadLogId"
          data-testid="deploy-logs-download"
          kind="link"
          :loading="downloading"
          @click="emit('download')"
        >
          <v-icon
            class="mr-1"
            icon="$downloadcloud"
            size="16"
          />

          {{ t('deployLogs.downloadLog') }}
        </AppButton>

        <AppButton
          data-testid="deploy-logs-close"
          kind="text"
          @click="close"
        >
          {{ t('button.close') }}
        </AppButton>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { DeployLogLine } from './deploy-log.types'
  import type { DeploySource, DeployStage } from './deploy-steps'
  // On the kit `DeployLogsViewer`. Props only: the data
  // layer of the viewer (polling, websocket push, history load, cancel, download) stays with the screen that opens the modal,
  // which feeds the viewer state in and acts on `cancel-deploy` / `download`.
  import { useTranslation } from 'i18next-vue'
  import { computed, toRef, watch } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import DeployLogsSkeleton from './DeployLogsSkeleton.vue'
  import DeployLogsViewer from './DeployLogsViewer.vue'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    // follow the running deploy
    live?: boolean
    logId?: number | string | null
    // the instance has no deploy to show
    noLogs?: boolean
    // viewer state, from `useDeployLogs`
    stages?: DeployStage[]
    currentStage?: string | null
    status?: string
    /** The project's source (`source.type`): a files project's `cloning` stage unpacks the archive, not a repository. */
    source?: DeploySource | null
    lines?: DeployLogLine[]
    error?: string | null
    /** What the Engine reported for a deploy it finished with warnings (`useDeployLogs` `warning`). */
    warning?: string | null
    // Live mode (`live && !logId`)
    liveMode?: boolean
    // Running (live mode and status `running`)
    running?: boolean
    downloadLogId?: number | string | null
    cancelling?: boolean
    downloading?: boolean
    // the history log is being read (`useDeployLogs` `contentLoading`)
    contentLoading?: boolean
  }>(), {
    live: false,
    logId: null,
    noLogs: false,
    stages: () => [],
    currentStage: null,
    status: 'running',
    source: null,
    lines: () => [],
    error: null,
    warning: null,
    liveMode: false,
    running: false,
    downloadLogId: null,
    cancelling: false,
    downloading: false,
    contentLoading: false,
  })

  // V2 `v-dialog` under 768px shifted the page by 16px (`html.overflow-y-hidden`, `_dialog.scss`).
  useMobileScrollLock(toRef(props, 'isOpen'))

  const emit = defineEmits<{
    'close': []
    'cancel-deploy': []
    'download': []
  }>()

  // The "Cancel deploy" confirmation row; the screen resets it once the cancel succeeded.
  const confirmingCancel = defineModel<boolean>('confirmingCancel', { default: false })

  const { t } = useTranslation()

  // History mode while the log to show is still being looked up.
  const resolving = computed(() => !props.live && !props.logId && !props.noLogs)
  // Live mode: skeletons until the first answer of the engine (`contentLoading` ends with it), then the console with its
  // "preparing" line until the engine sends the first lines (legacy). Lines or stages pushed earlier end the skeleton too.
  const loadingContent = computed(() => {
    if (props.noLogs) {
      return false
    }
    if (!props.live) {
      return resolving.value || props.contentLoading
    }
    return props.contentLoading && props.lines.length === 0 && props.stages.length === 0
  })

  watch(() => props.isOpen, open => {
    if (!open) {
      confirmingCancel.value = false
    }
  })

  function close (): void {
    emit('close')
  }

  // Esc and a click outside close the V4 dialog through `update:modelValue`.
  function onDialogModel (open: boolean): void {
    if (!open) {
      close()
    }
  }
</script>

<style lang="scss" scoped>
.deploy-logs-modal {
  // V2 actions had no flex gap (the buttons sat 8px apart through `.v-btn + .v-btn`) and inherited the card radius.
  .v-card-actions {
    // V2 actions start-aligned (buttons wider than the card overflow to the right on mobile); V4 flex-end overflows to the left.
    justify-content: flex-start;
    gap: 0;
    border-radius: 0 0 8px 8px;
    // The buttons keep 16px off the console (a `pt-0` utility on the element used to zero it).
    padding-top: 16px;

    // V2 `.v-btn` is `flex: 0 0 auto`; V4 buttons shrink when the row overflows.
    .v-btn {
      flex-shrink: 0;
    }

    .v-btn + .v-btn {
      margin-left: 8px;
    }
  }

  &__live-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 12px;
    font-size: 11px;
    font-weight: 700;
    color: rgb(var(--v-theme-primary));
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgb(var(--v-theme-primary));
    animation: deploy-logs-modal-pulse 1.2s ease-in-out infinite;
  }

  &__sub {
    font-size: 13px;
    color: var(--v-gray-darken1);
    max-width: 480px;
  }
}

@keyframes deploy-logs-modal-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
