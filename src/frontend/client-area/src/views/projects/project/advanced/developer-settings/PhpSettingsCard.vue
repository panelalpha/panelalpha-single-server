<template>
  <div>
    <SettingCard
      :description="t('heading.instance.advanced.developer.phpSettings.subtitle')"
      :loading="loading"
      :title="t('heading.instance.advanced.developer.phpSettings.title')"
    >
      <template #alert>
        <AlertSm
          v-if="configurable"
          class="alert-sm--primary"
          :text="t('heading.instance.advanced.developer.phpVersion.alert')"
        />

        <AlertSm
          v-else
          class="alert-sm--primary"
          :text="t('heading.instance.advanced.developer.phpSettings.alert')"
        />
      </template>

      <template #action>
        <AppButton
          :disabled="!configurable"
          kind="setting-action"
          @click="phpSettingsModalOpen = true"
        >
          <span class="font-weight-bold">{{ t('button.manage') }}</span>
        </AppButton>
      </template>
    </SettingCard>

    <PhpSettingsModal
      v-model:open="phpSettingsModalOpen"
      :custom="custom"
      :instance="instance"
      :modifiable-directives-list="modifiableDirectivesList"
      :php-settings="phpSettings"
      :suggested-directives="suggestedDirectives"
      @saved="onSaved"
    />
  </div>
</template>

<script lang="ts" setup>
  // The `.v-card--mobile` rule is dead in legacy (no such class in the template) and is not ported. The view wraps this
  // card in `v-col cols=12 pb-2`. The card owns `phpSettingsModalOpen`, so the scroll locks are wired here. The modal gets the rows
  // and replaces them on `saved`.
  import type { PhpSettingRow, PhpSettingsResponse, SuggestedDirective } from './developer-settings.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { onMounted, ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import { getPhpSettings } from './developer-settings.api'
  import { enrichDirective } from './php-settings'
  import PhpSettingsModal from './PhpSettingsModal.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const loading = ref(true)
  const configurable = ref(false)
  const custom = ref(false)
  const suggestedDirectives = ref<SuggestedDirective[]>([])
  const modifiableDirectivesList = ref(true)
  const phpSettings = ref<PhpSettingRow[]>([])

  const phpSettingsModalOpen = ref(false)

  useMobileScrollLock(phpSettingsModalOpen)

  /** A plain GET behind the card's own skeleton. A failure alerts and keeps the defaults. */
  async function loadPhpSettings (): Promise<void> {
    loading.value = true
    try {
      const response: PhpSettingsResponse = await getPhpSettings(props.instance.hostingId as number, props.instance.domain ?? '')
      const suggested = response.suggested_directives || []
      suggestedDirectives.value = suggested
      modifiableDirectivesList.value = response.modifiable_directives_list !== false
      phpSettings.value = response.directives.map(row => enrichDirective(row, suggested))
      custom.value = response.custom_directives
      configurable.value = response.configurable
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loading.value = false
    }
  }

  /** The modal saved its working copy; the card takes those rows as its state. */
  function onSaved (rows: PhpSettingRow[]): void {
    phpSettings.value = rows
  }

  onMounted(() => {
    void loadPhpSettings()
  })
</script>
