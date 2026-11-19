<template>
  <v-col
    class="pb-2"
    cols="12"
  >
    <SettingCard
      :description="t(subtitleKey)"
      :title="t(titleKey)"
    >
      <template #alert>
        <AlertSm
          class="alert-sm--primary"
          :text="t('heading.instance.advanced.developer.phpmyadmin.alert')"
        />
      </template>

      <template #action>
        <AppButton
          block
          :href="'#'"
          kind="setting-action"
          :loading="loading"
          :target="'_blank'"
          @click.prevent="emit('login')"
        >
          <!-- Vue 2 kept a space either side of the label and `.v-btn__content` is `white-space: break-spaces`. -->
          {{ ' ' + t(buttonKey) + ' ' }}
        </AppButton>
      </template>
    </SettingCard>
  </v-col>
</template>

<script lang="ts" setup>
  // One component for the Control Panel and the phpMyAdmin cards. The alert is the phpMyAdmin one in both cards, as in legacy.
  // The view owns the login: a click only emits `login`.
  import { useTranslation } from 'i18next-vue'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'

  defineProps<{
    titleKey: string
    subtitleKey: string
    buttonKey: string
    loading: boolean
  }>()

  const emit = defineEmits<{
    login: []
  }>()

  const { t } = useTranslation()
</script>
