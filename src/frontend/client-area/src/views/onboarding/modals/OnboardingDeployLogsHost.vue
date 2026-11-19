<template>
  <deploy-logs-viewer
    :current-stage="logs.currentStage.value"
    :error="logs.error.value"
    :lines="logs.lines.value"
    live
    :source="source"
    :stages="logs.stages.value"
    :status="logs.status.value"
    :warning="logs.warning.value"
  />
</template>

<script lang="ts" setup>
  import type { DeploySource } from '@/entities/project/ui/deploy/deploy-steps'
  import DeployLogsViewer from '@/entities/project/ui/deploy/DeployLogsViewer.vue'
  // Data host of the custom deploy progress. It is a child on purpose: `useDeployLogs` registers its lifecycle hooks in setup, so the modal's custom branch mounts and
  // unmounts this host (no polling outlives it). Without an instance id the viewer shows the preparing state.
  import { useDeployLogs } from '@/entities/project/use-deploy-logs'

  const props = defineProps<{
    instanceId: number | string | null
    /** The modal is open and the deploy is still running. */
    active: boolean
    /** The flow's source: the step names of a files deploy have no repository. */
    source?: DeploySource | null
  }>()

  const emit = defineEmits<{
    terminal: [status: string]
  }>()

  const logs = useDeployLogs({
    instanceId: () => props.instanceId,
    live: () => true,
    logId: () => null,
    active: () => props.active,
    onTerminal: status => emit('terminal', status),
  })

  /**
    * Without an instance id the deploy has no request to cancel yet: nothing is sent and the
    * call resolves true at once, so the confirmation row closes and the work carries on.
   */
  function cancel (): Promise<boolean> {
    if (!props.instanceId) {
      return Promise.resolve(true)
    }
    return logs.cancelDeploy()
  }

  defineExpose({ cancel, readFinal: () => logs.readFinal() })
</script>
