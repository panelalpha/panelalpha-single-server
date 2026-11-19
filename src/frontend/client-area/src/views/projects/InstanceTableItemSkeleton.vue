<template>
  <div
    class="d-flex align-center skeleton-row"
    data-testid="instance-table-skeleton"
  >
    <div class="checkbox-container d-flex align-center">
      <v-skeleton-loader
        class="checkbox"
        type="chip"
      />
    </div>

    <div class="name-container d-flex align-center mr-4">
      <v-skeleton-loader
        class="avatar mr-4"
        type="avatar"
      />

      <v-skeleton-loader
        class="names"
        type="heading, text"
      />
    </div>

    <div class="status-container mr-4 d-flex align-center mr-4">
      <v-skeleton-loader
        class="status"
        type="avatar"
      />
    </div>

    <div class="text-continer mr-4 d-flex align-center">
      <v-skeleton-loader
        class="bg-text"
        type="text"
      />
    </div>

    <div class="text-continer mr-4 d-flex align-center">
      <v-skeleton-loader
        class="bg-text"
        type="text"
      />
    </div>

    <div class="text-continer mr-4 d-flex align-center">
      <v-skeleton-loader
        class="bg-text"
        type="text"
      />
    </div>

    <div class="tags-container mr-4 d-flex align-center">
      <v-skeleton-loader
        class="tags"
        type="chip@3"
      />
    </div>

    <div class="actions-container d-flex justify-end align-center">
      <v-skeleton-loader
        class="actions"
        type="avatar"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Static skeleton, no script logic.
</script>

<style lang="scss" scoped>
.skeleton-row {
  // The global `_skeleton.scss` `.skeleton-row` (margin, padding, width) won over these in V2 (same specificity, later); its values are
  // the computed ones, so only the heights and borders are stated here.
  min-height: 66px;
  max-height: 66px;

  &:first-child {
    border-top: 1px solid var(--v-gray-lighten2);
  }

  &:last-child {
    border-bottom: 1px solid transparent;
  }
}

.checkbox-container {
  width: 46px;
}

// V4 root is a wrapping flex row, its bones take `flex: 1 1 100%` (a width is ignored) and carry a 16px margin; V2 roots were blocks
// and bones had no margin except `__text`.
.v-skeleton-loader {
  flex-wrap: nowrap;
  // V2 roots of these loaders were transparent (V4: the surface colour).
  background: transparent;

  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
    margin: 0;
  }

  :deep(.v-skeleton-loader__text) {
    margin-bottom: 6px;
  }

  &.checkbox {
    :deep(.v-skeleton-loader__chip) {
      width: 22px;
      height: 22px;
      position: relative;
      border-radius: 4px;
      border: 1px solid var(--v-gray-lighten2);
      background-color: var(--v-skeleton-base);
    }
  }

  &.avatar {
    :deep(.v-skeleton-loader__avatar) {
      width: 40px;
      height: 40px;
      min-width: 40px;
      max-width: 40px;
      min-height: 40px;
      max-height: 40px;
    }
  }

  &.names {
    width: 240px;
    display: block;

    :deep(.v-skeleton-loader__text) {
      width: 205px;
      height: 10px;
      border-radius: 3px;
      margin-top: 4px;
    }

    :deep(.v-skeleton-loader__heading) {
      height: 24px;
      width: 143px;
      border-radius: 3px;
    }
  }

  &.status {
    width: 80px;

    :deep(.v-skeleton-loader__avatar) {
      height: 18px;
      width: 18px;
      min-width: 18px;
      max-width: 18px;
      min-height: 18px;
      max-height: 18px;
      border-radius: 50%;
    }
  }

  &.bg-text {
    width: 126px;

    :deep(.v-skeleton-loader__text) {
      width: 80px;
    }
  }

  &.tags {
    display: flex;
    width: 299px;

    :deep(.v-skeleton-loader__chip) {
      margin-right: 8px;
      width: 68px;
      height: 20px;
    }
  }

  &.actions {
    width: 72px;

    :deep(.v-skeleton-loader__avatar) {
      height: 38px;
      width: 38px;
      min-width: 38px;
      max-width: 38px;
      min-height: 38px;
      max-height: 38px;
      margin-left: 34px;
    }
  }
}
</style>
