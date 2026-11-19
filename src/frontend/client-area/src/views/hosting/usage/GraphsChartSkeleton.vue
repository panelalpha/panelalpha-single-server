<template>
  <div
    class="graphs-chart-skeleton"
    data-testid="graphs-chart-skeleton"
  >
    <div class="graphs-chart-skeleton__plot">
      <div
        v-for="index in 6"
        :key="`y-${index}`"
        class="d-flex align-center"
      >
        <v-skeleton-loader
          class="graphs-chart-skeleton__y-label"
          type="text"
        />

        <v-skeleton-loader
          class="graphs-chart-skeleton__line"
          type="text"
        />
      </div>
    </div>

    <div class="graphs-chart-skeleton__x-axis">
      <v-skeleton-loader
        v-for="index in 8"
        :key="`x-${index}`"
        class="graphs-chart-skeleton__x-label"
        type="text"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The placeholder of a Usage chart until the first metrics arrive (legacy draws an empty chart):
  // six grid lines with their y labels and a row of eight x labels. It fills the chart area of the card (200px or 240px, `.graphs-chart`).
</script>

<style lang="scss" scoped>
.graphs-chart-skeleton {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  padding: 8px 0 4px;
}

.graphs-chart-skeleton__plot {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
}

.graphs-chart-skeleton__x-axis {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0 0 64px;
}

.v-skeleton-loader {
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  background: transparent;

  // V4 bones take `flex: 1 1 100%` and a 16px margin.
  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
    margin: 0;
  }
}

.graphs-chart-skeleton__y-label :deep(.v-skeleton-loader__text) {
  width: 48px;
  height: 8px;
  margin-right: 16px;
}

.graphs-chart-skeleton__line {
  flex: 1 1 auto;

  :deep(.v-skeleton-loader__text) {
    flex: 1 1 auto;
    width: 100%;
    height: 1px;
  }
}

.graphs-chart-skeleton__x-label :deep(.v-skeleton-loader__text) {
  width: 40px;
  height: 8px;
}
</style>
