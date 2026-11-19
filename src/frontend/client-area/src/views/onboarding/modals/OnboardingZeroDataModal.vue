<template>
  <OnboardingDialog
    data-testid="onboarding-zero-data-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      @close="emit('remove-modal')"
    >
      <OnboardingLimitReached class="mx-auto mt-8" />

      <v-card-text class="px-10 pt-8">
        <h4 class="text-center pb-6">
          {{ t('heading.onboarding.noPlan.title') }}
        </h4>

        <p class="p-1 text-center">
          {{ t('heading.onboarding.noPlan.info') }}
        </p>
      </v-card-text>

      <v-card-actions class="d-flex flex-column pb-4 px-10 pt-2">
        <AppButton
          v-if="orderNewServiceLink"
          block
          :href="orderNewServiceLink"
          kind="primary"
          size="x-large"
          target="_blank"
        >
          {{ t('button.plan.order') }}
        </AppButton>

        <AppButton
          block
          class="mx-0 mt-2"
          kind="cancel"
          size="x-large"
          @click="emit('go-back')"
        >
          <span class="p-1 font-weight-light text--gray-darken1">
            {{ orderNewServiceLink ? t('button.maybeLater') : t('button.dashboard.back') }}
          </span>
        </AppButton>
      </v-card-actions>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import OnboardingLimitReached from '@/views/onboarding/illustrations/OnboardingLimitReached.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    'go-back': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  // The field is not typed on `HomeUser`.
  const orderNewServiceLink = computed(() => session.user?.order_service_link as string | undefined)
</script>
