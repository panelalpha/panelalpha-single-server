<template>
  <div v-if="header.value === 'user'">
    <user-item :user="item.user" />
  </div>

  <div v-else-if="header.value === 'instance'">
    <a
      v-if="instance"
      class="logs-table__instance text-truncate"
      :href="instance.url"
      target="_blank"
    >{{ instance.name }}</a>
  </div>

  <div v-else-if="header.value === 'action'">
    <log-item :action="item" />
  </div>

  <div
    v-else-if="header.value === 'date'"
    :class="isMobile ? '' : 'actions-row'"
  >
    <v-tooltip
      close-delay="150"
      location="bottom"
      open-delay="150"
    >
      <template #activator="{ props: activatorProps }">
        <span
          v-bind="activatorProps"
          class="mb-0 text-right text--gray-darken1"
        >
          {{ fromNow(new Date(item.date)) }}
        </span>
      </template>

      <span>{{ formatDateTime(item.date) }}</span>
    </v-tooltip>
  </div>

  <div v-else>
    {{ (item as unknown as Record<string, unknown>)[header.value] }}
  </div>
</template>

<script lang="ts" setup>
  // One cell of the reseller logs table, picked by the column.
  // The date keeps the fixed `YYYY-MM-DD HH:mm` tooltip of legacy (not the configured date format).
  import type { ResellerLogRow } from '@/views/reseller/reseller.api'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { computed } from 'vue'
  import LogItem from '@/entities/project/ui/logs/LogItem.vue'
  import UserItem from '@/entities/project/ui/logs/UserItem.vue'
  import { formatDateTime } from '@/shared/time/format-date'
  import { fromNow } from '@/shared/time/from-now'
  import { logInstance } from './logs-table'

  const props = withDefaults(defineProps<{
    item: ResellerLogRow
    header: LegacySortHeader
    isMobile?: boolean
  }>(), {
    isMobile: false,
  })

  const instance = computed(() => logInstance(props.item.payload))
</script>
