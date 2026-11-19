<template>
  <AppDialog
    :model-value="isOpen"
    overlay
    transition="custom-dialog-transition"
    @close="onOverlayClick"
  >
    <OnboardingCard
      v-if="isOpen"
      :close-disabled="submitting"
      data-testid="transfer-modal"
      @close="closeModal"
    >
      <v-card-title class="pb-0 d-flex justify-space-between align-center">
        <h4>
          {{ t('heading.onboarding.transferDomain.title') }}
        </h4>
      </v-card-title>

      <TransferDomainSteps
        :domain="domain.domain"
        :error-message="localErrorMessage"
        :record="record"
        :transfer-enabled="transferEnabled"
      />

      <v-card-actions class="d-flex flex-column pb-6 px-10 pt-2 mt-4">
        <template v-if="transferEnabled">
          <AppButton
            block
            data-testid="transfer-now"
            :disabled="submitting"
            kind="primary"
            :loading="submitting"
            size="x-large"
            @click="handleTransferDomain"
          >
            {{ t('button.transferNow') }}
          </AppButton>

          <AppButton
            block
            class="mx-0 mt-2"
            :disabled="submitting"
            kind="cancel"
            size="x-large"
            @click="closeModal"
          >
            <span class="p-1 font-weight-light text-gray-darken-1">
              {{ t('button.back') }}
            </span>
          </AppButton>
        </template>

        <template v-else>
          <AppButton
            block
            :disabled="submitting"
            kind="primary"
            size="x-large"
            @click="closeModal"
          >
            {{ t('button.back') }}
          </AppButton>
        </template>
      </v-card-actions>
    </OnboardingCard>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { HostingService } from '@/views/hosting/hosting.types'
  import type { TransferDnsRecord } from './transfer-domain'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
  import { verifyDomain } from '@/views/hosting/hosting.api'
  import TransferDomainSteps from '@/entities/domain/ui/TransferDomainSteps.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'
  import { effectiveTransferRecord, transferOutcome } from './transfer-domain'

  const props = defineProps<{
    isOpen: boolean
    service: HostingService
    domain: { domain?: string | null }
    dnsRecord?: TransferDnsRecord | null
  }>()

  const emit = defineEmits<{
    'remove-modal': []
    'transfer-domain': []
    'dns-record-updated': [record: TransferDnsRecord | undefined]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const submitting = ref(false)
  const localErrorMessage = ref('')
  const localDnsRecord = ref<TransferDnsRecord | null>(null)

  const transferEnabled = computed(() => Boolean(props.service.plan_settings?.domain_transfer_enabled))
  const record = computed(() => effectiveTransferRecord(localDnsRecord.value, props.dnsRecord))

  useBodyScrollLock(toRef(props, 'isOpen'), { flush: 'post' })

  function closeModal (): void {
    if (!submitting.value) {
      emit('remove-modal')
    }
  }

  function onOverlayClick (): void {
    if (!submitting.value && props.isOpen) {
      emit('remove-modal')
    }
  }

  // A reload with a transfer in progress would drop the verification; legacy warns through `beforeunload`.
  function handleBeforeUnload (event: BeforeUnloadEvent): string | undefined {
    if (!submitting.value) {
      return undefined
    }
    const message = 'Transfer is in progress. Leaving the page may cause the process to fail.'
    event.returnValue = message
    return message
  }

  onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

  async function handleTransferDomain (): Promise<void> {
    if (submitting.value) {
      return
    }
    submitting.value = true
    localErrorMessage.value = ''
    try {
      const outcome = transferOutcome(await verifyDomain(props.service.id, props.domain.domain ?? ''))
      if (outcome.kind === 'record-required') {
        localDnsRecord.value = outcome.record ?? null
        emit('dns-record-updated', outcome.record)
        localErrorMessage.value = t('heading.onboarding.transferDomain.message.verificationRequired')
        return
      }
      emit('transfer-domain')
    } catch (error) {
      localErrorMessage.value = getErrorMessage(error)
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  watch(() => props.isOpen, value => {
    if (value) {
      localErrorMessage.value = ''
      localDnsRecord.value = props.dnsRecord ?? null
    } else {
      submitting.value = false
    }
  })
</script>

<style scoped lang="scss">
// V2 `.v-card > *:last-child` inherits the card radius (V4's actions row is square).
.v-card-actions.px-10.pb-6.pt-2.mt-4 {
  gap: 0;
  border-bottom-right-radius: inherit;
  border-bottom-left-radius: inherit;
}
</style>
