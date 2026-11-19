<template>
  <v-container class="api-view">
    <api-tokens-table />
  </v-container>
</template>

<script lang="ts" setup>
  import ApiTokensTable from './ApiTokensTable.vue'
</script>

<style lang="scss" scoped>
// V2 `.container` padding is 12px on every side, V4 `.v-container` is 16px. The wrapper keeps the V2 12px, so the table
// starts at x 332 px and is 1048 px wide at 1440 px as in legacy.
.api-view {
  padding: 12px;
}
</style>
