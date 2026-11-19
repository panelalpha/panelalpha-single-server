<template>
  <div class="preview-not-available">
    <preview-not-available-icon-sm class="preview-not-available__img preview-not-available__img--sm" />
  </div>
</template>

<script lang="ts" setup>
  // `isSmall` is declared and unused, as in legacy.
  import PreviewNotAvailableIconSm from './PreviewNotAvailableIconSm.vue'
</script>

<style lang="scss" scoped>
.preview-not-available {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  background: #fff;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    z-index: 1;
    background: var(--v-primary-lighten4);
    opacity: 0.8;
    height: 100%;
    width: 100%;
    border-radius: 8px 8px 0 0;
  }

  &__img {
    height: 32px;
    width: 32px;
    position: relative;
    z-index: 2;

    &--sm {
      height: 20px;
      width: 20px;
    }
  }
}
</style>
