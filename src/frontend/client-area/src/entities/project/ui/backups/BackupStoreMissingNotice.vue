<template>
  <AppMessage
    data-testid="backup-store-missing-notice"
    variant="warning"
  >
    {{ t('message.backup.noStore.notice', { defaultValue: 'No backup store is set up, so backups cannot be created or scheduled.' }) }}

    <template #action>
      <AppButton
        v-if="freePanel"
        class="backup-store-missing-notice__link font-weight-bold"
        kind="secondary"
        size="small"
        :to="{ path: '/settings', query: { tab: 'backups' } }"
      >
        {{ t(BACKUP_STORE_SET_UP.key, { defaultValue: BACKUP_STORE_SET_UP.defaultValue }) }}
      </AppButton>
    </template>
  </AppMessage>
</template>

<script lang="ts" setup>
  // Shown where a backup would be created while no backup store exists (`isBackupStoreMissing`). The store is set in Settings, which only
  // a Free panel has, so other panels get the text without the button (same rule as `BackupAutomaticSwitcher`). The host passes `freePanel`.
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { BACKUP_STORE_SET_UP } from './backup-store-missing'

  withDefaults(defineProps<{
    freePanel?: boolean
  }>(), {
    freePanel: false,
  })

  const { t } = useTranslation()
</script>
