<template>
  <div>
    <v-card
      data-testid="instance-card-skeleton"
      elevation="4"
      rounded
    >
      <v-skeleton-loader
        class="image"
        type="image"
      />

      <v-skeleton-loader
        class="title"
        type="heading, chip"
      />

      <v-skeleton-loader
        class="text bg-text"
        type="text"
      />

      <v-skeleton-loader
        class="chips"
        type="chip@2"
      />

      <v-skeleton-loader
        class="actions"
        type="chip"
      />
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  // Static skeleton, no script logic.
</script>

<style lang="scss" scoped>
.image {
  width: 100%;
  height: 200px;
}

// Bone colour: V2 scoped `background: var(--v-gray-lighten2) !important` lost to the global `_skeleton.scss` `--v-skeleton-base`
// rule (same specificity, later in the cascade), so the painted bone is the skeleton colour and the rule is not carried here.
.v-skeleton-loader {
  // V4 root is a wrapping flex row, its bones take `flex: 1 1 100%` (so a width is ignored) and carry a 16px margin on every
  // side; V2 roots were blocks and bones had neither.
  flex-wrap: nowrap;

  :deep(.v-skeleton-loader__bone) {
    flex: 0 0 auto;
    border-radius: 3px;
    margin: 0;
  }

  :deep(.v-skeleton-loader__image) {
    border-radius: 0px !important;
    height: 100%;
    width: 100%;
  }
}

.title.v-skeleton-loader {
  display: flex;
  justify-content: space-between;
  padding: 16px 16px 0 16px;
  align-items: center;

  :deep(.v-skeleton-loader__heading) {
    width: 143px;
    height: 28px;
  }

  :deep(.v-skeleton-loader__chip) {
    width: 20px;
    height: 20px;
  }
}

.text.v-skeleton-loader {
  display: flex;
  justify-content: space-between;
  padding: 7px 16px 7px 16px;
  align-items: center;

  :deep(.v-skeleton-loader__text) {
    width: 205px;
    height: 10px;
    // V2 `.v-skeleton-loader__text { margin-bottom: 6px }`.
    margin-bottom: 6px;
  }
}

.chips.v-skeleton-loader {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 12px 16px 12px 16px;

  :deep(.v-skeleton-loader__chip) {
    border-radius: 16px;
    margin-right: 8px;
    height: 20px;
    width: 68px;
  }
}

.actions.v-skeleton-loader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 10px 16px;

  :deep(.v-skeleton-loader__chip) {
    height: 10px;
    width: 40px;
  }

  :deep(.v-skeleton-loader__button) {
    height: 38px;
    width: 38px;
  }
}
</style>
