<template>
  <app-dialog
    :model-value="modelValue"
    scroll-lock="mobile"
    @after-leave="emit('after-leave')"
    @update:model-value="emit('update:model-value', $event)"
  >
    <basic-modal
      :buttons="buttons"
      :close-class="{ 'mcp-modal-close--locked': closeLocked }"
      :close-visible="closeVisible"
      :color="variant === 'create' ? 'primary' : 'error'"
      :data-testid="testId"
      :icon="variant === 'create' ? '$lock' : '$alertwarning'"
      :loading="loading"
      :title="title"
      width="560"
      @button-click="emit('button-click', $event)"
      @modal-close="emit('update:model-value', false)"
    >
      <template #custom>
        <slot />
      </template>

      <template #actions>
        <slot name="actions" />
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // Shell of the three Connect AI token modals (create, revoke, delete): `AppDialog` with the kit card `BasicModal`.
  // The variant sets the title icon and its colour; the body is the default slot (`custom` of the card), the buttons come as `buttons`
  // (`button-click`), and the `actions` slot stays for free actions after them. The dialog keeps the plain V4 shell (no legacy overlay, the V4
  // transition). The rules of `BasicModal.scss` that reach the body (checkbox, fields) stay in each modal's own scoped styles,
  // because slot content carries the scope id of the modal that fills it.
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  withDefaults(defineProps<{
    modelValue: boolean
    /** `create` is the lock icon in the primary colour, `danger` the warning icon in the error colour. */
    variant: 'create' | 'danger'
    title: string
    testId: string
    closeVisible?: boolean
    /** Inline `pointer-events: none` on the close button while the request runs. */
    closeLocked?: boolean
    /** The footer of the card (`BasicModal` `buttons`). */
    buttons?: ModalButton[]
    /** The spinner on every button but Cancel (`BasicModal` `loading`); Cancel stays clickable and the modal guards it. */
    loading?: boolean
  }>(), {
    closeVisible: true,
    closeLocked: false,
    buttons: () => [],
    loading: false,
  })

  const emit = defineEmits<{
    'update:model-value': [value: boolean]
    'after-leave': []
    'button-click': [id: string]
  }>()
</script>

<style lang="scss" scoped>
// Inline `pointer-events: none` on the close button while
// submitting, as in legacy. The X is rendered by the card, so the rule reaches it from the card root (it carries the scope id of this file).
.basic-modal :deep(.mcp-modal-close--locked) {
  pointer-events: none;
}
</style>
