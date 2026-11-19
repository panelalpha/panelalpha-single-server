<template>
  <div
    class="logs-table__log-item"
    :class="
      display.width.value < 1400
        ? 'd-flex flex-wrap'
        : 'd-flex align-center'
    "
  >
    <v-chip
      class="action-name"
      :class="[actionChipClass(action.request_method), display.width.value < 1400 ? 'mr-2 mb-1' : '']"
      label
      size="small"
      variant="flat"
    >
      {{ actionName(action.action, t) }}
    </v-chip>

    <v-tooltip
      v-if="hasInformationTooltip(action.payload)"
      :close-delay="150"
      location="bottom"
      :open-delay="150"
    >
      <template #activator="{ props: activatorProps }">
        <span
          v-safe-html="information"
          v-bind="activatorProps"
          class="p-4 information log-item__information"
          :class="
            display.width.value < 1400
              ? 'd-flex flex-wrap align-start'
              : 'd-flex align-center ml-2'
          "
        />
      </template>

      <span v-safe-html="information" />
    </v-tooltip>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceLogRow } from '@/entities/project/instance-logs.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import { actionChipClass, actionInformation, actionName, hasInformationTooltip } from './instance-log'

  const props = defineProps<{
    action: InstanceLogRow
  }>()

  const { t } = useTranslation()
  const display = useDisplay()

  // Legacy `information` computed: HTML on purpose, built from the log payload (emails, file names, domains, not escaped in
  // `instance-log.ts`). `v-safe-html` strips what could run; escaping at the source is deferred.
  const information = computed(() => actionInformation(props.action, t))
</script>

<style lang="scss" src="./LogItem.scss"></style>
