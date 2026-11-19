<template>
  <v-card
    class="mb-8"
    data-testid="summary-plan-card"
    elevation="4"
  >
    <v-card-title class="pb-6 d-flex flex-row justify-space-between">
      <h6>{{ t('heading.hosting.summary.planCard.title') }}</h6>
      <slot name="action" />
    </v-card-title>

    <v-card-text class="d-flex align-center justify-space-between space-indicator-row">
      <HostingAvailableSpaceCard
        v-for="(item, index) in availableSpace"
        :key="index"
        :available="item.available"
        :available-text="item.availableText"
        data-testid="summary-space-tile"
        :icon="item.icon"
        :title="t(`heading.hosting.summary.planCard.usage.${item.title}`)"
        :value="item.value"
        :value-text="item.valueText"
      />
    </v-card-text>

    <v-divider class="mt-6" />

    <v-card-text>
      <div class="summary-data">
        <div
          v-for="(item, index) in usageData"
          :key="`${index}-${item.name}`"
          class="summary-data__content"
        >
          <div
            v-if="isRowVisible(item, service)"
            :data-testid="`summary-usage-row-${item.name}`"
          >
            <p class="mb-2 summary-data__name">
              {{ t(`heading.hosting.summary.planCard.usage.${item.name}`) }}
            </p>

            <div class="summary-data__data">
              <span class="p-2">
                <v-icon
                  v-if="item.valueText === '∞'"
                  color="var(--v-darkicon-base)"
                  icon="$infiniteIcon"
                  size="20"
                />

                <b v-else>{{ item.valueText }}</b>
                /
                <v-icon
                  v-if="item.maxValueText === '∞'"
                  color="var(--v-darkicon-base)"
                  icon="$infiniteIcon"
                  size="20"
                />

                <template v-else>
                  {{ item.maxValueText }}
                </template>

                <template v-if="item.url">
                  <router-link :to="item.url">
                    <AppButton
                      class="px-2"
                      color="info"
                      kind="link"
                      size="x-small"
                    >
                      <span class="font-weight-bold p-2">{{ t('button.manage') }}</span>
                    </AppButton>
                  </router-link>
                </template>
              </span>

              <v-tooltip
                location="bottom"
                :offset="4"
                open-delay="150"
                transition="custom-tooltip"
                :z-index="99"
              >
                <template #activator="{ props: activatorProps }">
                  <div
                    v-bind="activatorProps"
                    class="py-2"
                  >
                    <ProgressChart
                      v-if="item.maxValueText !== '∞'"
                      class="plan-progress"
                      :max-value="item.maxValue"
                      :value="item.value"
                    />

                    <v-icon
                      color="var(--v-darkicon-base)"
                      :icon="`$${item.icon}`"
                      size="20"
                    />
                  </div>
                </template>

                <template v-if="item.maxValueText === '∞'">
                  {{ t('tooltip.hosting.summary.planCard.infinite') }}
                </template>

                <template v-else>
                  <span class="header--text font-weight-600">
                    {{ percent(item) }}%
                  </span>

                  <span class="base--text font-weight-normal">
                    <i18next :translation="t('tooltip.hosting.summary.planCard.usage')">
                      <template #percent>
                        <span class="header--text font-weight-600">
                          {{ percent(item) }}%
                        </span>
                      </template>
                    </i18next>
                  </span>
                </template>
              </v-tooltip>
            </div>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  import type { HostingService } from '@/views/hosting/hosting.types'
  import type { AvailableSpaceItem, UsageRow } from './plan-usage'
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ProgressChart from '@/shared/ui/charts/ProgressChart.vue'
  import HostingAvailableSpaceCard from './HostingAvailableSpaceCard.vue'
  import { isRowVisible } from './plan-usage'

  defineProps<{
    usageData: UsageRow[]
    availableSpace: AvailableSpaceItem[]
    service: HostingService
  }>()

  const { t } = useTranslation()

  // Legacy prints the percentage twice in the tooltip (once bold, once inside the translated sentence): kept.
  function percent (item: UsageRow): number {
    return Math.ceil((item.value / item.maxValue) * 100)
  }
</script>

<style lang="scss" scoped>
.v-card-title.pb-6 {
  // V2 `.v-card__title` wraps its children (the chip drops below the title on a narrow screen); V4's is a nowrap row.
  flex-wrap: wrap;
}

.summary-data {
  display: flex;
  flex-direction: column;

  &__content {
    display: flex;
    flex-direction: column;
    width: 100%;

    &:not(:last-child) {
      margin-bottom: 8px;
    }
  }

  &__data {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}

// V2 `.v-btn:not(.v-btn--round).v-size--x-small` (height) and its 14px font (V4's x-small is 10px).
.v-btn.v-btn--size-x-small {
  height: 22px;
  font-size: 14px;
}

// The global `.v-card-text:last-child { padding-bottom: 24px }` misses V4 cards (they end with `.v-card__overlay`), so the last text block restates it.
.v-card > .v-card-text:last-of-type {
  padding-bottom: 24px;
}

// Legacy has an inline `max-width: 100px` on the progress bar.
.plan-progress {
  max-width: 100px;
}

@media (max-width: 1400px) and (min-width: 1183px) {
  .space-indicator-row {
    flex-direction: column;
    // Same as legacy: `align-items: flex-start !important`.
    align-items: flex-start !important;

    > div:not(:first-child) {
      margin-top: 8px;
    }
  }
}

@media (max-width: 500px) {
  .space-indicator-row {
    flex-direction: column;
    // Same as legacy: `align-items: flex-start !important`.
    align-items: flex-start !important;

    > div:not(:first-child) {
      margin-top: 8px;
    }
  }
}
</style>
