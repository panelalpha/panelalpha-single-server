<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-choose-service-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      :close-disabled="loading"
      @close="emit('remove-modal')"
    >
      <v-card-title class="pb-0 d-flex justify-space-between align-center">
        <div
          v-if="isImport"
          class="d-flex flex-column"
        >
          <span class="font-weight-light p-1">
            {{ t('heading.onboarding.import.url.title') }}
          </span>

          <h4>{{ t('heading.onboarding.import.url.subtitle') }}</h4>
        </div>

        <h4
          v-else
          class="font-weight-light"
        >
          {{ t('heading.onboarding.chooseProduct.title') }}
        </h4>
      </v-card-title>

      <v-card-text class="px-10 pt-8">
        <h6>{{ t('heading.onboarding.chooseProduct.product.title') }}</h6>

        <p class="p-3 mt-2">
          {{ t('heading.onboarding.chooseProduct.product.subtitle') }}
        </p>

        <v-select
          class="v-input--xlg service-select"
          :disabled="loading"
          hide-details
          :item-title="service => serviceLabel(service, t)"
          item-value="id"
          :items="services"
          :model-value="selectedService"
          return-object
          variant="outlined"
          @keydown.enter.prevent="selectService"
          @update:model-value="service => emit('update:selected-service', service)"
        />

        <v-scale-transition>
          <AppMessage
            v-if="limitReached"
            class="my-5"
            icon="$alertcircle"
            variant="warning"
          >
            <span>{{ t('heading.onboarding.chooseProduct.product.fullServiceAlert') }}</span>
          </AppMessage>
        </v-scale-transition>
      </v-card-text>

      <v-card-actions class="d-flex flex-column pb-4 px-10 pt-2">
        <AppButton
          v-if="upgradeLink && limitReached"
          block
          :href="upgradeLink"
          kind="primary"
          size="x-large"
        >
          {{ t('button.service.upgrade') }}
        </AppButton>

        <AppButton
          v-else
          block
          :disabled="limitReached"
          kind="primary"
          :loading="loading"
          size="x-large"
          @click="selectService"
        >
          <span>{{ t(actionKey) }}</span>

          <v-icon
            class="ml-2"
            icon="$arrowright"
            size="24"
          />
        </AppButton>

        <AppButton
          block
          class="mx-0 mt-2"
          :disabled="loading"
          kind="cancel"
          size="x-large"
          @click="emit('go-back')"
        >
          <span class="p-1 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.cancel') + ' ' }}
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
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import { serviceLabel, serviceLimitReached } from '@/entities/service/service-display'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = defineProps<{
    modelValue: boolean
    loading?: boolean
    isImport?: boolean
    services: OnboardingService[]
    selectedService: OnboardingService | null
    /** The copy key of the primary button (`serviceActionLabelKey`). */
    actionKey: string
  }>()
  const emit = defineEmits<{
    'update:selected-service': [service: OnboardingService]
    'service-selected': [service: OnboardingService]
    'go-back': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()

  const limitReached = computed(() => serviceLimitReached(props.selectedService ?? undefined))
  const upgradeLink = computed(() => {
    const service = props.selectedService
    return service?.plan_upgrade_link ? `${service.plan_upgrade_link}?paupgradeserviceid=${service.id}` : ''
  })

  function selectService (): void {
    if (!props.loading && !limitReached.value && props.selectedService) {
      emit('service-selected', props.selectedService)
    }
  }
</script>

<style lang="scss" scoped>
  .onboarding-modal {
    // A plain outlined V2 select (56px) with the 24px `.v-input` bottom margin;
    // the `.v-input--lg` of the V4 port gave the 48px legacy `lg` field.
    .service-select {
      margin-bottom: 24px;
    }
  }
</style>
