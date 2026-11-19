<template>
  <span
    class="secret-value"
    :data-testid="`secret-${secret}`"
  >
    <span class="secret-value__text">{{ shown ?? MASK }}</span>

    <AppButton
      class="secret-value__toggle ml-2"
      :data-testid="`secret-${secret}-toggle`"
      kind="link"
      :loading="loading"
      size="small"
      @click="toggle"
    >
      {{ shown === null ? t('button.secret.show') : t('button.secret.hide') }}
    </AppButton>

    <password-confirm-modal
      v-if="confirmOpen"
      @confirmed="onConfirmed"
      @modal-close="confirmOpen = false"
    />
  </span>
</template>

<script lang="ts" setup>
  // One secret of a project: the backend masks it in the answer that loads the page, so the value comes
  // from `POST .../secrets/reveal`, which asks for the password when the confirmation window has passed.
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PasswordConfirmModal from './PasswordConfirmModal.vue'
  import { apiErrorStatus, revealProjectSecret } from './secret.api'

  const props = defineProps<{
    instanceId: number | string
    /** The name of the secret the reveal endpoint answers, e.g. `DB_PASSWORD`. */
    secret: string
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  /** The mask of the backend (`ProjectSecrets::MASK`), so a masked value reads the same before and after a reload. */
  const MASK = '********'

  const shown = ref<string | null>(null)
  const loading = ref(false)
  const confirmOpen = ref(false)

  function toggle (): void {
    if (shown.value !== null) {
      shown.value = null
      return
    }
    void reveal()
  }

  /** A 423 asks for the password first; the modal then calls `reveal` again. */
  async function reveal (): Promise<void> {
    if (loading.value) {
      return
    }
    loading.value = true
    try {
      shown.value = (await revealProjectSecret(props.instanceId, props.secret)).value
    } catch (error) {
      if (apiErrorStatus(error) === 423) {
        confirmOpen.value = true
      } else {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      loading.value = false
    }
  }

  function onConfirmed (): void {
    confirmOpen.value = false
    void reveal()
  }
</script>

<style lang="scss" scoped>
.secret-value {
  display: inline-flex;
  align-items: center;
}

.secret-value__text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  word-break: break-all;
}
</style>
