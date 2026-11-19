<template>
  <div class="recovery-code">
    <div
      class="recovery-code-box"
      :data-testid="testids.code"
    >
      <div
        v-for="code in codes"
        :key="code"
        class="recovery-code-row"
      >
        <span class="recovery-code-value">{{ code }}</span>

        <CopyTextButton
          color="primary"
          :data-testid="testids.copy"
          :size="24"
          :text="code"
        />
      </div>
    </div>

    <AppMessage
      class="mt-4 recovery-alert"
      :data-testid="testids.alert"
      :role="alertRole"
      variant="error"
    >
      <p>{{ alert }}</p>
    </AppMessage>

    <div class="mt-2">
      <h4 class="font-weight-600 recovery-confirm-title">
        {{ t('message.confirmAction') }}
      </h4>

      <label
        class="base--text checkbox-label d-flex align-center p-2"
        :data-testid="testids.confirmLabel"
      >
        <Checkbox
          v-model="confirmed"
          class="mt-4 align-start"
          color="primary"
          :data-testid="testids.confirm"
          :label="confirmLabel"
        />
      </label>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // 2FA recovery codes: every code with its Copy button, the warning and the confirmation checkbox.
  // Used in Login (recovery step) and the 2FA modal in My Account.
  // One look (the Login variant); props only for the codes, the copy, the test ids and the warning role.
  import { useTranslation } from 'i18next-vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'

  withDefaults(defineProps<{
    codes: string[]
    alert: string
    confirmLabel: string
    alertRole?: 'status'
    testids?: {
      code?: string
      copy?: string
      alert?: string
      confirm?: string
      confirmLabel?: string
    }
  }>(), {
    alertRole: undefined,
    testids: () => ({}),
  })

  const confirmed = defineModel<boolean>({ default: false })
  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  .recovery-code-box {
    display: flex;
    width: 100%;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    // One code keeps the legacy 60px box; a whole set makes it as tall as its rows.
    min-height: 60px;
    padding: 6px 0;
    color: rgb(var(--v-theme-primary));
    // Legacy `rgba(7, 192, 126, 0.05)` is primary at 5%; on the primary token so that a custom brand
    // colour tints it like the text next to it (same value in the default theme).
    background: rgba(var(--v-theme-primary), 0.05);
    border-radius: 6px;
    font-weight: v.$font-weight-bold;
  }

  // A backup code is case-sensitive, so the box never re-cases it; monospace keeps l/I/1 and O/0 apart.
  .recovery-code-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  }

  .recovery-code-row {
    display: flex;
    width: 100%;
    min-height: 32px;
    align-items: center;
    justify-content: center;
  }

  // The legacy inline style as a class; `font-weight-600` sets the weight.
  .recovery-confirm-title {
    font-size: v.$font-size-base;
    line-height: v.$line-height-base;
  }

  // The checkbox sits at the top of its label (legacy `::v-deep .v-input--checkbox`).
  .recovery-code :deep(.v-input.v-checkbox .v-selection-control) {
    min-height: unset;
    max-height: unset;
    align-items: flex-start;
  }
</style>
