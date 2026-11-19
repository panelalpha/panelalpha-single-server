<template>
  <div
    class="deploy-logs-skeleton"
    data-testid="deploy-logs-skeleton"
  >
    <deploy-steps-list
      class="mb-4"
      loading
    />

    <v-skeleton-loader
      class="deploy-logs-skeleton__console"
      data-testid="deploy-logs-console-skeleton"
      type="image"
    />
  </div>
</template>

<script lang="ts" setup>
  // The deploy logs modal while the deploy is read (no legacy counterpart): the three steps
  // (Preparing, Cloning, Running) as skeleton bones (icon, name, state) and one bone the size of the console, so nothing jumps
  // when the log arrives.
  import DeployStepsList from './DeployStepsList.vue'
</script>

<style lang="scss" scoped>
.deploy-logs-skeleton__console {
  background: transparent;

  // The console: 360px high, 14px radius.
  :deep(.v-skeleton-loader__image) {
    height: 360px;
    margin: 0;
    border-radius: 14px;
  }
}
</style>
