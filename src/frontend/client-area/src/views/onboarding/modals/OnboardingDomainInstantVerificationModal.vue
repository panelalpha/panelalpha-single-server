<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-domain-dns-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      @close="emit('remove-modal')"
    >
      <v-card-title class="pb-0 d-flex justify-space-between align-center">
        <h4 class="font-weight-light">
          {{ t('heading.onboarding.domainDnsVerificationModal.title') }}
        </h4>
      </v-card-title>

      <v-card-text class="px-10 pt-6">
        <AlertBox
          class="mb-6"
          :variant="isVerificationSuccessful ? 'ok' : 'alert'"
        >
          <span class="font-weight-600 mb-0">
            <span v-if="isVerificationSuccessful">
              <i18next :translation="t('heading.onboarding.domainDnsVerificationModal.message.success')">
                <template #domain>
                  <span class="font-weight-600">{{ domain }}</span>
                </template>
              </i18next>
            </span>

            <span v-else-if="!isRetried">
              <i18next :translation="t('heading.onboarding.domainDnsVerificationModal.message.incorrect')">
                <template #domain>
                  <span class="font-weight-600">{{ domain }}</span>
                </template>
              </i18next>
            </span>

            <span v-else>{{ t('heading.onboarding.domainDnsVerificationModal.message.tryAgain') }}</span>
          </span>
        </AlertBox>

        <DnsOptions
          :dns-settings="dns.settings"
          :domain="domain ?? ''"
          :has-dns-server="dns.hasDnsServer"
          hide-title
          :host-c-names="dns.hostCNames"
          :ipv4-addresses="dns.ipv4Addresses"
          :nameservers="dns.nameservers"
          :onboarding-subdomain="null"
        />
      </v-card-text>

      <v-card-actions class="d-flex flex-column pb-6 px-10 pt-2 mt-4">
        <AppButton
          v-if="!isVerificationSuccessful"
          block
          kind="primary"
          :loading="submitting || loading"
          size="x-large"
          @click="checkDnsPropagation"
        >
          {{ t('button.verifyDomain') }}
        </AppButton>

        <AppButton
          v-else
          block
          kind="primary"
          size="x-large"
          @click="emit('domain-verified')"
        >
          <span>{{ successLabel }}</span>

          <v-icon
            class="ml-2"
            icon="$arrowright"
            size="24"
          />
        </AppButton>

        <AppButton
          v-if="!isVerificationSuccessful"
          block
          class="mx-0 mt-2"
          kind="cancel"
          size="x-large"
          @click="emit('domain-verified')"
        >
          <span class="p-1 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.skip') + ' ' }}
          </span>
        </AppButton>
      </v-card-actions>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The check waits 2000 ms "for UX" before the DNS
  // lookup. The flags stay after a close, as in legacy (the component lives with the wrapper).
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { hasDnsServerOf, hostCNamesOf, instantVerificationInput, ipv4AddressesOf, nameserversOf } from '@/views/onboarding/domain-dns'
  import { asksForSiteName, type InstallationTypeKey, type OnboardingService } from '@/views/onboarding/onboarding-service'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import DnsOptions from '@/entities/domain/ui/DnsOptions.vue'
  import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
  import AlertBox from '@/shared/ui/alert-box/AlertBox.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    /** The flow's `submitting`: the create request that runs before this step. */
    loading?: boolean
    service: OnboardingService | null
    domain: string | null
    /** The created domain, whose zone records the check reads. */
    newDomain: Record<string, unknown> | null
    installationType?: InstallationTypeKey
  }>(), {
    loading: false,
    installationType: 'wordpress',
  })

  const emit = defineEmits<{
    'remove-modal': []
    'domain-verified': []
  }>()

  /** Delay of the check, there for UX. */
  const DNS_CHECK_UX_DELAY_MS = 2000

  const { t } = useTranslation()

  const submitting = ref(false)
  const isRetried = ref(false)
  const isVerificationSuccessful = ref(false)

  /** The DNS data the options box shows. */
  const dns = computed(() => {
    const service = props.service
    return {
      settings: service?.onboarding?.dns_settings ?? null,
      hasDnsServer: service ? hasDnsServerOf(service) : false,
      hostCNames: service ? hostCNamesOf(service) : [],
      ipv4Addresses: service ? ipv4AddressesOf(service) : [],
      nameservers: service ? nameserversOf(service) : [],
    }
  })

  /** Primary button label after a successful check: the next step's copy. */
  const successLabel = computed(() => {
    if (props.installationType !== 'wordpress') {
      return t('button.continue')
    }
    return asksForSiteName(props.service ?? undefined) ? t('button.website.set') : t('button.website.create')
  })

  async function checkDnsPropagation (): Promise<void> {
    const service = props.service
    if (!service) {
      return
    }
    submitting.value = true
    try {
      // The check looks busy for two seconds, for UX.
      await new Promise(resolve => setTimeout(resolve, DNS_CHECK_UX_DELAY_MS))

      const result = await verifyDomainResolving(instantVerificationInput(service, props.domain ?? '', props.newDomain))
      submitting.value = false

      if (result) {
        isVerificationSuccessful.value = true
      } else {
        isRetried.value = true
      }
    } finally {
      submitting.value = false
    }
  }
</script>
