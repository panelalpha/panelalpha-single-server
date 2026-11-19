<template>
  <div class="preview-error">
    <preview-error-icon-sm class="preview-error__img preview-error__img--sm" />
  </div>
</template>

<script lang="ts" setup>
  // `isSmall` is declared and unused, as in legacy.
  import PreviewErrorIconSm from './PreviewErrorIconSm.vue'
</script>

<style lang="scss" scoped>
.preview-error {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  background: var(--v-error-lighten5);
  overflow: hidden;
  border-radius: 100%;

  &::before {
    content: "";
    position: absolute;
    z-index: 1;
    opacity: 0.15;
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
