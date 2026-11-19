<template>
  <info-card :title="t('heading.instance.siteDetails.source.title')">

    <v-card-text class="mb-4">
      <!-- One grid for both columns: label, value, meta and status rows are shared, so a wrapped or missing line in one column
             never moves the other column (the WordPress card keeps the same label / value / status rhythm). -->
      <div class="source-grid">
        <div class="p-3 source-label">
          <slot name="label-start" />
        </div>

        <div class="p-3 source-label">
          <slot name="label-end" />
        </div>

        <div class="source-value">
          <slot name="value-start" />
        </div>

        <div class="source-value">
          <slot name="value-end" />
        </div>

        <div class="p-4 source-meta">
          <slot name="meta-start" />
        </div>

        <div class="p-4 source-meta">
          <slot name="meta-end" />
        </div>

        <div class="p-4 source-status">
          <slot name="status-start" />
        </div>

        <div class="p-4 source-status">
          <slot name="status-end" />
        </div>
      </div>
    </v-card-text>

    <template
      v-if="actions"
      #actions
    >
      <slot name="actions" />
    </template>
  </info-card>
</template>

<script lang="ts" setup>
  // Shared frame of the two Source cards (`GitSourceInfoCard`, `FilesSourceInfoCard`): title, a two-column grid of four shared rows
  // (label, value, meta, status) and the action row. The Source card leaves
  // the legacy per-column stacks (14 px bold value that wrapped, 13 px mono line, status at a different height in each column) for
  // the label / value / status rhythm of the WordPress card; the value stays 14 px (the "Not installed" scale of that card), one line
  // with an ellipsis (a 20 px value was tried and rejected).
  // The column, the card, the title, the body colour and the action row are the kit pattern `InfoCard`.
  import { useTranslation } from 'i18next-vue'
  import InfoCard from '@/views/projects/project/general/ui/InfoCard.vue'

  withDefaults(defineProps<{
    // `false` leaves out the action row (the Git card without a privilege).
    actions?: boolean
  }>(), {
    actions: true,
  })

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.source-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 16px;
  row-gap: 4px;
}

.source-label,
.source-meta,
.source-status {
  min-width: 0;
}

.source-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  font-size: v.$font-size-sm;
  font-weight: v.$font-weight-bold;
  line-height: v.$line-height-sm;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-meta {
  color: var(--v-gray-lighten1);
  overflow-wrap: anywhere;
}

.source-status {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 18px;
}

.source-grid :deep(.status-skeleton) {
  width: 140px;
  height: 20px;

  .v-skeleton-loader {
    height: 100%;
  }

  .v-skeleton-loader__text {
    margin: 4px 0 0;
    height: 12px;
    border-radius: 2px;
  }
}
</style>
