<template>
  <info-card>
    <div class="d-flex flex-column px-6 py-6 skeleton-loader">
      <v-skeleton-loader
        class="title"
        :class="{ 'title--speed': variant === 'loadingSpeed' }"
        type="header"
      />

      <template v-if="variant === 'installation'">
        <div class="d-flex">
          <div
            v-for="index in 2"
            :key="index"
            class="d-flex flex-column version-box"
          >
            <v-skeleton-loader
              class="version"
              type="text, chip, text"
            />
          </div>
        </div>

        <v-skeleton-loader
          class="button"
          type="header"
        />
      </template>

      <div
        v-else-if="variant === 'siteDetails'"
        class="site-rows"
      >
        <v-skeleton-loader
          v-for="index in 3"
          :key="index"
          class="site-row"
          type="text, header"
        />
      </div>

      <template v-else-if="variant === 'security'">
        <div
          v-for="index in 2"
          :key="index"
          class="d-flex justify-space-between align-center"
        >
          <v-skeleton-loader
            class="security-row mb-3"
            type="header, text"
          />

          <v-skeleton-loader
            class="switch"
            type="chip"
          />
        </div>

        <v-skeleton-loader
          class="button button--security"
          type="header"
        />
      </template>

      <div
        v-else
        class="d-flex"
      >
        <div
          v-for="index in 2"
          :key="index"
          class="d-flex flex-column speed-skeleton"
          :class="index === 1 ? 'mr-3' : 'ml-3'"
        >
          <v-skeleton-loader
            class="speed"
            type="avatar, text"
          />
        </div>
      </div>
    </div>
  </info-card>
</template>

<script lang="ts" setup>
  // Fetching placeholders of the General grid: Installation, Site details, Security and Loading speed, one variant each, in the legacy order
  // (`GENERAL_SKELETON_CARD_COUNT` = 4). The card is the kit pattern `InfoCard`.
  import InfoCard from '@/views/projects/project/general/ui/InfoCard.vue'

  export type GeneralCardSkeletonVariant = 'installation' | 'siteDetails' | 'security' | 'loadingSpeed'

  withDefaults(defineProps<{
    variant?: GeneralCardSkeletonVariant
  }>(), {
    variant: 'installation',
  })
</script>

<style lang="scss" scoped>
// V4 differs from V2 on all of these: the root paints the surface colour, is a wrapping row whose
// bones take a full row (`flex: 1 1 100%`, a width is ignored) and carry 16px margins, and vertical margins of siblings do not
// collapse. Every bone below states its margins as V2 laid them out (collapsed between siblings, kept inside a flex item).
.skeleton-loader {
  height: 100%;

  .version-box {
    width: 50%;
  }
}

.v-skeleton-loader {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-start;
  background: transparent;

  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
    margin: 0;
  }

  &.title {
    margin-bottom: 16px;

    &.title--speed {
      margin-bottom: 6px;
    }

    :deep(.v-skeleton-loader__header) {
      width: 120px;
      height: 10px;
      margin: 6px 0;
    }
  }

  &.version {
    margin: 4px 0;

    :deep(.v-skeleton-loader__text) {
      width: 70px;
      height: 6px;
      margin: 7px 0 0;
    }

    :deep(.v-skeleton-loader__chip) {
      height: 30px;
      width: 86px;
      margin: 16px 0 0;
      border-radius: 3px;
    }

    :deep(.v-skeleton-loader__chip + .v-skeleton-loader__text) {
      margin: 16px 0;
    }
  }

  &.button {
    align-self: stretch;
    margin-top: auto;

    :deep(.v-skeleton-loader__header) {
      margin-top: 16px;
      width: 100%;
      height: 42px;
    }

    &--security :deep(.v-skeleton-loader__header) {
      margin-top: 8px;
    }
  }

  // Three rows in a block `div`: the V2 roots (`margin: 4px 0 0`, `8px` below all but the last) collapse with their bones' 7px margins.
  &.site-row {
    :deep(.v-skeleton-loader__text) {
      width: 96px;
      height: 6px;
      margin: 8px 0 0;
    }

    :deep(.v-skeleton-loader__header) {
      height: 10px;
      width: 120px;
      margin: 14px 0 0;
    }

    &:first-child :deep(.v-skeleton-loader__text) {
      margin-top: 7px;
    }

    &:last-child :deep(.v-skeleton-loader__header) {
      margin-bottom: 7px;
    }
  }

  &.security-row {
    margin: 4px 0 0;

    :deep(.v-skeleton-loader__header) {
      height: 10px;
      width: 120px;
      margin: 6px 0 0;
    }

    :deep(.v-skeleton-loader__text) {
      width: 96px;
      height: 6px;
      margin: 14px 0 7px;
    }
  }

  &.switch {
    :deep(.v-skeleton-loader__chip) {
      width: 45px;
      height: 28px;
      border-radius: 100px;
    }
  }

  &.speed {
    // Legacy `margin: 4px 0; margin-top: 24px` on a centred column.
    margin: 24px 0 4px;
    align-items: center;

    :deep(.v-skeleton-loader__avatar) {
      // V4 pins the avatar to 48px with `min-*` / `max-*` and gives it `8px 16px`; V2 measured `0 0 10px`.
      width: 94px;
      height: 94px;
      min-width: 94px;
      min-height: 94px;
      max-width: 94px;
      max-height: 94px;
      margin: 0 0 10px;
      border: 8px solid var(--v-gray-lighten2);
    }

    :deep(.v-skeleton-loader__text) {
      width: 40px;
      height: 10px;
      margin: 28px 0 22px;
    }
  }
}

.speed-skeleton {
  width: 50%;
}
</style>
