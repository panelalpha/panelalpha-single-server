<template>
  <v-col
    class="pt-4 pb-2"
    cols="12"
  >
    <SettingCard
      :description="t('heading.instance.advanced.security.disableSearchEngineIndexing.subtitle')"
      :loading="loading"
      :title="t('heading.instance.advanced.security.disableSearchEngineIndexing.title')"
    >
      <template #action>
        <ButtonSwitch
          class="mt-0"
          :loading="submitting"
          :model-value="status === true"
          @click="emit('toggle')"
        />
      </template>
    </SettingCard>
  </v-col>
</template>

<script lang="ts" setup>
  // The view owns the request: `toggle`
  // goes up, and the view ignores it while a save is in flight and flips the status only after the server accepts the change.
  import { useTranslation } from 'i18next-vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'

  defineProps<{
    loading: boolean
    status: boolean | null
    submitting: boolean
  }>()

  const emit = defineEmits<{
    toggle: []
  }>()

  const { t } = useTranslation()
</script>
