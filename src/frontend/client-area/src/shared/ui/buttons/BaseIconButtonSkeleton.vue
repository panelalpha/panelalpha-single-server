<template>
  <div class="d-flex flex-column skeleton-loader ml-4">
    <v-skeleton-loader type="chip" />
    <v-skeleton-loader type="text" />
  </div>
</template>

<script lang="ts" setup>
  // No logic: this component is markup only.
</script>

<style lang="scss" scoped>
:deep(.v-skeleton-loader__chip) {
  width: 24px;
  height: 24px;
  margin: 11px;
  border-radius: 3px;
}

:deep(.v-skeleton-loader__text) {
  height: 6px;
  width: 48px;
  border-radius: 3px;
  margin: 4px 0;
}
</style>
