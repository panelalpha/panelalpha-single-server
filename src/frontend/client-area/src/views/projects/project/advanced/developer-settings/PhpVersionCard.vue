<template>
  <v-col
    class="pb-2"
    cols="12"
  >
    <SettingCard
      :description="t('heading.instance.advanced.developer.phpVersion.subtitle')"
      :loading="loading"
      :title="t('heading.instance.advanced.developer.phpVersion.title')"
    >
      <template #alert>
        <AlertSm
          class="alert-sm--primary"
          :text="t('heading.instance.advanced.developer.phpVersion.alert')"
        />
      </template>

      <template #action>
        <span class="p-3 d-flex align-center">
          {{ t('heading.instance.advanced.developer.phpVersion.status', { version: currentVersion?.label ?? '' }) }}
        </span>

        <AppButton
          kind="setting-action"
          :loading="versionsLoading"
          @click="emit('manage')"
        >
          <span class="font-weight-bold">{{ t('button.manage') }}</span>
        </AppButton>
      </template>
    </SettingCard>
  </v-col>
</template>

<script lang="ts" setup>
  // The status label is `label ?? ''`:
  // the legacy card crashed on `null` and printed `{{version}}` after a failed GET. The view owns the data and the modal, so a
  // click on Manage only emits `manage`.
  import type { PhpVersion } from './developer-settings.api'
  import { useTranslation } from 'i18next-vue'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'

  defineProps<{
    loading: boolean
    currentVersion: PhpVersion | null
    versionsLoading: boolean
  }>()

  const emit = defineEmits<{
    manage: []
  }>()

  const { t } = useTranslation()
</script>
