<template>
  <v-skeleton-loader
    v-if="cell.kind === 'loading'"
    class="services-limits-cell__skeleton"
    data-testid="services-limits-loading"
    type="text"
    width="180"
  />

  <span
    v-else-if="cell.kind === 'none'"
    data-testid="services-limits-none"
  >-</span>

  <span
    v-else-if="cell.kind === 'unlimited'"
    data-testid="services-limits-unlimited"
  >{{ t('form.value.unlimited') }}</span>

  <div
    v-else
    class="services-limits-cell d-flex flex-wrap align-center"
    data-testid="services-limits-summary"
  >
    <StatusLabel
      v-for="chip in cell.chips"
      :key="chip"
      class="radius-sm"
      status="gray"
    >
      {{ chip }}
    </StatusLabel>

    <span
      v-if="cell.more > 0"
      class="services-limits-cell__more p-sm"
    >{{ moreText }}</span>
  </div>
</template>

<script lang="ts" setup>
  // The Limits column of My plans (paid editions): the main limits of the plan's project as chips, as Project details sums them up
  // (`limitsSummary`), and how many other limits are set.
  import type { ProjectState } from './service-limits'
  import type { Translate } from '@/entities/project/project-usage'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { limitsCell } from './service-limits'

  const props = defineProps<{
    state?: ProjectState
  }>()

  const { t: translate } = useTranslation()
  const t = translate as (key: string, options?: Record<string, unknown>) => string

  const cell = computed(() => limitsCell(props.state, t as Translate))
  // The "+N more" of the Project details Limits row.
  const moreText = computed(() => cell.value.kind === 'chips'
    ? t('heading.instance.advanced.siteDetails.card.site.limits.more', { count: cell.value.more, defaultValue: '+{{count}} more' })
    : '')
</script>

<style lang="scss" scoped>
.services-limits-cell {
  gap: 6px;
}

.services-limits-cell__more {
  color: var(--v-gray-darken1);
}
</style>
