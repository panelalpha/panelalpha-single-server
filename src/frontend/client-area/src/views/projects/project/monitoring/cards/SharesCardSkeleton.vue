<template>
  <ul class="item-list d-flex flex-column">
    <div
      v-for="item in 5"
      :key="item"
      class="mb-4"
    >
      <div class="d-flex justify-space-between align-center w-100 skeleton-container">
        <v-skeleton-loader
          class="indicator"
          type="avatar, heading"
        />

        <v-skeleton-loader
          class="progress"
          type="heading, text"
        />
      </div>
    </div>
  </ul>
</template>

<script lang="ts" setup>
  // Five rows of an avatar with a heading
  // and a heading with a thin bar, while a shares card loads.
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// V4 bones take `flex: 1 1 100%` and a 16px margin on every side, so the bones are pinned to the
// legacy sizes and their margins are restated.
.v-skeleton-loader {
  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
  }

  &.indicator {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 280px;

    :deep(.v-skeleton-loader__avatar) {
      width: 21px;
      height: 15px;
      min-height: 15px;
      max-height: 15px;
      margin: 0 10px 0 0;
      border-radius: 2px;
    }

    :deep(.v-skeleton-loader__heading) {
      width: 80px;
      height: 10px;
      margin: 0;
      border-radius: 3px;
    }
  }

  &.progress {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    width: 200px;

    @media (max-width: map.get(v.$grid-breakpoints, sm)) {
      margin-top: 8px;
      justify-content: space-between;
      width: 100%;

      :deep(.v-skeleton-loader__text) {
        width: 100%;
        max-width: 50%;
      }
    }

    :deep(.v-skeleton-loader__heading) {
      height: 10px;
      width: 32px;
      margin: 0 10px 0 0;
    }

    :deep(.v-skeleton-loader__text) {
      max-width: 100px;
      height: 4px;
      margin: 0;
    }
  }
}

// `!important` stays: the row has the Vuetify utility classes `align-center` and `justify-space-between`, which are `!important`
// (`:is(.v-application, …) .x`). Without `!important` they would win on mobile, instead of the alignment legacy has.
.skeleton-container {
  @media (max-width: map.get(v.$grid-breakpoints, sm)) {
    flex-direction: column;
    align-items: flex-start !important;
    justify-content: center !important;
  }
}
</style>
