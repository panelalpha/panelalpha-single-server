<template>
  <v-card elevation="4">
    <v-card-text class="d-flex justify-space-between pb-6">
      <div class="d-flex flex-column justify-space-between">
        <v-skeleton-loader
          class="bg-text mb-2"
          type="heading"
          width="80px"
        />

        <v-skeleton-loader
          class="bg-text"
          type="text"
          width="400px"
        />
      </div>

      <div class="d-flex align-center">
        <v-skeleton-loader
          class="switch"
          type="heading"
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  // Skeleton of a setting card, formerly `AutoUpdatesCardSkeleton`: heading and text bones on the left, the
  // switch bone on the right. `SettingCard` renders it while `loading` is true.
</script>

<style lang="scss" scoped>
.v-skeleton-loader.bg-text {
  // V2 skeleton is a block formatting context, so the margins of its bones and the `mb-2` of the first loader collapse (`flow-root`; V4 is a
  // flex column); the `bg-text` class of V4 also paints the text white, where V2 inherited the card text colour.
  display: flow-root;
  color: inherit;

  :deep(.v-skeleton-loader__heading) {
    max-height: 10px;
    margin: 7px 0;
    margin-right: 0px;
    width: 100%;
  }

  :deep(.v-skeleton-loader__text) {
    max-height: 8px;
    margin: 5px 0;
  }
}

.v-skeleton-loader.switch {
  // The switch placeholder is the 45x28 bone itself (legacy), without the root surface and the heading margins V4 adds.
  display: flow-root;
  width: 45px;
  height: 28px;
  background: transparent;

  :deep(.v-skeleton-loader__heading) {
    height: 28px;
    width: 45px;
    margin: 0;
    border-radius: 100px;
  }
}
</style>
