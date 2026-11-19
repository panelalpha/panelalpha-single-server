<template>
  <div data-testid="ns-checker">
    <v-menu
      :close-delay="150"
      :close-on-content-click="false"
      content-class="ns-checker-menu"
      location="end top"
      :max-width="308"
      :min-width="308"
      :offset="12"
      :open-delay="150"
      open-on-hover
    >
      <template #activator="{ props: activatorProps }">
        <AppButton
          v-bind="activatorProps"
          :aria-label="t('button.checkNameservers')"
          class="ml-1"
          color="error"
          data-testid="ns-checker-activator"
          kind="icon"
        >
          <v-icon
            class="ns-checker__error"
            color="error"
            icon="$alertcircle"
            size="20"
          />
        </AppButton>
      </template>

      <div
        class="pa-4"
        data-testid="ns-checker-menu"
      >
        <div class="d-flex">
          <v-icon
            class="ns-checker__error"
            color="error"
            icon="$alertcircle"
            size="20"
          />

          <p class="ns-checker__error ns-checker__desc text-error px-2 mb-2 p-xs">
            {{ t('heading.instance.dnsTooltip.desc') }}
          </p>
        </div>

        <AppButton
          class="v-btn--fix-dns ns-checker__fix ml-7 px-3"
          data-testid="ns-checker-fix"
          kind="danger"
          size="small"
          @click="toggleDialog"
        >
          <v-icon
            class="ns-checker__white mr-1"
            color="white"
            icon="$wrenchRight"
            size="20"
          />

          <span>{{ t('heading.instance.dnsTooltip.button') }}</span>
        </AppButton>
      </div>
    </v-menu>

    <v-dialog
      v-model="dialogOpen"
      transition="custom-dialog-transition"
    >
      <div
        class="card-overlay"
        @click="toggleDialog"
      />

      <v-card
        class="card-width-560"
        data-testid="ns-checker-dialog"
      >
        <v-card-title class="ns-checker__title pb-6 d-flex justify-space-between align-center">
          <h4 class="ns-checker__heading">
            {{ t('heading.instance.modal.setDomain.title') }}
          </h4>

          <modal-close-button
            data-testid="ns-checker-close"
            :push-right="false"
            @click="toggleDialog"
          />
        </v-card-title>

        <v-card-text class="ns-checker__text pb-8">
          <dns-options
            :cdn-dns-records="cdnDnsRecords"
            :dns-server-records="isMobile ? undefined : dnsServerRecords"
            :dns-settings="dnsSettings"
            :documentation-link="documentationLink"
            :domain="domain"
            :has-dns-server="hasDnsServer"
            :host-c-names="isMobile ? hostCNames : undefined"
            :ipv4-addresses="ipv4Addresses"
            :nameservers="nameservers"
            :onboarding-subdomain="onboardingSubdomain"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
  // The red icon of
  // a domain that does not resolve to the hosting, its hover menu and the "Set Your Domain" dialog. Legacy passes the zone records
  // only on desktop and the host CNAMEs only on mobile (two template copies of the table); the quirk is kept.
  import type { DnsRecordInput } from './dns-options'
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import DnsOptions from './DnsOptions.vue'

  withDefaults(defineProps<{
    domain: string
    onboardingSubdomain?: string | null
    dnsSettings?: { display_options?: unknown } | null
    hasDnsServer?: boolean
    ipv4Addresses?: string[]
    nameservers?: string[]
    hostCNames?: string[]
    dnsServerRecords?: DnsRecordInput[]
    cdnDnsRecords?: DnsRecordInput[]
    isMobile?: boolean
    documentationLink?: string
  }>(), {
    onboardingSubdomain: null,
    dnsSettings: null,
    hasDnsServer: false,
    ipv4Addresses: () => [],
    nameservers: () => [],
    hostCNames: () => [],
    dnsServerRecords: () => [],
    cdnDnsRecords: () => [],
    isMobile: false,
    documentationLink: '',
  })

  const { t } = useTranslation()

  const dialogOpen = ref(false)

  useBodyScrollLock(dialogOpen)
  useMobileScrollLock(dialogOpen)

  function toggleDialog (): void {
    dialogOpen.value = !dialogOpen.value
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `small` button: the raised (elevation 2) shadow of a V2 `v-btn`.
.ns-checker__fix {
  letter-spacing: normal;
  box-shadow: v.$box-shadow-v2-btn;
}

.ns-checker__text {
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

// V2 `.v-card__title` is a wrapping flex row: on a phone the close button drops under the heading instead of squeezing it (heading 180px on one
// line in legacy, 167px on two lines in next); V4's title does not wrap.
.ns-checker__title {
  flex-wrap: wrap;
}

// `h4.font-weight-light` in V2 is `300`.
.ns-checker__heading {
  font-weight: 300;
}
</style>

<style lang="scss">
// The menu is teleported outside `.v-application`, which gave the V2 menu its text colour.
.v-theme--light.v-menu > .v-overlay__content.ns-checker-menu {
  color: var(--v-text-base);
}
</style>
