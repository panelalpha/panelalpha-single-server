<template>
  <v-col
    v-if="loading || resources"
    cols="12"
    data-testid="project-usage"
  >
    <div class="project-usage__head d-flex flex-wrap align-baseline justify-space-between mb-4">
      <h2 class="h6 font-weight-bold">
        {{ t('heading.instance.advanced.projectUsage.title') }}
      </h2>

      <small
        v-if="!loading"
        class="project-usage__caption"
        data-testid="project-usage-caption"
      >{{ caption }}</small>
    </div>

    <v-row class="project-usage__row">
      <v-col
        v-for="card in cards"
        :key="card.key"
        cols="12"
        md="4"
      >
        <usage-stat-card
          :loading="loading"
          :note="card.note"
          :percent="card.ring.percent"
          :ring-testid="`project-usage-ring-${card.key}`"
          :ring-text="card.ringText"
          :ring-text-small="card.ringTextSmall"
          :rows="card.rows"
          skeleton-testid="project-usage-skeleton"
          :testid="`project-usage-card-${card.key}`"
          :title="card.title"
        />
      </v-col>
    </v-row>
  </v-col>
</template>

<script lang="ts" setup>
  import type { ProjectResources } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { type ServerTotals, type Translate, usageRings } from '@/entities/project/project-usage'
  import { fromNow } from '@/shared/time/from-now'
  import UsageStatCard from '@/shared/ui/usage-stat/UsageStatCard.vue'

  const props = defineProps<{
    resources: ProjectResources | null
    loading: boolean
    isContainer?: boolean
    /** The size of the whole server (single server only): RAM and disk without a limit show a percent of it. */
    server?: ServerTotals | null
  }>()

  const { t } = useTranslation()

  const rings = computed(() => props.resources ? usageRings(props.resources, t as Translate, props.isContainer, props.server ?? null) : null)

  const caption = computed(() => {
    const sampledAt = props.resources?.usage?.sampled_at
    return sampledAt
      ? t('heading.instance.advanced.projectUsage.updated', { time: fromNow(sampledAt) })
      : t('heading.instance.advanced.projectUsage.noRecentData')
  })

  const cards = computed(() => {
    const definitions = [
      { key: 'ram', title: t('heading.instance.advanced.projectUsage.card.ram') },
      { key: 'cpu', title: t('heading.instance.advanced.projectUsage.card.cpu') },
      { key: 'disk', title: t('heading.instance.advanced.projectUsage.card.disk') },
    ] as const

    return definitions.map(definition => {
      const ring = rings.value?.[definition.key] ?? { percent: null, used: '', limit: null, note: 'noData' as const }
      const noData = ring.note === 'noData'
      const usedText = ring.note === 'perCore' ? `${ring.used}${t('heading.instance.advanced.projectUsage.perCore')}` : ring.used
      // A ring with no percent (no sample, or no limit to measure against) shows the used amount, or a dash when there is none.
      const ringText = ring.percent === null ? (noData ? '-' : ring.used) : `${ring.percent}%`
      const rows = noData
        ? undefined
        : [
          { key: 'used', label: t('heading.instance.advanced.projectUsage.used'), value: usedText, testid: `project-usage-used-${definition.key}` },
          { key: 'limit', label: t('heading.instance.advanced.projectUsage.limit'), value: ring.limit ?? t('heading.instance.advanced.projectUsage.noLimit'), testid: `project-usage-limit-${definition.key}` },
          // Without a limit the ring is the percent of the whole server, so the card says how big the server is.
          ...(ring.note === 'ofServer' && ring.server
            ? [{ key: 'server', label: t('heading.instance.advanced.projectUsage.server', { defaultValue: 'Server' }), value: ring.server, testid: `project-usage-server-${definition.key}` }]
            : []),
        ]
      return {
        ...definition,
        ring,
        ringText,
        ringTextSmall: ring.percent === null && !noData && ring.used !== '',
        note: noData ? t('heading.instance.advanced.projectUsage.noRecentData') : undefined,
        rows,
      }
    })
  })
</script>

<style lang="scss" scoped>
.project-usage__caption {
  color: var(--v-gray-darken2);
}

// V4 `.v-row` spaces columns with `gap`; the cards sit 16px apart and fill the column height.
.project-usage__row {
  --v-col-gap-x: 16px;
  --v-col-gap-y: 16px;
}
</style>
