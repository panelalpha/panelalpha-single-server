<template>
  <v-col
    class="responsive-card"
    cols="12"
    lg="6"
  >
    <v-card
      class="monitoring-card"
      elevation="4"
    >
      <v-card-title>
        <h6 class="mb-4">
          {{ title }}
        </h6>
      </v-card-title>

      <v-card-text
        class="data-container"
        :class="{ 'data-container--attributed': attribution === 'dbip' }"
      >
        <ul
          v-if="!loading"
          class="item-list"
        >
          <li
            v-for="(item, index) in data"
            :key="index"
            class="item"
          >
            <div class="item__content">
              <div class="item__labels">
                <div
                  v-if="item.img"
                  class="item__icon-container"
                >
                  <v-img
                    max-height="24"
                    max-width="24"
                    :src="`/assets/${item.img}`"
                  />
                </div>

                <span class="text-truncate">
                  <b class="font-weight-600 text-truncate">
                    {{ item.label }}
                  </b>
                </span>
              </div>

              <div class="item__data">
                <span>
                  <b class="font-weight-600">{{ item.data }}</b>
                </span>

                <ProgressChart
                  :max-value="maxValue"
                  :value="item.data"
                />
              </div>
            </div>
          </li>
        </ul>

        <SharesCardSkeleton v-else />
      </v-card-text>

      <!-- Not in legacy: the DB-IP City Lite licence (CC BY 4.0) asks for this visible link wherever its data is shown. -->
      <v-card-text
        v-if="attribution === 'dbip'"
        class="attribution"
      >
        <a
          class="attribution__link"
          href="https://db-ip.com"
          rel="noopener"
          target="_blank"
        >IP Geolocation by DB-IP</a>
      </v-card-text>
    </v-card>
  </v-col>
</template>

<script lang="ts" setup>
  // The icon branch of the legacy row is not ported:
  // no shares card has an icon (`MonitoringItem` carries only the flag image). The row colour is left to `ProgressChart`, as legacy.
  import { computed } from 'vue'
  import { type MonitoringItem, sharesMaxValue } from '@/views/projects/project/monitoring/monitoring'
  import ProgressChart from '@/shared/ui/charts/ProgressChart.vue'
  import SharesCardSkeleton from './SharesCardSkeleton.vue'

  const props = defineProps<{
    loading: boolean
    title: string
    data: MonitoringItem[]
    attribution?: 'dbip'
  }>()

  const maxValue = computed(() => sharesMaxValue(props.data))
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

//  Legacy `.v-card__text:last-child` keeps the 24px bottom padding of the last block. V4 ends the card with `.v-card__overlay`, so the
//  port's `:last-child` never matches; the last text block of each card takes the padding explicitly.
.v-card-text {
  padding-bottom: 24px;
}

// With the attribution footer below, the list gives its bottom padding to the footer.
.data-container--attributed {
  padding-bottom: 8px;
}

// DB-IP attribution footer: small text in the primary colour, no underline, as the link in WizardHubAccount.vue.
.attribution {
  padding-top: 0;

  &__link {
    color: rgb(var(--v-theme-primary));
    font-size: v.$font-size-xs;
    font-weight: v.$font-weight-medium;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
    }
  }
}

.item-list {
  padding-left: 0;
}

.item {
  list-style-type: none;
  font-weight: v.$font-weight-medium;
  font-size: v.$font-size-base;
  line-height: v.$line-height-base;
  color: map.get(v.$text, headings);

  &:not(:last-child) {
    margin-bottom: 16px;
  }

  &__content {
    display: flex;
    justify-content: space-between;
  }

  &__data {
    display: flex;
    align-items: center;

    span {
      margin-right: 10px;
    }
  }

  &__labels {
    display: flex;
    max-width: calc(100% - 150px);
  }

  &__icon-container {
    margin-right: 16px;
    margin-top: 4px;

    // Legacy `.v-image::v-deep .v-image__image`: inset outline on the flag image.
    :deep(.v-img__img) {
      box-shadow: 0 0 0 1px var(--v-flag-outline) inset;
    }
  }

  @media (max-width: map.get(v.$grid-breakpoints, sm)) {
    &__content {
      flex-direction: column;
    }

    &__data {
      justify-content: space-between;

      .v-progress-linear {
        max-width: 50%;
      }
    }
  }
}
</style>
