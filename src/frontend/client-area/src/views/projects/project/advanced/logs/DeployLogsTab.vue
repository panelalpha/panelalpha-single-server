<template>
  <div>
    <!-- The run list loads: the same table skeleton as the log tabs. -->
    <log-lines-table
      v-if="listLoading"
      kind="deploy"
      loading
      :rows="[]"
    />

    <v-card
      v-else-if="!selectedLog"
      elevation="4"
    >
      <logs-no-data
        class="logs-panel-height"
        :description="t('deployLogs.noDeploysSubtitle')"
        :title="t('deployLogs.noDeploys')"
      />
    </v-card>

    <div v-else>
      <deploy-logs-tab-viewer
        :key="viewerKey"
        :instance-id="instanceId"
        :log="selectedLog"
        :search-term="searchTerm"
        @clear-filters="emit('clear-filters')"
        @download-target="emit('download-target', $event)"
        @terminal="emit('terminal', $event)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The data layer sits in `DeployLogsTabViewer`, which the `:key` remounts.
  import type { DeployLogEntry } from '@/entities/project/instance-deploy-logs.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import DeployLogsTabViewer from './DeployLogsTabViewer.vue'
  import LogLinesTable from './LogLinesTable.vue'
  import LogsNoData from './LogsNoData.vue'

  const props = withDefaults(defineProps<{
    instanceId: number | string
    selectedLog: DeployLogEntry | null
    listLoading: boolean
    searchTerm?: string
  }>(), {
    searchTerm: '',
  })

  const emit = defineEmits<{
    // the selected deploy reached a terminal status; the parent reloads the run list
    'terminal': [status: string]
    'clear-filters': []
    'download-target': [logId: number | string | null]
  }>()

  const { t } = useTranslation()

  // A new run or a status change (running → finished) remounts the viewer and its data layer.
  const viewerKey = computed(() => props.selectedLog ? `${props.selectedLog.id}-${props.selectedLog.status}` : 'none')
</script>
