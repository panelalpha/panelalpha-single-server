<template>
  <v-card
    aria-atomic="true"
    aria-live="assertive"
    class="alert alert--error"
    elevation="4"
    role="alert"
    @mouseleave="alertTimeout"
    @mouseover="resetTimeout"
  >
    <div class="alert__icon-box">
      <v-icon
        color="error"
        icon="$alertwarning"
        size="20"
      />
    </div>

    <div class="alert__text-box">
      <p class="p-2 font-weight-bold mb-3">
        {{ t('message.alertManager.error') }}
      </p>

      <p class="mb-0 p-2">
        <template v-if="item.errorMessage">
          {{ item.errorMessage }}
        </template>

        <template v-else-if="item.html_text">
          <div v-safe-html:rich="item.html_text" />
        </template>

        <template v-else>
          {{ t('message.alertManager.error') }}
        </template>
      </p>
    </div>

    <div class="alert__close-box">
      <AppButton
        :aria-label="t('button.dismiss')"
        kind="icon"
        size="small"
        @click="removeAlert"
      >
        <v-icon
          icon="$close"
          size="16"
        />
      </AppButton>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
  import type { AlertItem } from '@/shared/alerts/alerts.store'
  // The whole close button is the click target (legacy listened on the icon only) and carries
  // the `button.dismiss` name the guide gives the control.
  import { useTranslation } from 'i18next-vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useAlertTimeout } from './alert-timeout'

  const props = defineProps<{ item: AlertItem }>()
  const emit = defineEmits<{ 'remove-alert': [id: number] }>()

  const { t } = useTranslation()

  function removeAlert () {
    emit('remove-alert', props.item.id)
  }

  const { alertTimeout, resetTimeout } = useAlertTimeout(removeAlert, () => props.item.sticky === true)
</script>

<style lang="scss" scoped>
.alert__text-box {
  white-space: normal;
  max-width: calc(100% - 40px);
}
</style>
