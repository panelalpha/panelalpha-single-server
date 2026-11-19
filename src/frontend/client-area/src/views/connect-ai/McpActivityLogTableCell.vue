<template>
  <div v-if="header.value === 'created_at'">
    <v-tooltip
      close-delay="150"
      location="bottom"
      open-delay="150"
    >
      <template #activator="{ props: activatorProps }">
        <span
          v-bind="activatorProps"
          class="mb-0 text--gray-darken1"
        >
          {{ fromNow(item.created_at) }}
        </span>
      </template>

      <span>{{ formatDateTime(item.created_at) }}</span>
    </v-tooltip>
  </div>

  <div v-else-if="header.value === 'token_name'">
    <span>{{ item.token_name }}</span>
  </div>

  <div v-else-if="header.value === 'tool_name'">
    <span class="font-weight-600">{{ item.tool_name }}</span>
  </div>

  <div
    v-else-if="header.value === 'status'"
    :class="isMobile ? '' : 'd-flex justify-end'"
  >
    <StatusLabel
      :status="item.status === 'success' ? 'success' : 'error'"
      :value="item.status === 'success' ? t('heading.connectAi.logStatus.success') : t('heading.connectAi.logStatus.error')"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  // Any status other than `success` renders as Error.
  import type { McpActivityLog } from '@/entities/mcp/mcp.api'
  import { useTranslation } from 'i18next-vue'
  import { formatDateTime } from '@/shared/time/format-date'
  import { fromNow } from '@/shared/time/from-now'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  defineProps<{
    item: McpActivityLog
    header: LegacySortHeader
    isMobile?: boolean
  }>()

  const { t } = useTranslation()
</script>
