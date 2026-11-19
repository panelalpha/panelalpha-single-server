<template>
  <div
    @drag.prevent
    @dragleave.prevent
    @dragover.prevent
    @drop.prevent
  >
    <v-form class="style-logo-form">
      <LogoBox
        :file-data="lightLogo"
        :text="t('form.label.image.lightMode')"
        type="light"
        @update:file-data="emit('update:light-logo-data', $event)"
      />

      <LogoBox
        :file-data="darkLogo"
        :text="t('form.label.image.darkMode')"
        type="dark"
        @update:file-data="emit('update:dark-logo-data', $event)"
      />
    </v-form>

    <p class="p-5 mb-0 font-weight-regular mt-1 gray-darken-text">
      {{ t('form.label.image.subtitle') }}
    </p>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import LogoBox from './StyleManagerLogoBox.vue'

  defineProps<{
    lightLogo?: string | false | null
    darkLogo?: string | false | null
  }>()

  const emit = defineEmits<{
    'update:light-logo-data': [data: string | null]
    'update:dark-logo-data': [data: string | null]
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
.style-logo-form {
  display: flex;
  gap: 16px;
  flex-wrap: nowrap;
}
</style>
