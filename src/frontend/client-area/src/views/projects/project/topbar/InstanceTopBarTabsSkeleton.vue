<template>
  <div class="d-flex skeleton-container">
    <div
      v-for="index in 5"
      :key="index"
      class="d-flex flex-column mr-10"
    >
      <v-skeleton-loader
        class="tab"
        type="header, text"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  // A skeleton of the tabs row.
</script>

<style lang="scss" scoped>
// V4 roots paint the surface colour and bones carry 16px margins and a full-row `flex` (V2: none); the legacy top margins are restated.
.tab {
  width: 48px;
  margin-bottom: -12px;
  background: transparent;
}

:deep(.v-skeleton-loader__header) {
  flex: 0 0 auto;
  width: 48px;
  height: 8px;
  border-radius: 3px;
  margin: 19px 0 0;
}

:deep(.v-skeleton-loader__text) {
  flex: 0 0 auto;
  border-radius: 32px;
  height: 3px;
  width: 48px;
  margin: 18px 0 0;
}
</style>
