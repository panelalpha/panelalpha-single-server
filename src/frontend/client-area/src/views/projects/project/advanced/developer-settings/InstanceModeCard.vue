<template>
  <v-col
    class="pb-2"
    cols="12"
  >
    <SettingCard
      :description="t(subtitleKey)"
      :loading="loading"
      :title="t(titleKey)"
    >
      <template #action>
        <ButtonSwitch
          class="mt-0"
          :disabled="status === null"
          :loading="saving"
          :model-value="status ?? false"
          @click="emit('toggle')"
        />
      </template>
    </SettingCard>
  </v-col>
</template>

<script lang="ts" setup>
  // One component for the debug and maintenance cards. The
  // view owns the state and the save: a click only emits `toggle`, and the view ignores it while the mode is saving.
  import { useTranslation } from 'i18next-vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'

  defineProps<{
    loading: boolean
    status: boolean | null
    saving: boolean
    titleKey: string
    subtitleKey: string
  }>()

  const emit = defineEmits<{
    toggle: []
  }>()

  const { t } = useTranslation()
</script>
