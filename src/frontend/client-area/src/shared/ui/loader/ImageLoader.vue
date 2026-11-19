<template>
  <div class="loader-bg">
    <v-progress-circular
      color="gray-lighten-2"
      indeterminate
      size="32"
    />
  </div>
</template>

<script lang="ts" setup>
  // The `v-img` placeholder of a screenshot
</script>

<style lang="scss" scoped>
.loader-bg {
  background: var(--v-gray-lighten5);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
