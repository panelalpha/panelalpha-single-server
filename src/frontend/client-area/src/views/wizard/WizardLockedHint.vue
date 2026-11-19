<template>
  <div
    class="wizard-locked"
    :class="{ 'wizard-locked--active': active }"
    data-testid="wizard-locked-hint"
  >
    <slot />

    <v-tooltip
      v-if="active"
      activator="parent"
      close-delay="150"
      location="bottom"
      max-width="440"
      open-delay="150"
      :text="t('setup.wizard.general.readonlyHint', { defaultValue: 'Administrator account has been already created and cannot be changed in the wizard. You can change that later in Settings.' })"
    />
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'

  // A locked field of step 1 (the admin area has a `v-tooltip` around the column): once the account exists the field is
  // disabled and a tooltip says why. The source lets the pointer rest on the disabled field with the default cursor.
  defineProps<{ active?: boolean }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
  .wizard-locked--active,
  .wizard-locked--active :deep(input) {
    cursor: default;
  }
</style>
