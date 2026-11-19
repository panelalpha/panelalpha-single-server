<template>
  <v-card
    class="onboarding-modal"
    :class="`card-width-${width}`"
  >
    <ModalCloseButton
      class="close-model"
      :disabled="closeDisabled"
      :push-right="false"
      @click="emit('close')"
    />

    <slot />
  </v-card>
</template>

<script lang="ts" setup>
  // Card of an onboarding step (variant `onboarding`): the X sits above the card's top right corner
  // (legacy `.close-model`) and the content (media, `v-card-title`, `v-card-text`, `v-card-actions`) is the consumer's slot. One root, so the
  // consumer's scoped rules on `.onboarding-modal` keep matching. Used by the onboarding steps and the Transfer of Domains (hosting).
  // `width`: 560 (default) or the wider content of the env vars (640) and share access (724) steps (`card-width-*`).
  // `closeDisabled`: the X waits while the step's request runs.
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  withDefaults(defineProps<{
    width?: 560 | 640 | 724
    closeDisabled?: boolean
  }>(), {
    width: 560,
    closeDisabled: false,
  })

  const emit = defineEmits<{ close: [] }>()
</script>

<style lang="scss" scoped>
  .onboarding-modal {
    overflow: visible;
  }

  // Legacy `.close-model` of the onboarding modals: above the card's top right corner, out of
  // the title row. RTL flips it in the global RTL styles.
  .close-model {
    position: absolute;
    top: -40px;
    right: -8px;
  }

  // Legacy `@media (max-width: 480px)` of every onboarding modal: 24px side padding. `!important`: the consumers keep the `px-8` / `px-10`
  // utilities (`!important`) on their text and actions.
  @media (max-width: 480px) {
    .onboarding-modal :deep(.v-card-text),
    .onboarding-modal :deep(.v-card-actions) {
      padding-right: 24px !important;
      padding-left: 24px !important;
    }
  }
</style>
