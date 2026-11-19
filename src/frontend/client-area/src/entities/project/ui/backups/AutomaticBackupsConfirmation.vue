<template>
  <v-card
    class="basic-modal"
    data-testid="automatic-backups-confirmation"
    elevation="4"
  >
    <v-card-title class="d-flex flex-wrap align-center p-t-5">
      <v-icon
        color="error"
        icon="$alertwarning"
        size="24"
      />

      <p class="p-2 ml-4 mb-0 font-weight-bold heading--text">
        {{ t('heading.instance.siteDetails.security.automaticBackup.modal.title') }}
      </p>
    </v-card-title>

    <v-card-text class="p-t-4 d-flex">
      <p
        v-safe-html="infoHtml"
        class="mb-0 p-3"
      />
    </v-card-text>

    <v-divider class="mt-6" />

    <v-card-actions class="d-flex flex-column pt-5 pb-4">
      <div class="w-100">
        <AppButton
          block
          kind="danger"
          :loading="submitting"
          size="small"
          @click="disableAutobackup"
        >
          <template #loader>
            <Loader
              color="white"
              :size="24"
            />
          </template>

          <span class="font-weight-bold">{{ t('button.disableAutomaticBackups') }}</span>
        </AppButton>
      </div>

      <div class="w-100 mt-2">
        <AppButton
          block
          kind="secondary"
          size="small"
          @click="emit('card-close')"
        >
          <span class="heading--text font-weight-bold">{{ t('button.cancel') }}</span>
        </AppButton>
      </div>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
  // Disabling sends the settings with `frequency: never`.
  import type { AutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { saveAutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { escapeHtml } from '@/shared/format/escape-html'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { disabledSettings } from './automatic-backup'

  const props = defineProps<{
    settings: AutomaticBackupSettings
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'reload-settings': []
    'card-close': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const submitting = ref(false)

  // The legacy `<i18next>` component put the instance title into the `<instance>` tag of the copy; the title is escaped here.
  const infoHtml = computed(() => t('heading.instance.siteDetails.security.automaticBackup.modal.info')
    .replace(/<instance\s*\/>|<instance>[\s\S]*?<\/instance>|\{(?:project|instance)\}/g, `<strong>${escapeHtml(props.instance.title ?? '')}</strong>`))

  async function disableAutobackup (): Promise<void> {
    submitting.value = true
    try {
      await saveAutomaticBackupSettings(props.instance.id, disabledSettings(props.settings))
      alerts.addAlert({ success: true, successMessage: t('notification.instance.automaticBackup.disable.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
    emit('reload-settings')
    submitting.value = false
    emit('card-close')
  }
</script>

<style lang="scss" scoped>
// V2 `.v-menu__content .v-sheet { background: var(--v-tooltip-base) }` reached this card (a V2 `.v-card` is a `.v-sheet`, a V4 card is not).
.v-card {
  background-color: var(--v-tooltip-base);
}

// V4 `.v-card-actions` has an 8px `gap`; V2 had none, the second button keeps only its `mt-2`.
.v-card-actions {
  gap: 0;
}
</style>
