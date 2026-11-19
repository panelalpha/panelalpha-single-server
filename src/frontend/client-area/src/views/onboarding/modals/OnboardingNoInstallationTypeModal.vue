<template>
  <OnboardingDialog
    data-testid="onboarding-no-type-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      @close="emit('remove-modal')"
    >
      <OnboardingNoActivePlans class="mx-auto mt-8" />

      <v-card-text class="px-10 pt-8">
        <h4 class="text-center pb-6">
          {{ t('heading.onboarding.noInstallationType.title') }}
        </h4>

        <p class="p-1 text-center">
          {{ t('heading.onboarding.noInstallationType.info') }}
        </p>
      </v-card-text>

      <v-card-actions class="d-flex flex-column pb-4 px-10 pt-2">
        <AppButton
          block
          class="mx-0"
          kind="cancel"
          size="x-large"
          @click="emit('go-back')"
        >
          <span class="p-1 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.dashboard.back') + ' ' }}
          </span>
        </AppButton>
      </v-card-actions>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import OnboardingNoActivePlans from '@/views/onboarding/illustrations/OnboardingNoActivePlans.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    'go-back': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()
</script>
