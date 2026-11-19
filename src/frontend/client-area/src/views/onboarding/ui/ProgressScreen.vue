<template>
  <v-card class="installation-card d-flex align-center mb-16">
    <div class="installation-card__content mx-auto align-center px-8 d-flex flex-column mt-8">
      <slot />
    </div>
  </v-card>
</template>

<script lang="ts" setup>
  // Full-screen progress card of the onboarding: the install, super quick, sync and import results
  // on the body colour, with a 684px column.
</script>

<style lang="scss" scoped>
  .installation-card {
    max-height: 100vw;
    max-width: 100vw;
    display: flex;
    align-items: center;
    background: var(--v-body-base) !important;
    // V2 vendor `.v-dialog--fullscreen > .v-card { margin: 0 !important }` beat the `mb-16` utility; V4 has no such rule.
    margin-bottom: 0 !important;
  }

  .installation-card__content {
    max-width: 684px;
    width: 100%;
  }

  // The success box of the install, super quick and import results (content of the consumer's slot).
  .installation-card :deep(.success-box) {
    width: 100%;
    background: var(--v-primary-lighten4);
    color: rgb(var(--v-theme-primary));
    padding: 16px;
    text-align: center;
    border-radius: 8px;
  }
</style>
