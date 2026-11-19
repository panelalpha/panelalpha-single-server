<template>
  <div class="d-flex flex-column px-6 py-6 analytics-card-skeleton">
    <div class="d-flex indicator-container">
      <div
        v-for="index in 3"
        :key="index"
        class="d-flex align-center indicator-box"
      >
        <v-skeleton-loader
          class="indicator"
          type="chip"
        />

        <v-skeleton-loader
          class="text"
          type="text, header"
        />
      </div>
    </div>

    <div class="d-flex flex-column pt-8">
      <div class="d-flex flex-column chart-column">
        <div
          v-for="index in 6"
          :key="`x-${index}`"
          class="d-flex align-center"
        >
          <v-skeleton-loader
            class="x-label"
            type="text"
          />

          <v-skeleton-loader
            class="x"
            type="text"
          />
        </div>
      </div>

      <div class="d-flex justify-space-between align-center ml-12 mr-2 mt-1">
        <v-skeleton-loader
          v-for="index in 8"
          :key="`y-${index}`"
          class="y-label"
          type="text"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The placeholder of an analytics card while its
  // report loads. Three indicator boxes, six chart lines with their labels and a row of eight axis labels.
</script>

<style lang="scss" scoped>
// Legacy `.v-skeleton-loader::v-deep` rules, one to one (V2 `__chip` / `__text` / `__header` bones are the same classes in V4).
// V4 differences: the bones take `flex: 1 1 100%` (a width is ignored) and a 16px margin on all sides.
.v-skeleton-loader {
  max-width: 100%;
  overflow: hidden;

  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
  }

  &.indicator {
    margin-right: 8px;

    :deep(.v-skeleton-loader__chip) {
      width: 24px;
      height: 24px;
      margin: 4px;
      border-radius: 3px;
    }
  }

  &.text {
    display: flex;
    justify-content: center;
    flex-direction: column;

    :deep(.v-skeleton-loader__text) {
      width: 70px;
      height: 6px;
      margin: 6px 0;
      border-radius: 3px;
      margin-bottom: 10px;
    }

    :deep(.v-skeleton-loader__header) {
      width: 86px;
      height: 20px;
      border-radius: 4px;
    }
  }

  &.x {
    width: 100%;

    :deep(.v-skeleton-loader__text) {
      flex: 1 1 auto;
      width: 100%;
      height: 1px;
      margin-left: 8px;
      margin-bottom: 0;
    }
  }

  &.x-label :deep(.v-skeleton-loader__text) {
    width: 24px;
    height: 8px;
    margin: 6px 10px 6px 0;
  }

  &.y-label :deep(.v-skeleton-loader__text) {
    width: 24px;
    height: 6px;
    margin: 6px 8.5px 12px;
  }
}

.chart-column {
  justify-content: space-between;
  min-height: 200px;
}

.indicator-container {
  max-width: 100%;
  min-width: unset;
  width: 538px;
  justify-content: space-between;
  flex-wrap: wrap;
}
</style>
