<template>
  <v-card
    class="mb-8"
    data-testid="summary-plan-skeleton"
    elevation="4"
  >
    <v-card-title class="pb-6 d-flex flex-row justify-space-between">
      <v-skeleton-loader
        type="heading"
        width="100%"
      />
    </v-card-title>

    <v-card-text class="d-flex justify-space-between">
      <div
        v-for="item in rows"
        :key="item"
        class="d-flex"
      >
        <v-skeleton-loader type="avatar" />

        <div class="d-flex flex-column ml-2">
          <v-skeleton-loader
            class="mb-1"
            type="text"
            width="120px"
          />

          <v-skeleton-loader
            type="text"
            width="80px"
          />

          <v-skeleton-loader
            type="text"
            width="100px"
          />
        </div>
      </div>
    </v-card-text>

    <v-divider class="mt-6" />

    <v-card-text>
      <div class="summary-data">
        <div
          v-for="item in 6"
          :key="item"
        >
          <v-skeleton-loader
            class="mb-3"
            type="text"
            width="120px"
          />

          <div class="summary-data__data mb-2">
            <v-skeleton-loader
              type="text"
              width="150px"
            />

            <v-skeleton-loader
              type="text"
              width="100px"
            />
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    rows?: number
  }>(), {
    rows: 2,
  })
</script>

<style lang="scss" scoped>
@use './skeleton' as *;

// The global `.v-card-text:last-child { padding-bottom: 24px }` misses V4 cards (they end with `.v-card__overlay`), so the last text block restates it.
.v-card > .v-card-text:last-of-type {
  padding-bottom: 24px;
}

.summary-data {
  display: flex;
  flex-direction: column;

  &__data {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}

// (The 96px avatar rule of legacy is in `HostingAvailableSpaceCard`, which never renders a skeleton, so it is not ported.)
.v-skeleton-loader {
  @include summary-skeleton;
}
</style>
