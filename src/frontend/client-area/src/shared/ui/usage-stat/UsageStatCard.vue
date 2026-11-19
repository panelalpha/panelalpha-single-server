<template>
  <v-card
    class="usage-stat"
    :data-testid="testid"
    elevation="4"
  >
    <template v-if="loading">
      <div
        class="usage-stat__skeleton"
        :data-testid="skeletonTestid ?? `${testid}-skeleton`"
      >
        <v-skeleton-loader
          class="usage-stat__bone-ring"
          type="avatar"
        />

        <div class="usage-stat__body">
          <v-skeleton-loader
            class="usage-stat__bone-title"
            type="text"
          />

          <div
            v-for="row in skeletonRows"
            :key="row"
            class="usage-stat__bone-row"
          >
            <v-skeleton-loader
              class="usage-stat__bone-label"
              type="text"
            />

            <v-skeleton-loader
              class="usage-stat__bone-value"
              type="text"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <v-progress-circular
        :aria-label="title"
        :aria-valuetext="percent === null ? ringText : undefined"
        class="usage-stat__ring"
        :class="{ 'usage-stat__ring--small': ringTextSmall }"
        color="primary"
        :data-testid="ringTestid ?? `${testid}-ring`"
        :model-value="percent ?? 0"
        :size="90"
        :width="6"
      >
        {{ ringText }}
      </v-progress-circular>

      <div class="usage-stat__body">
        <p class="p-1 mb-0 font-weight-600 heading--text">
          {{ title }}
        </p>

        <p
          v-if="note"
          class="usage-stat__note"
          :data-testid="`${testid}-note`"
        >
          {{ note }}
        </p>

        <dl
          v-else-if="rows?.length"
          class="usage-stat__list"
        >
          <template
            v-for="row in rows"
            :key="row.key"
          >
            <dt>{{ row.label }}</dt>

            <dd :data-testid="row.testid ?? `${testid}-row-${row.key}`">
              {{ row.value }}
            </dd>
          </template>
        </dl>
      </div>
    </template>
  </v-card>
</template>

<script lang="ts" setup>
  // One usage stat card (ring plus a label list or a note) for the Usage page and the Project details cards
  // (decision of the user 2026-11-17).
  // The test ids default to `<testid>-ring`, `<testid>-row-<key>` and `<testid>-skeleton`. The override props exist so that Project details
  // keeps its `project-usage-*` ids, which its tests and the parity probes use.
  export interface UsageStatRow {
    key: string
    label: string
    value: string
    /** Overrides the default `<testid>-row-<key>`. */
    testid?: string
  }

  withDefaults(defineProps<{
    title: string
    /** Overrides the default `<testid>-ring`. */
    ringTestid?: string
    /** Ring value; `null` draws an empty ring. */
    percent: number | null
    ringText: string
    /** An amount such as "1.2 GB" in the ring: 0.875rem instead of 16px/700. */
    ringTextSmall?: boolean
    rows?: UsageStatRow[]
    /** Shown instead of the list. */
    note?: string
    loading?: boolean
    skeletonRows?: number
    /** Overrides the default `<testid>-skeleton`. */
    skeletonTestid?: string
    testid: string
  }>(), {
    ringTestid: undefined,
    ringTextSmall: false,
    rows: undefined,
    note: undefined,
    loading: false,
    skeletonRows: 2,
    skeletonTestid: undefined,
  })
</script>

<style lang="scss" scoped>
.usage-stat {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border-radius: 8px;

  // Mockup width (`.mk-stat`), not a `$grid-breakpoints` value (decision of the user 2026-11-17).
  @media (max-width: 600px) {
    padding: 16px;
    gap: 16px;
  }
}

.usage-stat__skeleton {
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;

  // Mockup width, as `.usage-stat` above.
  @media (max-width: 600px) {
    gap: 16px;
  }
}

.usage-stat__ring {
  flex: none;
  width: 90px;
  height: 90px;
  color: var(--v-primary-base);

  :deep(.v-progress-circular__content) {
    font-size: 16px;
    font-weight: 700;
    color: var(--v-text-darken2);
  }
}

// An amount in the ring (no percent) is wider than "54%": smaller, so it fits inside the 90px ring.
.usage-stat__ring--small :deep(.v-progress-circular__content) {
  font-size: 0.875rem;
}

.usage-stat__body {
  flex: 1;
  min-width: 0;
}

.usage-stat__list {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 12px 0 0;

  dt {
    font-size: 16px;
    line-height: 24px;
    color: var(--v-text-base);
    margin: 0;
  }

  dd {
    font-size: 16px;
    line-height: 24px;
    font-weight: 700;
    color: var(--v-text-darken2);
    margin: 0;
    text-align: right;
  }
}

.usage-stat__note {
  font-size: 16px;
  line-height: 24px;
  color: var(--v-text-base);
  margin: 12px 0 0;
}

// Skeleton bones in the size of what they stand for.
.usage-stat__bone-ring :deep(.v-skeleton-loader__avatar) {
  width: 90px;
  min-width: 90px;
  height: 90px;
  max-width: 90px;
  max-height: 90px;
  margin: 0;
}

.usage-stat__bone-title :deep(.v-skeleton-loader__text) {
  width: 90px;
  height: 12px;
  margin: 4px 0 10px;
}

.usage-stat__bone-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.usage-stat__bone-label :deep(.v-skeleton-loader__text) {
  width: 64px;
  height: 10px;
  margin: 6px 0;
}

.usage-stat__bone-value :deep(.v-skeleton-loader__text) {
  width: 56px;
  height: 10px;
  margin: 6px 0;
}

.usage-stat__skeleton .v-skeleton-loader {
  flex: 0 0 auto;
  background: transparent;

  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
  }
}
</style>
