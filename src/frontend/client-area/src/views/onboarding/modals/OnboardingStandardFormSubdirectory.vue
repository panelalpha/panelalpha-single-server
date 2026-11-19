<template>
  <AppButton
    v-if="!open"
    class="input-group__action ml-4"
    size="large"
    variant="text"
    @click="open = true"
  >
    <span class="font-weight-light">{{ t('button.subdirectory.set') }}</span>
  </AppButton>

  <div
    v-else
    class="input-group__subdirectory ml-4"
  >
    <span class="input-group__slash text--heading">/</span>

    <v-text-field
      v-model="dir"
      class="v-input--md onboarding-folder-field"
      density="compact"
      hide-details
      placeholder="folder"
      variant="outlined"
    >
      <template #append-inner>
        <AppButton
          :aria-label="t('button.close')"
          icon
          size="x-small"
          variant="text"
          @click="close"
        >
          <v-icon
            icon="$close"
            size="16"
          />
        </AppButton>
      </template>
    </v-text-field>
  </div>
</template>

<script lang="ts" setup>
  // A button opens the "/folder" field, its close icon clears the folder again.
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const { t } = useTranslation()
  const open = defineModel<boolean>('open', { required: true })
  const dir = defineModel<string>('dir', { required: true })

  function close (): void {
    open.value = false
    dir.value = ''
  }
</script>

<style lang="scss" scoped>
.onboarding-folder-field {
  max-width: 112px;
}

  .input-group__action {
    flex-shrink: 0;
    align-self: center;
  }

  .input-group__subdirectory {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .input-group__slash {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    height: 48px;
    margin-right: 8px;
    line-height: 1;
  }
</style>
