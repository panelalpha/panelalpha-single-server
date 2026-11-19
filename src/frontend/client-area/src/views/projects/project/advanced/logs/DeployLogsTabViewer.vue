<template>
  <div>
    <div
      v-if="logs.error.value"
      class="deploy-logs-tab-error mb-4"
      data-testid="deploy-logs-tab-error"
    >
      <v-icon
        class="mr-1"
        color="error"
        icon="$alertcircle"
        size="16"
      />

      <span class="deploy-logs-tab-error__text">{{ logs.error.value }}</span>
    </div>

    <div
      v-if="logs.warning.value"
      class="deploy-logs-tab-warning mb-4"
      data-testid="deploy-logs-tab-warning"
    >
      <v-icon
        class="mr-1"
        color="warning"
        icon="$alertcircle"
        size="16"
      />

      <span class="deploy-logs-tab-warning__text">{{ logs.warning.value }}</span>
    </div>

    <log-lines-table
      kind="deploy"
      :loading="logs.contentLoading.value"
      :rows="rows"
      :search-term="searchTerm"
      @clear-filters="emit('clear-filters')"
    />
  </div>
</template>

<script lang="ts" setup>
  // Data host of the deploy history viewer in the logs tab. It is a child on purpose: `useDeployLogs` registers its lifecycle hooks in
  // setup, and `DeployLogsTab` remounts this child with a `:key` when the selected run or its status changes.
  import type { DeployLogEntry } from '@/entities/project/instance-deploy-logs.api'
  import { computed, onBeforeUnmount, watch } from 'vue'
  import { useDeployLogs } from '@/entities/project/use-deploy-logs'
  import { deployRows } from './log-lines'
  import LogLinesTable from './LogLinesTable.vue'

  const props = withDefaults(defineProps<{
    instanceId: number | string
    log: DeployLogEntry
    searchTerm?: string
  }>(), {
    searchTerm: '',
  })

  const emit = defineEmits<{
    'terminal': [status: string]
    'clear-filters': []
    // the run the header Download saves (`null`: nothing to save yet, or the run is still running)
    'download-target': [logId: number | string | null]
  }>()

  // A running run is followed live with no log id, any other run loads its history by id.
  const running = computed(() => props.log.status === 'running')

  const logs = useDeployLogs({
    instanceId: () => props.instanceId,
    live: () => running.value,
    logId: () => running.value ? null : props.log.id,
    active: () => true,
    onTerminal: status => emit('terminal', status),
  })

  // Newest first; a running deploy refreshes `lines`, so the rows follow.
  const rows = computed(() => deployRows(logs.lines.value))

  // The Download button sits in the page title (with the search and the run select), so the viewer only reports what it would save.
  watch(
    () => rows.value.length > 0 ? logs.downloadLogId.value : null,
    logId => emit('download-target', logId),
    { immediate: true },
  )

  onBeforeUnmount(() => emit('download-target', null))
</script>

<style lang="scss" scoped>
// The run error above the table, same look as the live console viewer (`DeployLogsViewer`).
.deploy-logs-tab-error {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--v-error-lighten5);
  color: rgb(var(--v-theme-error));
  font-size: 13px;
  font-weight: 600;

  &__text {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

// The warning of a deploy the Engine finished with warnings, the same box in the warning palette.
.deploy-logs-tab-warning {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--v-warning-lighten5);
  color: rgb(var(--v-theme-warning));
  font-size: 13px;
  font-weight: 600;

  &__text {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }
}
</style>
