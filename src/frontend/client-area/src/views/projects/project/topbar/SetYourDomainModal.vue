<template>
  <div>
    <AppButton
      v-if="dnsMismatch"
      class="mr-4 change-domain-btn dns-propagation-btn"
      color="error"
      data-testid="instance-dns-propagation"
      kind="secondary"
      :loading="loading"
      size="small"
      @click="loadModal"
    >
      <v-icon
        icon="$alertwarning"
        size="24"
      />

      <span class="text--heading p-4 font-weight-bold text-no-wrap">{{ t('message.dnsPropagationInProgress') }}</span>
    </AppButton>

    <AppButton
      v-else-if="instance.hasChangeDomainPrivilege()"
      class="mr-4 change-domain-btn"
      data-testid="instance-change-domain"
      kind="field"
      :loading="loading"
      size="small"
      @click="loadModal"
    >
      <span class="text--heading p-4 font-weight-bold text-no-wrap">{{ t('button.setDomain.changeDomain') }}</span>
    </AppButton>

    <v-dialog
      v-model="isOpen"
      transition="custom-dialog-transition"
    >
      <div
        class="card-overlay"
        @click="isOpen = false"
      />

      <!-- The global `card-width-560` beats the 720 px dialog card. -->
      <v-card
        class="card-width-560"
        data-testid="set-domain-modal"
      >
        <!-- Legacy `.v-card__title` (V2 flex) wraps: on a narrow card the close button drops under the 180 px title. V4 `d-flex` does not wrap and shrinks the title to two lines. -->
        <v-card-title class="pb-6 d-flex flex-wrap justify-space-between align-center">
          <h4
            class="font-weight-light"
            data-testid="set-domain-title"
          >{{ t('heading.instance.modal.setDomain.title') }}</h4>

          <!-- The title spaces its children with `justify-space-between`, so the close button takes no `ml-auto` (`ModalCloseButton` `pushRight`). -->
          <modal-close-button
            data-testid="set-domain-close"
            :push-right="false"
            @click="isOpen = false"
          />
        </v-card-title>

        <template v-if="step === 0">
          <v-card-text>
            <AppMessage
              v-if="onlineZone"
              class="mb-5"
              data-testid="set-domain-online-warning"
              variant="warning"
            >
              <p>{{ t('heading.instance.modal.setDomain.onlineWarning', { domain: instance.domain }) }}</p>
            </AppMessage>

            <v-form
              ref="form"
              data-testid="set-domain-form"
              @submit.prevent="submitForm"
            >
              <v-expansion-panels
                v-model="panelOpen"
                mandatory
              >
                <v-expansion-panel :value="0">
                  <v-expansion-panel-title
                    class="h6 text--heading font-weight-bold"
                    data-testid="set-domain-domain-title"
                  >
                    {{ t('heading.instance.modal.setDomain.set.domain.title') }}
                  </v-expansion-panel-title>

                  <v-expansion-panel-text>
                    {{ t('form.label.domainName') }}

                    <!-- The V2 utilities are restated in `.order-domain-link`. -->
                    <a
                      v-if="orderDomainLink"
                      class="order-domain-link text-info"
                      data-testid="set-domain-order-link"
                      :href="orderDomainLink"
                      target="_blank"
                    >
                      {{ t('button.domain.order') }}
                    </a>

                    <validated-text-field
                      v-if="!panelOpen"
                      v-model="clientDomainName"
                      class="mt-2"
                      data-testid="set-domain-domain-field"
                      hide-details="auto"
                      placeholder="mydomain.com"
                      :rules="domainRules"
                      validate-on="blur"
                      variant="outlined"
                    />
                  </v-expansion-panel-text>
                </v-expansion-panel>

                <v-expansion-panel
                  v-if="freeSubdomains.length > 0"
                  :value="1"
                >
                  <v-expansion-panel-title
                    class="h6 text--heading font-weight-bold"
                    data-testid="set-domain-subdomain-title"
                  >
                    {{ t('heading.instance.modal.setDomain.set.subdomain.title') }}
                  </v-expansion-panel-title>

                  <v-expansion-panel-text>
                    <div
                      v-if="panelOpen === 1"
                      class="d-flex align-start"
                      data-testid="set-domain-subdomain-row"
                    >
                      <validated-text-field
                        v-model="freeDomainName"
                        class="set-domain-subdomain-field"
                        data-testid="set-domain-subdomain-field"
                        hide-details="auto"
                        placeholder="mydomain"
                        :rules="subdomainRules"
                        validate-on="blur"
                        variant="outlined"
                      />

                      <span class="set-domain-subdomain-dot mx-2">.</span>

                      <v-select
                        v-model="freeDomainAffix"
                        data-testid="set-domain-affix"
                        hide-details
                        :items="freeSubdomains"
                        :menu-props="{
                          offset: 8,
                          contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding',
                        }"
                        :rules="affixRules"
                        validate-on="blur"
                        variant="outlined"
                      />
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-form>
          </v-card-text>

          <v-card-actions class="d-flex flex-column pb-4 px-8 pt-6">
            <AppButton
              block
              class="set-domain-submit"
              data-testid="set-domain-use"
              kind="primary"
              :loading="submitting"
              size="x-large"
              @click="submitForm"
            >
              {{ t('button.setDomain.useThisDomain') }}
            </AppButton>

            <AppButton
              block
              class="mt-2"
              data-testid="set-domain-cancel"
              kind="cancel"
              size="x-large"
              @click="isOpen = false"
            >
              <span class="p-1 font-weight-light text-gray-darken-1">{{ t('button.cancel') }}</span>
            </AppButton>
          </v-card-actions>
        </template>

        <template v-if="step === 1">
          <v-card-text class="pb-8">
            <div
              class="domain-container"
              data-testid="set-domain-domain-row"
            >
              <span class="p-3">
                {{ t('heading.instance.modal.setDomain.config.subtitle') }}

                <span class="text--heading font-weight-600">{{ instance.domain }}</span>
              </span>

              <AppButton
                v-if="instance.hasChangeDomainPrivilege()"
                class="set-domain-change"
                data-testid="set-domain-change"
                kind="field"
                size="x-small"
                @click="step = 0"
              >
                {{ ' ' + t('button.change') + ' ' }}
              </AppButton>
            </div>

            <div
              v-if="isSingleServer && showPreviewSiteCta"
              class="domain-container"
              data-testid="set-domain-preview-row"
            >
              <span class="p-3">{{ t('heading.instance.modal.setDomain.previewSite') }}</span>

              <AppButton
                class="set-domain-preview-button"
                data-testid="set-domain-preview-button"
                kind="primary"
                size="x-small"
                @click="openPreview"
              >
                {{ ' ' + t('heading.instance.modal.setDomain.generateUrl') + ' ' }}
              </AppButton>
            </div>

            <DnsOptions
              :cdn-dns-records="cdnDnsRecords"
              :cdn-pending="cdnDnsPending(instance)"
              :dns-server-records="dnsServerRecords"
              :dns-settings="instance.dns_settings"
              :domain="instance.domain"
              :has-dns-server="Boolean(instance.service_has_dns)"
              :host-c-names="instance.host_c_names ?? []"
              :ipv4-addresses="ipv4Addresses"
              :nameservers="instance.dns_nameservers"
              :onboarding-subdomain="instance.onboarding_subdomain"
            />
          </v-card-text>

          <v-card-actions class="d-flex flex-column pb-4 px-8 pt-0">
            <AppButton
              block
              class="set-domain-close-action"
              data-testid="set-domain-close-action"
              kind="primary"
              size="x-large"
              @click="isOpen = false"
            >
              {{ t('button.close') }}
            </AppButton>
          </v-card-actions>
        </template>
        <!-- Step 2: transfer. `domain` in the slots is `domainComputed`. -->
        <template v-if="step === 2">
          <TransferDomainSteps
            data-testid="set-domain-transfer"
            :domain="domainComputed"
            :error-message="localErrorMessage"
            :record="verificationRecord"
            :transfer-enabled="transferEnabled"
          />

          <v-card-actions class="d-flex flex-column pb-4 px-8 pt-6">
            <template v-if="transferEnabled">
              <AppButton
                block
                class="set-domain-submit"
                data-testid="set-domain-transfer-now"
                kind="primary"
                :loading="submitting"
                size="x-large"
                @click="nextStep"
              >
                {{ t('button.transferNow') }}
              </AppButton>

              <AppButton
                block
                class="mt-2"
                data-testid="set-domain-transfer-cancel"
                kind="cancel"
                size="x-large"
                @click="isOpen = false"
              >
                <span class="p-1 font-weight-light text-gray-darken-1">{{ t('button.cancel') }}</span>
              </AppButton>
            </template>

            <template v-else>
              <AppButton
                block
                class="set-domain-close-action"
                data-testid="set-domain-transfer-cancel"
                kind="primary"
                size="x-large"
                @click="isOpen = false"
              >
                {{ t('button.cancel') }}
              </AppButton>
            </template>
          </v-card-actions>
        </template>

        <!-- Step 3: DNS verification. A successful re-check shows the green alert. -->
        <template v-if="step === 3">
          <v-card-text
            class="px-10 pt-6"
            data-testid="set-domain-verify"
          >
            <AlertBox
              class="mb-6"
              data-testid="set-domain-verify-alert"
              :variant="verification.isVerificationSuccessful ? 'ok' : 'alert'"
            >
              <span class="font-weight-600 mb-0">
                <span v-if="verificationKind === 'success'">
                  <i18next :translation="t('heading.onboarding.domainDnsVerificationModal.message.success')">
                    <template #domain>
                      <span class="font-weight-600">{{ domainComputed }}</span>
                    </template>
                  </i18next>
                </span>

                <span v-else-if="verificationKind === 'incorrect'">
                  <i18next :translation="t('heading.onboarding.domainDnsVerificationModal.message.incorrect')">
                    <template #domain>
                      <span class="font-weight-600">{{ domainComputed }}</span>
                    </template>
                  </i18next>
                </span>

                <span v-else>{{ t('heading.onboarding.domainDnsVerificationModal.message.tryAgain') }}</span>
              </span>
            </AlertBox>

            <DnsOptions
              :cdn-dns-records="cdnDnsRecords"
              :cdn-pending="cdnDnsPending(instance)"
              :dns-settings="instance.dns_settings"
              :domain="clientDomainName"
              :has-dns-server="Boolean(instance.service_has_dns)"
              hide-title
              :host-c-names="instance.host_c_names ?? []"
              :ipv4-addresses="ipv4Addresses"
              :nameservers="instance.dns_nameservers"
              :onboarding-subdomain="null"
            />
          </v-card-text>

          <v-card-actions class="d-flex flex-column pb-6 px-10 pt-2 mt-4">
            <AppButton
              v-if="!verification.isVerificationSuccessful"
              block
              class="set-domain-submit"
              data-testid="set-domain-verify-button"
              kind="primary"
              :loading="submitting"
              size="x-large"
              @click="verifyDnsPropagation()"
            >
              {{ t('button.verifyDomain') }}
            </AppButton>

            <AppButton
              v-else
              block
              class="set-domain-submit"
              data-testid="set-domain-change-confirm"
              kind="primary"
              :loading="submitting"
              size="x-large"
              @click="nextStep"
            >
              {{ t('button.setDomain.changeDomain') }}
            </AppButton>

            <AppButton
              v-if="!verification.isVerificationSuccessful"
              block
              class="mt-2"
              data-testid="set-domain-skip"
              kind="cancel"
              size="x-large"
              @click="changeDomain"
            >
              <span class="p-1 font-weight-light text-gray-darken-1">{{ t('button.skip') }}</span>
            </AppButton>
          </v-card-actions>
        </template>
      </v-card>
    </v-dialog>

    <!-- Outside the dialog: a V4 lazy dialog unmounts its content after it closes, and `openPreview` closes it
         (legacy nested the modal in the dialog, V2 kept closed content mounted). -->
    <PreviewSiteModal
      v-if="isSingleServer && showPreviewSiteCta"
      v-model="previewOpen"
      auto-generate
      :instance="instance"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { DnsRecordInput } from '@/entities/domain/ui/dns-options'
  // The trigger, the dialog and the DNS check of the project's domain in one component. TopBarTitle only embeds it;
  // `instance-published` goes up through the top bar. Step 1 (the DNS config) is here; steps 0, 2 and 3 come with their phases.
  import type { DnsServerRecord, DnsSettings } from '@/entities/domain/verify-domain-resolving'
  import type { CdnDnsRecord, InstanceResource, RawInstance } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { clearChangeDomainOptions, getChangeDomainOptions, putChangeDomain, putChangeSubdomain } from '@/views/projects/project/instance.api'
  import { type DomainVerification, verifyDomain } from '@/entities/domain/domain-verification.api'
  import DnsOptions from '@/entities/domain/ui/DnsOptions.vue'
  import TransferDomainSteps from '@/entities/domain/ui/TransferDomainSteps.vue'
  import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
  import { isValidDomain } from '@/entities/project/create-staging'
  import { cdnDnsPending, planHasCdn } from '@/entities/project/instance-resource'
  import { isPanelAlphaOnlineHost } from '@/entities/project/open-project'
  import PreviewSiteModal from '@/entities/project/ui/PreviewSiteModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import AlertBox from '@/shared/ui/alert-box/AlertBox.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import { checkDnsMismatch } from './dns-propagation'
  import {
    beginVerificationAttempt,
    canSubmitForm,
    finishVerificationAttempt,
    needsDnsGate,
    nextStepAfterForm,
    resetVerificationFlags,
    resolveCdnRecords,
    domainComputed as resolveDomainName,
    type VerificationFlags,
    verificationMessage,
    type VerificationRecord,
  } from './set-domain'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'dns-propagation-in-progress': []
    'instance-published': [instance: RawInstance]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const alerts = useAlertsStore()

  /** The current address is served through the PanelAlpha Online proxy: changing the main domain removes it for good. */
  const onlineZone = computed(() => isPanelAlphaOnlineHost(props.instance.domain))

  const isOpen = ref(false)
  /** The step: 0 the form, 1 the DNS config, 2 transfer, 3 DNS verification. Stays 0 until the mount check ends; not reset between openings. */
  const step = ref(0)
  const dnsMismatch = ref(false)
  const checkingDns = ref(false)
  const loadingOptions = ref(false)
  /** The mount DNS check and the options request both show the spinner of the trigger. */
  const loading = computed(() => checkingDns.value || loadingOptions.value)
  const freeSubdomains = ref<string[]>([])
  const freeDomainAffix = ref('')
  const ipv4Addresses = ref<string[]>([])
  const cdnDnsRecords = ref<CdnDnsRecord[]>(props.instance.cdn_dns_records || [])
  const previewOpen = ref(false)
  /** Drives the loading state of "Use this domain" while the PUT and the DNS check run. */
  const submitting = ref(false)
  /** The transfer step is on. */
  const transferAllowed = computed(() => Boolean(props.instance.server_settings?.domain_transfer_allowed))
  /** 0 "Set domain", 1 "Set subdomain", `undefined` when both are collapsed. Not reset between openings (as in legacy). */
  const panelOpen = ref<number | undefined>(0)
  const clientDomainName = ref('')
  const freeDomainName = ref('')
  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  /** The transfer step's error (`verifyDomain` failure, or the "verification still required" message). */
  const localErrorMessage = ref('')
  /** The flags of the verification steps; reset on every opening. */
  const verification = ref<VerificationFlags>(resetVerificationFlags())
  /** The DNS record of the transfer step (`verification_record`). */
  const verificationRecord = ref<VerificationRecord | null>(null)
  /**
   * Bumped on every opening. A request started in an earlier opening still saves and emits, but it does not move `step`, the flags or
   * `isOpen` of the current opening.
   */
  let openingId = 0
  /** The name that is verified and submitted; also the `domain` of the messages. */
  const domainComputed = computed(() => resolveDomainName(panelOpen.value, clientDomainName.value, freeDomainName.value, freeDomainAffix.value))
  const transferEnabled = computed(() => Boolean(props.instance.plan_settings?.domain_transfer_enabled))
  const eagerVerification = computed(() => Boolean(props.instance.plan_settings?.eager_domain_dns_verification_enabled))
  const verificationKind = computed(() => verificationMessage(verification.value))

  useBodyScrollLock(isOpen)

  /** The order link shows only when the account has one. */
  const orderDomainLink = computed(() => session.home?.user?.order_domain_link ?? '')

  // V4 calls each rule on validation, so `t` is read at that moment.
  const domainRules = [
    (value: string) => !!value || t('validation.required', { field: t('form.label.domainName') }),
    (value: string) => isValidDomain(value) || t('form.validation.valid', { field: t('form.label.domainName') }),
  ]
  const subdomainRules = [
    (value: string) => !!value || t('validation.required', { field: t('general.subdomain') }),
  ]
  const affixRules = [
    (value: string) => !!value || t('validation.required', { field: t('form.label.domain') }),
  ]

  const isSingleServer = computed(() => session.home?.app?.single_server?.active === true)
  const showPreviewSiteCta = computed(() => !isPanelAlphaOnlineHost(props.instance.url || props.instance.domain))

  /** The records the DNS server of the domain has (`domain_zone_details.configuration_records`). */
  const dnsServerRecords = computed<DnsRecordInput[]>(() => (
    (props.instance.domain_zone_details as { configuration_records?: DnsRecordInput[] } | undefined)?.configuration_records ?? []
  ))

  /**
   * The options fix the CDN records (`resolveCdnRecords`), and the modal opens only
   * after they load. A failure is an alert and the modal stays closed.
   */
  async function loadModal (): Promise<void> {
    openingId += 1
    loadingOptions.value = true
    try {
      const options = await getChangeDomainOptions(props.instance.id)
      freeSubdomains.value = options.subdomains
      freeDomainAffix.value = options.subdomains[0] ?? ''
      ipv4Addresses.value = options.ipv4_addresses
      const cdn = resolveCdnRecords({
        optionsRecords: options.cdn_dns_records,
        planHasCdn: planHasCdn(props.instance),
        instanceRecords: props.instance.cdn_dns_records,
      })
      if (cdn.clearCache) {
        clearChangeDomainOptions(props.instance.id)
      } else {
        // The instance is written too: `cdnDnsPending` of the modal and the rest of the page read it.
        // eslint-disable-next-line vue/no-mutating-props -- the instance is the shared store object, as in legacy
        props.instance.cdn_dns_records = cdn.records
      }
      cdnDnsRecords.value = cdn.records
      // Every opening starts with the flags and the error cleared. `step` is kept (as in legacy).
      verification.value = resetVerificationFlags()
      localErrorMessage.value = ''
      isOpen.value = true
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loadingOptions.value = false
    }
  }

  /**
   * Shared by the mount check and the save: the trigger shows its spinner,
   * the result goes to `dnsMismatch`, and a miss emits `dns-propagation-in-progress` before the caller goes on (legacy order).
   */
  async function runDnsCheck (options: { afterSave?: boolean } = {}): Promise<void> {
    checkingDns.value = true
    try {
      dnsMismatch.value = await checkDnsMismatch(props.instance, options)
    } finally {
      checkingDns.value = false
    }
    if (dnsMismatch.value) {
      emit('dns-propagation-in-progress')
    }
  }

  /**
   * An IP in the URL or DNS alerts turned off
   * leave step 0 with no check. Otherwise the check runs and only then step 1 (also for the panelalpha.online host, which `checkDnsMismatch`
   * answers without a fetch).
   */
  async function runMountCheck (): Promise<void> {
    if (props.instance.hasIpAddressInUrl() || !props.instance.getDnsAlertsEnabled()) {
      return
    }
    try {
      await runDnsCheck()
    } catch (error) {
      // A failed check is an alert; the step stays 0 as with alerts off.
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return
    }
    step.value = 1
  }

  /**
   * With both panels collapsed nothing is validated and
   * nothing is sent. Then the form is validated and the chosen panel is saved. A save already in flight blocks a second one.
   */
  async function submitForm (): Promise<void> {
    if (submitting.value) {
      return
    }
    const panel = panelOpen.value
    if (panel === undefined || !canSubmitForm(panel)) {
      return
    }
    const result = await form.value?.validate()
    if (!result?.valid) {
      return
    }
    await nextStep()
  }

  /** A failure is `localErrorMessage` and an alert, and the step does not go on. */
  async function requestTransferVerification (opening = openingId): Promise<DomainVerification | null> {
    submitting.value = true
    try {
      return await verifyDomain(props.instance.service_id as number, domainComputed.value)
    } catch (error) {
      const message = getErrorMessage(error)
      if (opening === openingId) {
        localErrorMessage.value = message
      }
      alerts.addAlert({ success: false, errorMessage: message })
      return null
    } finally {
      submitting.value = false
    }
  }

  /**
   * The first attempt runs at once; "Verify domain" waits 2 s.
   * The flags move with the result (`finishVerificationAttempt`).
   */
  async function verifyDnsPropagation (firstAttempt = false, opening = openingId): Promise<void> {
    submitting.value = true
    try {
      if (!firstAttempt) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      if (opening === openingId) {
        verification.value = beginVerificationAttempt(verification.value, firstAttempt)
      }
      const resolved = await verifyDomainResolving({
        domain: domainComputed.value,
        onboardingSubdomain: props.instance.onboarding_subdomain,
        dnsSettings: props.instance.dns_settings as DnsSettings,
        hasDnsServer: Boolean(props.instance.service_has_dns),
        ipv4Addresses: props.instance.getDnsIpv4Addresses() as string[],
        nameservers: props.instance.service_nameservers as string[] | undefined,
        hostCNames: props.instance.host_c_names ?? [],
        recordsFromDnsServer: dnsServerRecords.value as DnsServerRecord[],
        eagerDnsVerification: eagerVerification.value,
        skipARecordVerification: cdnDnsPending(props.instance),
      })
      props.instance.setDnsResolveStatus(resolved)
      if (opening === openingId) {
        verification.value = finishVerificationAttempt(verification.value, { resolved, firstAttempt })
      }
    } catch (error) {
      // A failed lookup is an alert; the flags keep their state.
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  /**
   * Runs when entered from "Use this domain" (after the form validates) and from the step 2 and
   * step 3 buttons: the transfer step (0 → 2, and 2 → 2 with the "still required" error), the eager DNS gate (→ 3), then `changeDomain`.
   */
  async function nextStep (): Promise<void> {
    if (submitting.value) {
      return
    }
    const opening = openingId
    const isCurrent = (): boolean => opening === openingId
    localErrorMessage.value = ''
    if (!canSubmitForm(panelOpen.value)) {
      return
    }
    if (step.value === 0 && transferAllowed.value) {
      const response = await requestTransferVerification(opening)
      if (!response || !isCurrent()) {
        return
      }
      if (nextStepAfterForm({ transferAllowed: true, verificationRequired: Boolean(response.verification_required) }) === 2) {
        verificationRecord.value = (response.verification_record as VerificationRecord | undefined) ?? null
        step.value = 2
        return
      }
    }
    if (step.value === 2 && transferAllowed.value) {
      const response = await requestTransferVerification(opening)
      if (!response || !isCurrent()) {
        return
      }
      if (response.verification_required) {
        verificationRecord.value = (response.verification_record as VerificationRecord | undefined) ?? null
        localErrorMessage.value = t('heading.onboarding.transferDomain.message.verificationRequired')
        return
      }
    }
    if (needsDnsGate({ step: step.value, panel: panelOpen.value, eager: eagerVerification.value })) {
      await verifyDnsPropagation(true, opening)
      if (!isCurrent()) {
        return
      }
      if (!verification.value.isNameserversCorrected) {
        step.value = 3
        return
      }
    }
    await changeDomain(opening)
  }

  /**
   * Sends `PUT change-domain/domain` (panel 0) or `PUT change-domain/subdomain` (panel 1),
   * the DNS check on the old instance, then `instance-published`. Panel 0 goes to step 1, panel 1 closes the modal. A failure is an alert and
   * `submitting` goes back to `false`. With both panels collapsed nothing is sent.
   */
  async function changeDomain (opening = openingId): Promise<void> {
    const panel = panelOpen.value
    if (panel === undefined || !canSubmitForm(panel)) {
      return
    }
    submitting.value = true
    try {
      const raw = panel === 0
        ? await putChangeDomain(props.instance.id, clientDomainName.value)
        : await putChangeSubdomain(props.instance.id, { subdomain: freeDomainName.value, domain: freeDomainAffix.value })
      // The save is already on the server: a failed DNS check must not hide it from the store or trigger a second PUT.
      await runDnsCheck({ afterSave: true }).catch(() => undefined)
      emit('instance-published', raw)
      if (opening !== openingId) {
        return
      }
      step.value = 1
      if (panel === 1) {
        isOpen.value = false
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  /**
   * The dialog closes and the preview modal opens with the temporary URL
   * (`auto-generate`, which the legacy modal left to its own button).
   */
  function openPreview (): void {
    isOpen.value = false
    previewOpen.value = true
  }

  onMounted(() => {
    void runMountCheck()
  })
</script>

<style lang="scss" scoped>
// The domain row and the Preview row of step 1.
.domain-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 6px;
  border: 1px solid var(--v-gray-lighten2);
  padding: 16px;
  margin-bottom: 16px;
}

// Text colour of the close action, moved from an inline style to a class.
.set-domain-close-action,
.set-domain-submit {
  color: var(--v-white-base);
}

// 1 px border, no `::before` / `::after` shadows, the open panel takes the primary border.
.v-expansion-panel {
  border: 1px solid var(--v-gray-lighten2);

  &::before,
  &::after {
    display: none;
  }

  // V4 draws the panel elevation in the `__shadow` node (V2 had none); inner node of the child, so `:deep`.
  :deep(.v-expansion-panel__shadow) {
    display: none;
  }
}

.v-expansion-panel--active {
  border-color: rgb(var(--v-theme-primary));
}

// No bottom padding, gray text. Inner V4 node, so `:deep`.
// Legacy `.v-expansion-panel-content__wrap` (V2) has no top padding: the V4 text wrapper adds 8 px above the label, which made the step 0 card 8 px taller.
.v-expansion-panel :deep(.v-expansion-panel-text__wrapper) {
  padding-top: 0;
  padding-bottom: 0;
  color: var(--v-gray-lighten1);
}

// A 20 px ring at `left` 24 px and a 10 px dot at `left` 29 px.
// The fill is the `checkbox` theme colour (theme `checkbox` is #FFFFFF, dark #2F2F3D):
// the ring is filled and the dot is white on the checked (green) ring. V4 declares it as `--v-theme-checkbox` (an RGB triplet).
.v-expansion-panel-title {
  padding-left: 60px;
  position: relative;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 24px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 1 !important;
    background: rgb(var(--v-theme-checkbox));
    border-radius: 20px;
  }

  &::before {
    transition: border-color 0.24s ease, background-color 0.24s ease;
    width: 20px;
    height: 20px;
    border: 1px solid var(--v-gray-lighten2);
  }

  // V4 gives the title's `::after` a 2px border (its focus ring); the V2 dot had none.
  &::after {
    width: 10px;
    height: 10px;
    z-index: 10;
    left: 29px;
    border: 0;
  }

  &:hover::before {
    border-color: rgb(var(--v-theme-primary));
  }

  // Legacy `.v-expansion-panel-header__icon` is 0x0 (V2 chevron, no box). The V4 `__icon` span is a 30 px flex item of the title row and
  // narrows the title text: on light-mobile the title wrapped to 4 lines instead of 3 (header 144 px vs 116 px). Rendered by the
  // child `VExpansionPanelTitle`, so `:deep`: a plain scoped selector does not reach it.
  :deep(.v-expansion-panel-title__icon) {
    display: none;
  }
}

.v-expansion-panel-title--active::before {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary));
}

// V2 utility, not in V4.
.order-domain-link {
  float: right;
}

// Legacy `.v-card__actions` (V2) had no `gap`; V4 `.v-card-actions` spaces its children with `gap: 0.5rem`, which put Cancel 8 px lower
// on top of the `mt-2`. Same fix as `_dialog.scss` `.onboarding-modal .v-card-actions`.
.v-card-actions {
  gap: 0;
}

// Legacy `x-small` buttons (Change, Generate URL) are 32px in V2 (`$btn-sizes`); V4 `x-small` is 24px,
// so the height is restated.
.set-domain-change.v-btn,
.set-domain-preview-button.v-btn {
  --v-btn-height: 32px;
}

// Legacy change-domain button root type is 14px / 21px; V4 `.v-btn` root gives 16px / 24px (as `.subinstance-bar__add`).
.change-domain-btn {
  font-size: 14px;
  line-height: 21px;
}

// Legacy trigger is `x-small` outlined: 32 px tall (hover and focus overlays measured 132.25 x 32 px). V4 `size="small"` gives 30 px here,
// so the height is restated as for `.set-domain-change` above.
.change-domain-btn.v-btn {
  --v-btn-height: 32px;
}

// Legacy subdomain field has no explicit width: V2 flex basis gave it 152.36 px and the affix select 274.53 px (446 px row).
// V4 splits the row 139.94 / 286.95 px, so the field takes its legacy width and the select the rest. `0 1` (not `0 0`): on the 149 px mobile row
// the field may shrink (152 px overflowed the row; legacy shows 24 px there).
.set-domain-subdomain-field {
  flex: 0 1 152px;

  // The validation message sits under the narrow field and stays on one line: it runs into the empty space under the affix select (which has
  // `hide-details`) instead of wrapping.
  :deep(.v-input__details),
  :deep(.v-messages),
  :deep(.v-messages__message) {
    overflow: visible;
    white-space: nowrap;
    word-break: normal;
    overflow-wrap: normal;
  }
}

// The row is top aligned, so a message under the field does not move the dot and the select. The outlined field is 48 px tall: a 48 px line
// box puts the dot on the text line, as the old centred row did without a message.
.set-domain-subdomain-dot {
  line-height: 48px;
}

// The legacy button was `outlined color="error"`: V2 `.error--text` made the border and the icon error-coloured; the global
// outlined button layer (`_buttons.scss`) paints the border grey and V4 keeps the icon on the text colour.
.dns-propagation-btn.dns-propagation-btn.v-btn--variant-outlined {
  // !important: beats the global outlined `border-color: … !important`.
  border-color: var(--v-error-base) !important;

  .v-icon {
    color: var(--v-error-base);
  }
}
</style>
