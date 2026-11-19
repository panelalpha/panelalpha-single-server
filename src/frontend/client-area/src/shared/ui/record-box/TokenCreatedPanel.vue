<template>
  <div class="d-flex flex-column token-created-panel">
    <label class="mb-2">{{ nameLabel }}</label>

    <v-text-field
      :class="['v-input--md', 'mb-4', 'token-created-panel__name', nameClass]"
      :data-testid="nameTestid"
      density="compact"
      disabled
      hide-details
      :model-value="name"
      readonly
      variant="outlined"
    />

    <label class="mb-2">{{ tokenLabel }}</label>

    <div class="well well--gray py-3 px-4">
      <ul class="record-box-list">
        <CopyRecordItem
          class="token-created-panel__token"
          :data-testid="tokenTestid"
          :value="token"
        />
      </ul>
    </div>

    <AppMessage
      class="mt-2"
      icon="$alertcircle"
      variant="error"
    >
      <slot name="warning" />
    </AppMessage>

    <div class="d-flex flex-column mb-6 mt-5">
      <div class="modal-divider mb-5" />

      <p class="p-2">
        <b>{{ t('message.confirmBeforeProceedingAction') }}</b>
      </p>

      <checkbox
        v-model="confirmed"
        color="primary"
        :data-testid="confirmTestid"
        :label="confirmLabel"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Step "token created" of the token modals: reseller API tokens (`ApiTokenCreateModal.vue`) and Connect AI
  // (`McpTokenCreateModal.vue`).
  // One look (the reseller one, already on the kit row `CopyRecordItem`); the props carry only the copy, the values, the test ids and a hook class.
  // The modal owns the request and drops the token on `after-leave`: `v-if` on this panel unmounts the row, so "Copied" resets with it.
  import { useTranslation } from 'i18next-vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import CopyRecordItem from './CopyRecordItem.vue'

  withDefaults(defineProps<{
    name: string
    token: string
    nameLabel: string
    tokenLabel: string
    confirmLabel: string
    /** A hook class on the name field, without a style of its own (tests of the consumer). */
    nameClass?: string
    nameTestid?: string
    tokenTestid?: string
    confirmTestid?: string
  }>(), {
    nameClass: undefined,
    nameTestid: undefined,
    tokenTestid: undefined,
    confirmTestid: undefined,
  })

  const confirmed = defineModel<boolean>('confirmed', { required: true })

  const { t } = useTranslation()
</script>

<!-- The checkbox and `<b>` rules of the modal card reach only elements with this file's scope id. -->
<style lang="scss" scoped src="@/shared/ui/modal/BasicModal.scss" />

<style lang="scss" scoped>
// V2 `dense outlined` kept the native input's 8px vertical padding inside the 48px `v-input--md` slot (41px input); the global
// `md` input rule zeroes it (the same rule as step 1 of both token modals).
.v-input--md :deep(.v-field .v-field__input) {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

// Legacy set this inline on the disabled name field. Four classes, so the colour wins over the global
// `.v-theme--* .v-input.v-input--disabled`, as the V2 inline `color` won over `.v-input--is-disabled`.
.v-input.v-input--disabled.token-created-panel__name {
  pointer-events: none;
  background-color: var(--v-gray-lighten6);
  color: var(--v-gray-base);
  opacity: 0.5;
}

// Legacy `word-break: break-all` on the token: a token without spaces wraps instead of overflowing.
.token-created-panel__token :deep(.record-box-copy-element) {
  word-break: break-all;
}

.modal-divider {
  width: 100%;
  height: 1px;
  background-color: var(--v-gray-lighten5);
}
</style>
