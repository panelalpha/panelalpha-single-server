<template>
  <v-card
    class="mb-8"
    data-testid="summary-ns-card"
    elevation="4"
  >
    <v-card-title class="pb-6 d-flex flex-row justify-space-between">
      <h6
        class="font-weight-bold"
        data-testid="summary-ns-title"
      >
        <i18next :translation="t('heading.hosting.summary.nameserverCard.mainDomain.headline')">
          <template #domain>
            <span class="font-weight-light ml-1">
              {{ domainName }}
            </span>
          </template>
        </i18next>
        <!-- Vue 2 kept the space between the title and the spinner (5px at 20px bold). -->
        {{ ' ' }}
        <v-progress-circular
          v-if="resolvingNs"
          color="primary"
          data-testid="summary-ns-spinner"
          indeterminate
          :size="20"
        />
      </h6>
    </v-card-title>

    <v-card-text v-if="!service" />

    <v-card-text
      v-else-if="!verificationPassed"
      data-testid="summary-ns-error"
    >
      <div class="d-flex ">
        <v-icon
          color="error"
          icon="$alertcircle"
          size="20"
        />

        <p class="text-error px-2">
          {{ t('heading.hosting.summary.nameserverCard.dnsRecords.text') }}:
        </p>
      </div>

      <DnsOptions
        v-if="dnsOptions"
        v-bind="dnsOptions"
        hide-title
      />
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  // This is the app variant with the CDN branch; app-lite has none.
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { DomainInstance } from './nameserver-records'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import DnsOptions from '@/entities/domain/ui/DnsOptions.vue'
  import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
  import { dnsServerRecords, nameserverDnsOptions, onboardingSubdomain, verificationIpv4Addresses } from './nameserver-records'

  const props = defineProps<{
    service: HostingService | null
    /** The account selected in the Summary; its records are the ones `DnsOptions` shows on a failed check. */
    account: HostingServerAccount | null
    instances: DomainInstance[]
    instancesLoading: boolean
  }>()

  const { t } = useTranslation()

  const resolvingNs = ref(true)
  const verificationPassed = ref(true)

  /** The domain part of `"<plan> - <domain>"`. */
  const domainName = computed(() => props.service?.name?.split(' - ', 2)[1] ?? '')

  const dnsOptions = computed(() => (props.service && props.account
    ? nameserverDnsOptions(props.instances, props.service, props.account)
    : null))

  // Starts once the instances are loaded (the CDN and DNS server records come from the instance on the main domain).
  watch(() => props.instancesLoading, loading => {
    if (loading === false) {
      void resolveDns()
    }
  })

  async function resolveDns (): Promise<void> {
    const service = props.service
    const account = service?.server_accounts[0]
    if (!service || !account) {
      return
    }
    resolvingNs.value = true
    try {
      // Quirk kept: it always verifies the first account, whichever one the selector shows.
      verificationPassed.value = await verifyDomainResolving({
        domain: account.domain,
        onboardingSubdomain: onboardingSubdomain(props.instances, service),
        dnsSettings: service.dns_settings ?? {},
        hasDnsServer: service.dns_server_enabled,
        ipv4Addresses: verificationIpv4Addresses(props.instances, service),
        nameservers: account.nameservers,
        hostCNames: account.host_c_names,
        recordsFromDnsServer: dnsServerRecords(props.instances, service),
      })
      resolvingNs.value = false
    } catch {
      // legacy leaves the rejection unhandled and the spinner running
    }
  }
</script>

<style lang="scss" scoped>
.v-card-title.pb-6 {
  // V2 `.v-card__title` wraps its children (the chip drops below the title on a narrow screen); V4's is a nowrap row.
  flex-wrap: wrap;
}

// The error state is the last block of the card: V2 `.v-card > :last-child` gave it the 24px bottom padding and the card's
// bottom radius; V4 ends the card with `.v-card__overlay`, so the rules are restated here.
.v-card > .v-card-text[data-testid='summary-ns-error']:last-of-type {
  padding-bottom: 24px;
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
}
</style>
