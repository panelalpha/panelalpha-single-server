<template>
  <OnboardingDialog
    data-testid="onboarding-limit-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      @close="emit('remove-modal')"
    >
      <div class="pa-6 d-flex align-center justify-center">
        <OnboardingNoActivePlans />
      </div>

      <v-divider />

      <v-card-text class="px-10 pt-8">
        <h4 class="text-center pb-6">
          {{ t('heading.onboarding.limit.title') }}
        </h4>

        <p class="p-1 text-center">
          <i18next :translation="t('heading.onboarding.limit.info.general')">
            <template #limit>
              <b>{{ selectedService?.instance_limit }}</b>
            </template>
          </i18next>

          <template v-if="upgradeLink">
            <i18next :translation="t('heading.onboarding.limit.info.order.plan')">
              <template #link>
                <a
                  class="text-info"
                  :href="upgradeLink"
                  target="_blank"
                >{{ t('general.here') }}</a>
              </template>
            </i18next>
          </template>

          <template v-else-if="orderLink">
            {{ t('heading.onboarding.limit.info.order.service') }}
          </template>
        </p>
      </v-card-text>

      <v-card-actions class="d-flex flex-column pb-4 px-10 pt-2">
        <AppButton
          v-if="upgradeLink"
          block
          :href="upgradeLink"
          kind="primary"
          size="x-large"
          target="_blank"
        >
          {{ t('button.service.upgrade') }}
        </AppButton>

        <AppButton
          v-else-if="orderLink"
          block
          :href="orderLink"
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
            {{ upgradeLink || orderLink ? t('button.maybeLater') : t('button.dashboard.back') }}
          </span>
        </AppButton>
      </v-card-actions>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { OnboardingService } from '@/views/onboarding/onboarding-service'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import OnboardingNoActivePlans from '@/views/onboarding/illustrations/OnboardingNoActivePlans.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = defineProps<{
    modelValue: boolean
    selectedService: OnboardingService | null
  }>()
  const emit = defineEmits<{
    'go-back': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const orderLink = computed(() => session.user?.order_service_link as string | undefined)
  // Only with a service id and a plan link.
  const upgradeLink = computed(() => {
    const service = props.selectedService
    return service?.id && service.plan_upgrade_link ? `${service.plan_upgrade_link}?paupgradeserviceid=${service.id}` : ''
  })
</script>
