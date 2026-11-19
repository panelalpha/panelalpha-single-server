<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-domain-transfer-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      :close-disabled="loading"
      @close="closeModal"
    >
      <v-card-title class="pb-0 d-flex justify-space-between align-center">
        <h4>
          {{ t('heading.onboarding.transferDomain.title') }}
        </h4>
      </v-card-title>

      <TransferDomainSteps
        :domain="domain"
        :error-message="localErrorMessage"
        :record="record"
        :transfer-enabled="transferEnabled"
      />

      <v-card-actions class="d-flex flex-column pb-6 px-10 pt-2 mt-4">
        <AppButton
          v-if="transferEnabled"
          block
          data-testid="transfer-now"
          :disabled="loading || submitting"
          kind="primary"
          :loading="loading || submitting"
          size="x-large"
          @click="onTransferClick"
        >
          <template #loader>
            <v-progress-circular
              class="mr-2"
              indeterminate
              size="20"
              width="2"
            />

            <span>{{ loadingText ? t(loadingText) : t('button.onboarding.check-domain-availability') }}</span>
          </template>

          <span v-if="hasEagerDnsVerification(service ?? undefined)">{{ t('button.continue') }}</span>
          <span v-else-if="asksForSiteName(service ?? undefined)">{{ t('button.website.set') }}</span>
          <span v-else>{{ t('button.transferNow') }}</span>

          <v-icon
            class="ml-2"
            icon="$arrowright"
            size="24"
          />
        </AppButton>

        <AppButton
          v-if="services.length > 1"
          block
          class="mx-0 mt-2"
          :disabled="loading"
          kind="cancel"
          size="x-large"
          @click="onChangeServiceClick"
        >
          <span class="p-1 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.service.change') + ' ' }}
          </span>
        </AppButton>

        <AppButton
          v-else
          block
          class="mx-0 mt-2"
          :disabled="loading"
          kind="cancel"
          size="x-large"
          @click="closeModal"
        >
          <span class="p-1 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.back') + ' ' }}
          </span>
        </AppButton>
      </v-card-actions>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // "Transfer now" asks the verify endpoint again: a record still
  // required stays on this step, anything else goes on with the create (the flow's `transferDomain`).
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { asksForSiteName, canTransferDomain, hasEagerDnsVerification, type OnboardingService } from '@/views/onboarding/onboarding-service'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import { verifyDomain } from '@/entities/domain/domain-verification.api'
  import TransferDomainSteps from '@/entities/domain/ui/TransferDomainSteps.vue'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    /** The flow's `loading` (the create request of "Transfer now" does not set it, as in legacy). */
    loading?: boolean
    loadingText?: string | null
    service: OnboardingService | null
    services: OnboardingService[]
    domain: string | null
    /** The record from the verify answer that opened the step. */
    domainVerificationRecord?: Record<string, unknown> | null
  }>(), {
    loading: false,
    loadingText: null,
    domainVerificationRecord: null,
  })

  const emit = defineEmits<{
    'remove-modal': []
    'change-service-button-clicked': []
    'verification-record-updated': [record: Record<string, unknown> | undefined]
    'transfer-domain': []
  }>()

  const { t } = useTranslation()

  const submitting = ref(false)
  const localErrorMessage = ref('')
  /** The record of the last "Transfer now" answer, else the one the step opened with. */
  const localRecord = ref<Record<string, unknown> | null>(null)

  const transferEnabled = computed(() => props.service?.onboarding?.domain_transfer_enabled === true)

  /** The record as the step shows it: text fields only, empty when missing. */
  const record = computed(() => {
    const source = localRecord.value ?? props.domainVerificationRecord ?? {}
    return {
      name: text(source.name),
      type: text(source.type),
      content: text(source.content),
    }
  })

  function text (value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  function onChangeServiceClick (): void {
    if (!props.loading) {
      emit('change-service-button-clicked')
    }
  }

  async function onTransferClick (): Promise<void> {
    if (props.loading || submitting.value) {
      return
    }
    localErrorMessage.value = ''
    submitting.value = true
    try {
      const service = props.service
      if (service && canTransferDomain(service)) {
        const result = await verifyDomain(service.id, props.domain ?? '')
        if (result?.verification_required) {
          localRecord.value = result.verification_record ?? null
          emit('verification-record-updated', result.verification_record)
          localErrorMessage.value = t('heading.onboarding.transferDomain.message.verificationRequired')
          submitting.value = false
          return
        }
      }
      submitting.value = false
      emit('transfer-domain')
    } catch (error) {
      localErrorMessage.value = getErrorMessage(error)
      submitting.value = false
    }
  }

  watch(() => props.modelValue, open => {
    if (open) {
      localErrorMessage.value = ''
      localRecord.value = props.domainVerificationRecord ?? null
    }
  })
</script>
