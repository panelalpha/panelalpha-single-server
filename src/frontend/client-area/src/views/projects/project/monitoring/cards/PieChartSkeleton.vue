<template>
  <v-card-text class="data-container">
    <div class="chart">
      <v-skeleton-loader
        class="speed"
        type="avatar"
      />
    </div>

    <ul class="data-list">
      <div
        v-for="item in 5"
        :key="item"
        class="mb-3"
      >
        <div class="d-flex justify-space-between w-100">
          <v-skeleton-loader
            class="indicator"
            type="avatar, text"
          />

          <v-skeleton-loader
            class="bg-text"
            type="text"
          />
        </div>
      </div>
    </ul>
  </v-card-text>
</template>

<script lang="ts" setup>
  // The pie and the doughnut cards show
  // it while a breakdown loads: a 180px circle and five rows of a dot with a label and a short bar.
</script>

<style lang="scss" scoped>
.data-list {
  display: flex;
  width: 100%;
  flex-direction: column;
}

// V4 bones take `flex: 1 1 100%` and a 16px margin on every side, so the bones are pinned to the
// legacy sizes and their margins are restated (legacy bones had none, except the one given below).
.v-skeleton-loader {
  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
    margin: 0;
  }

  &.speed {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    min-width: 180px;
    min-height: 180px;

    :deep(.v-skeleton-loader__avatar) {
      width: 180px;
      height: 180px;
    }
  }

  &.indicator {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    height: 24px;

    :deep(.v-skeleton-loader__avatar) {
      width: 10px;
      height: 10px;
      border-radius: 100%;
    }

    :deep(.v-skeleton-loader__text) {
      width: 80px;
      height: 10px;
      border-radius: 3px;
      margin-left: 16px;
    }
  }

  &.bg-text {
    :deep(.v-skeleton-loader__text) {
      width: 32px;
      height: 10px;
      border-radius: 3px;
    }
  }

  :deep(.v-skeleton-loader__text) {
    width: 40px;
    height: 10px;
    margin: 0;
  }
}
</style>
