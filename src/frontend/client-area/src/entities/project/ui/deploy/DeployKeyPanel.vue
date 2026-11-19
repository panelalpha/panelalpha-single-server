<template>
  <div class="deploy-key-panel">
    <long-value-box
      :can-expand="true"
      :value="publicKey"
    />

    <p
      v-if="fingerprint"
      class="deploy-key-panel__fingerprint text--gray-darken1 caption mt-2 mb-0"
    >
      {{ t('heading.onboarding.gitDeploy.auth.deployKey.fingerprintLabel') }}:
      <span class="text-break">{{ fingerprint }}</span>
    </p>

    <p class="text--gray-darken1 mt-3 mb-2">
      {{ t('heading.onboarding.gitDeploy.auth.deployKey.instruction') }}
    </p>

    <div
      v-if="error"
      class="text-error mb-2"
      role="alert"
    >
      {{ error }}
    </div>

    <div
      v-if="!hideConnect || showRegenerate"
      class="deploy-key-panel__actions d-flex align-center flex-wrap mt-2"
    >
      <AppButton
        v-if="!hideConnect"
        :disabled="loading"
        kind="primary"
        :loading="loading"
        @click="emit('connect')"
      >
        <span class="font-weight-bold">{{ buttonLabel }}</span>
      </AppButton>

      <AppButton
        v-if="showRegenerate"
        class="btn-default-color"
        :disabled="loading"
        kind="text"
        @click="emit('regenerate')"
      >
        {{ ` ${t('button.onboarding.gitDeploy.regenerateDeployKey')} ` }}
      </AppButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The regenerate button keeps `btn-default-color` and spaces around its label on purpose: Vuetify 2 counted the space before and after the
  // text (8 px of width) and Vuetify 4 dims the text color inside a card; both are measured against the legacy page.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LongValueBox from '@/shared/ui/labels/LongValueBox.vue'

  const props = withDefaults(defineProps<{
    publicKey?: string
    fingerprint?: string
    hideConnect?: boolean
    loading?: boolean
    error?: string | null
    connectLabel?: string | null
    showRegenerate?: boolean
  }>(), {
    publicKey: '',
    fingerprint: '',
    hideConnect: false,
    loading: false,
    error: null,
    connectLabel: null,
    showRegenerate: false,
  })

  const emit = defineEmits<{
    connect: []
    regenerate: []
  }>()

  const { t } = useTranslation()

  const buttonLabel = computed(() => {
    if (props.loading) {
      return t('button.onboarding.gitDeploy.connectingDeployKey')
    }
    return props.connectLabel || t('button.onboarding.gitDeploy.connectDeployKey')
  })
</script>

<style lang="scss" scoped>
// The `gap: 12px` inline style of legacy moved to the class (the kit owns its layout).
.deploy-key-panel__actions {
  gap: 12px;
}
</style>
