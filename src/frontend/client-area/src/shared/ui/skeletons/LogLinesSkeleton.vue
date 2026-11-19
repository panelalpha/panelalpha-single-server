<template>
  <v-skeleton-loader
    class="log-lines-skeleton"
    :type="`text@${lines}`"
  />
</template>

<script lang="ts" setup>
  // The lines of a log while it loads, in place of the log block (no spinner in the middle): the Logs dialog of Containers
  // and the deploy logs modal of a project. `data-testid` and classes fall through to the loader.
  withDefaults(defineProps<{
    lines?: number
  }>(), {
    lines: 8,
  })
</script>

<style lang="scss" scoped>
.log-lines-skeleton {
  background: transparent;
  padding: 8px 0;
}
</style>
