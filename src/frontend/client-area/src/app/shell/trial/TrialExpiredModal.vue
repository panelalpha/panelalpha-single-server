<template>
  <AppDialog
    :model-value="modelValue"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @update:model-value="emit('update:model-value', $event)"
  >
    <basic-modal
      :buttons="buttons"
      class="trial-expired-modal card-width-560"
      color="error"
      data-testid="shell-trial-modal"
      icon="$clock"
      :title="t('heading.trialExpiredModal.headline')"
      @button-click="onButton"
      @modal-close="emit('update:model-value', false)"
    >
      <template #custom>
        <div class="d-flex flex-column align-center">
          <TrialPlanIllustration class="mb-8" />

          <p
            v-safe-html="t('heading.trialExpiredModal.text')"
            class="p-d text--darken2 mb-0"
          />
        </div>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // Legacy opens it through `$refs.trialExpiredModal.open()` from `App.mounted`;
  // here `App.vue` owns the flag (`useTrialExpiredModal`) and passes it as `v-model`.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import { useSessionStore } from '@/shared/session/session.store'
  import { trialUpgradeUrl } from '@/shared/session/trial-rules'
  import TrialPlanIllustration from '@/shared/ui/illustrations/TrialPlanIllustration.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{ 'update:model-value': [value: boolean] }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const upgradeUrl = computed(() => trialUpgradeUrl(session.services))

  // Footer of the kit card: Upgrade now (a link, only with an upgrade URL) over Cancel. Both colours are the
  // `error` theme colour (legacy `red`): the white label comes from `on-error`.
  const buttons = computed<ModalButton[]>(() => [
    ...(upgradeUrl.value ? [{ id: 'upgrade', label: t('general.upgradeNow'), color: 'error', href: upgradeUrl.value }] : []),
    cancelButton(t),
  ])

  function onButton (id: string): void {
    if (id !== 'upgrade') {
      emit('update:model-value', false)
    }
  }
</script>

<style lang="scss" scoped src="@/shared/ui/modal/BasicModal.scss" />
