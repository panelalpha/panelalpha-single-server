<template>
  <deploy-logs-modal
    v-model:confirming-cancel="confirmingCancel"
    :cancelling="logs.cancelling.value"
    :content-loading="logs.contentLoading.value"
    :current-stage="logs.currentStage.value"
    :download-log-id="viewerDownloadLogId"
    :downloading="logs.downloading.value"
    :error="logs.error.value"
    :is-open="isOpen"
    :lines="logs.lines.value"
    :live="live"
    :live-mode="logs.isLiveMode.value"
    :log-id="logId"
    :no-logs="noLogs"
    :running="viewerRunning"
    :stages="logs.stages.value"
    :status="logs.status.value"
    :warning="logs.warning.value"
    @cancel-deploy="onCancelDeploy"
    @close="emit('close')"
    @download="logs.download"
  />
</template>

<script lang="ts" setup>
  // Host of the kit `DeployLogsModal` for a custom project (app-lite): feeds it the polling / push state of `useDeployLogs`.
  import { computed, ref } from 'vue'
  import DeployLogsModal from '@/entities/project/ui/deploy/DeployLogsModal.vue'
  import { useDeployLogs } from '@/entities/project/use-deploy-logs'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    instanceId: number | string
    live?: boolean
    logId?: number | string | null
    noLogs?: boolean
  }>(), {
    live: true,
    logId: null,
    noLogs: false,
  })

  const emit = defineEmits<{
    close: []
    // the deploy reached a terminal status (the instance refreshes through the Echo notification flow)
    terminal: [status: string]
  }>()

  const confirmingCancel = ref(false)

  const logs = useDeployLogs({
    instanceId: () => props.instanceId,
    live: () => props.live,
    logId: () => props.logId,
    active: () => props.isOpen,
    onTerminal: status => {
      confirmingCancel.value = false
      emit('terminal', status)
    },
    onLoadError: () => emit('close'),
  })

  // The modal shows the live badge, the hint, "Cancel deploy" and "Download logs" from these two values. They follow the data layer
  // directly: a deploy that is already running when the window opens keeps its status, so a change watcher
  // would leave them at their initial values for the whole run.
  const viewerRunning = computed(() => logs.isRunning.value)
  const viewerDownloadLogId = computed(() => logs.downloadLogId.value)

  async function onCancelDeploy (): Promise<void> {
    if (await logs.cancelDeploy()) {
      confirmingCancel.value = false
    }
  }
</script>
