<template>
  <div class="floating-button">
    <AppButton
      class="p-2 font-weight-bold"
      data-testid="shell-fab"
      elevation="4"
      kind="primary"
      rounded
      @click="startInstallationProcess"
    >
      <v-icon
        class="text-white"
        size="24"
      >
        $plus
      </v-icon>
      {{ t('button.instance.add') + ' ' }}
    </AppButton>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { emit } from '@/shared/events/app-events'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const { t } = useTranslation()

  // No services reload, unlike Add new.
  function startInstallationProcess () {
    emit('start-installation-process')
  }
</script>

<style lang="scss" scoped>
.floating-button {
  position: fixed;
  bottom: 16px;
  right: 24px;
  z-index: 99;

  // V2 `.v-btn.v-size--default { font-size: 14px }` (0,2,0) beat `.p-2` (16px); in V4 the size rule is layered and loses to `.p-2`.
  .v-btn {
    font-size: 14px;
    line-height: 24px;
  }
}
</style>
