<template>
  <v-col
    class="pt-4 pb-2"
    cols="12"
  >
    <SettingCard
      :description="t('heading.instance.advanced.security.forceRedirect.subtitle')"
      :loading="loading"
      :title="t('heading.instance.advanced.security.forceRedirect.title')"
    >
      <template #action>
        <div :class="settings.can_https_redirect ? '' : 'cursor-not-allowed'">
          <ButtonSwitch
            class="mt-0"
            :class="settings.can_https_redirect ? '' : 'switch-container--disabled'"
            :disabled="!settings.can_https_redirect"
            :loading="saving"
            :model-value="settings.force_https_redirect"
            @click="emit('toggle')"
          />
        </div>
      </template>
    </SettingCard>
  </v-col>
</template>

<script lang="ts" setup>
  // The switch saves through the view: `toggle` goes up,
  // and the view checks `can_https_redirect` and decides whether the shared-domain modal comes first.
  import type { SslSettings } from './security.api'
  import { useTranslation } from 'i18next-vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'

  defineProps<{
    loading: boolean
    saving: boolean
    settings: SslSettings
  }>()

  const emit = defineEmits<{
    toggle: []
  }>()

  const { t } = useTranslation()
</script>
