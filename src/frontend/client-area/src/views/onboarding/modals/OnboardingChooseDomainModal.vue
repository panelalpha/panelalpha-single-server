<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-domain-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      :close-disabled="loading"
      @close="closeModal"
    >
      <template v-if="theme?.screenshot_url">
        <v-img
          height="285px"
          position="top center"
          :src="theme.screenshot_url"
          width="100%"
        />

        <v-divider />
      </template>

      <v-card-text class="px-10 pt-8">
        <h6>{{ t('heading.onboarding.chooseProduct.domain.title') }}</h6>

        <p class="p-3 mt-2">
          {{ t('heading.onboarding.chooseProduct.domain.subtitle') }}
        </p>

        <v-form
          ref="domainForm"
          @submit.prevent="onEnter"
        >
          <v-expansion-panels
            v-if="hasSubdomainBases"
            v-model="panelOpen"
            class="onboarding-domain-panels"
            mandatory
          >
            <v-expansion-panel
              elevation="0"
              :value="0"
            >
              <v-expansion-panel-title
                class="h6 text--heading font-weight-bold"
                hide-actions
              >
                {{ t('heading.instance.modal.setDomain.set.domain.title') }}
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <v-combobox
                  v-if="!panelOpen"
                  ref="domainCombobox"
                  v-model:search="domainSearch"
                  class="v-input--lg mt-2"
                  :disabled="loading"
                  :error-messages="domainError ? [domainError] : []"
                  hide-details="auto"
                  hide-no-data
                  item-title="domain"
                  :items="domainComboboxItems"
                  :loading="domainsLoading"
                  :menu="showDomainPickerMenu"
                  :menu-props="{
                    offset: 8,
                    contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding',
                  }"
                  :model-value="domain"
                  no-filter
                  :placeholder="t('form.placeholder.domain')"
                  return-object
                  :rules="domainRules"
                  validate-on="blur"
                  variant="outlined"
                  @blur="onDomainBlur"
                  @click="openDomainPickerMenu"
                  @focus="openDomainPickerMenu"
                  @keydown.enter.prevent="onEnter"
                  @update:menu="onDomainMenuUpdate"
                  @update:model-value="onDomainModelUpdate"
                >
                  <template
                    v-if="domainComboboxItems.length === 0"
                    #append-inner
                  >
                    <v-icon
                      class="v-select__menu-icon"
                      icon="$dropdown"
                    />
                  </template>
                </v-combobox>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel
              elevation="0"
              :value="1"
            >
              <v-expansion-panel-title
                class="h6 text--heading font-weight-bold"
                hide-actions
              >
                {{ t('heading.instance.modal.setDomain.set.subdomain.title') }}
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <div
                  v-if="panelOpen === 1"
                  class="d-flex align-center"
                >
                  <validated-text-field
                    class="free-domain-name"
                    :disabled="loading"
                    :error-messages="domainError ? [domainError] : []"
                    hide-details="auto"
                    :model-value="freeDomainName"
                    placeholder="mydomain"
                    :rules="[
                      (value: string) => !!value || t('validation.required', { field: t('general.subdomain') }),
                    ]"
                    validate-on="blur"
                    variant="outlined"
                    @blur="onFreeSubdomainBlur"
                    @keydown.enter.prevent="onEnter"
                    @update:model-value="onFreeDomainNameUpdate"
                  />

                  <span class="mx-2 mb-6">.</span>

                  <v-select
                    :disabled="loading"
                    hide-details
                    :items="subdomainBases"
                    :menu-props="{
                      offset: 8,
                      closeOnContentClick: false,
                      contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding',
                    }"
                    :model-value="freeDomainAffix"
                    :rules="[
                      (value) => !!value || t('validation.required', { field: t('form.label.domain') }),
                    ]"
                    validate-on="blur"
                    variant="outlined"
                    @update:model-value="onFreeAffixUpdate"
                  />
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <v-combobox
            v-else
            ref="domainCombobox"
            v-model:search="domainSearch"
            class="v-input--lg"
            :disabled="loading"
            :error-messages="domainError ? [domainError] : []"
            hide-details="auto"
            hide-no-data
            item-title="domain"
            :items="domainComboboxItems"
            :loading="domainsLoading"
            :menu="showDomainPickerMenu"
            :menu-props="{
              offset: 8,
              contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding',
            }"
            :model-value="domain"
            no-filter
            :placeholder="t('form.placeholder.domain')"
            return-object
            :rules="domainRules"
            validate-on="blur"
            variant="outlined"
            @blur="onDomainBlur"
            @click="openDomainPickerMenu"
            @focus="openDomainPickerMenu"
            @keydown.enter.prevent="onEnter"
            @update:menu="onDomainMenuUpdate"
            @update:model-value="onDomainModelUpdate"
          >
            <template
              v-if="domainComboboxItems.length === 0"
              #append-inner
            >
              <v-icon
                class="v-select__menu-icon"
                icon="$dropdown"
              />
            </template>
          </v-combobox>
        </v-form>
      </v-card-text>

      <v-card-actions class="d-flex flex-column pb-4 px-10 pt-2">
        <AppButton
          block
          data-testid="onboarding-domain-continue"
          :disabled="isContinueButtonDisabled"
          kind="primary"
          :loading="loading || domainValidationLoading"
          size="x-large"
          @click="selectDomain"
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
          data-testid="onboarding-domain-secondary"
          :disabled="loading"
          kind="cancel"
          size="x-large"
          @click="onSecondaryClick"
        >
          <span
            class="font-weight-light text--gray-darken1"
            :class="secondary === 'change-service' ? 'p-1' : 'p-2'"
          >
            {{ ' ' + t(secondaryLabelKey) + ' ' }}
          </span>
        </AppButton>
      </v-card-actions>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The combobox and the subdomain
  // panels keep the legacy flow; the pure rules live in ./choose-domain. The debounced check (500 ms) is a local timer: legacy
  // `_.debounce` is not in this app.
  import type { InstallationTypeKey, OnboardingService } from '@/views/onboarding/onboarding-service'
  import type { OnboardingTheme, ServiceDomain } from '@/views/onboarding/onboarding.api'
  import type { FormRule } from '@/shared/ui/form/use-form-rules'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
  import { validateServiceDomain } from '@/views/onboarding/onboarding.api'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import { useServiceDomains } from '@/views/onboarding/use-service-domains'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'
  import {
    chooseDomainActionKey,
    chooseDomainSecondary,
    composeFreeDomainName,
    domainNameOf,
    isBlacklistedDomain,
    isContinueDisabled,
    typedDomainName,
  } from './choose-domain'

  /** Debounce timer (500 ms) of the domain check. */
  const DOMAIN_VALIDATION_DEBOUNCE_MS = 500

  const props = withDefaults(defineProps<{
    modelValue: boolean
    service: OnboardingService | null
    services: OnboardingService[]
    theme?: OnboardingTheme | null
    /** The copy and the secondary button depend on it. */
    installationType?: InstallationTypeKey
    /** A request of the flow runs: the modal shows its overlay and locks the buttons. */
    loading?: boolean
    /** The copy key of the overlay, empty for the availability check. */
    loadingText?: string | null
  }>(), {
    theme: null,
    installationType: 'wordpress',
    loading: false,
    loadingText: null,
  })

  const emit = defineEmits<{
    'domain-selected': [payload: { domain: string }]
    'change-service-button-clicked': []
    'change-theme-button-clicked': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()
  const formRules = useFormRules()

  const { domains, loading: domainsLoading, reload, clear } = useServiceDomains(toRef(props, 'service'))

  // `null`, not `''`: V4 takes an empty string for a chosen item (`v-field--dirty`), so the placeholder would never show (V2 showed it).
  const domain = ref<ServiceDomain | string | null>(null)
  const domainSearch = ref('')
  const domainValidationLoading = ref(false)
  const domainValidationError = ref<string | null>(null)
  const domainValidationPassed = ref(false)
  const lastValidatedDomain = ref<string | null>(null)
  /** The name each row's field last passed its check for: a row keeps its name while the other one is open. */
  const passedOwnDomain = ref<string | null>(null)
  const passedFreeDomain = ref<string | null>(null)
  const showDomainPickerMenu = ref(false)
  /** 0 = the domain panel, 1 = the subdomain panel. */
  const panelOpen = ref<number | undefined>(0)
  const freeDomainName = ref('')
  const freeDomainAffix = ref('')
  const domainForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  /** An answer of an older check is dropped. */
  let domainValidationSeq = 0
  let validateTimer: ReturnType<typeof setTimeout> | undefined
  let menuOpenBlocked = false

  const subdomainBases = computed<string[]>(() => {
    const bases = props.service?.onboarding?.subdomain_bases
    return Array.isArray(bases) ? bases.filter((base): base is string => typeof base === 'string' && base !== '') : []
  })
  const hasSubdomainBases = computed(() => subdomainBases.value.length > 0)
  const isFreeSubdomainMode = computed(() => hasSubdomainBases.value && panelOpen.value === 1)
  const composedFreeDomainName = computed(() => composeFreeDomainName(freeDomainName.value, freeDomainAffix.value))
  const currentDomainName = computed(() => (isFreeSubdomainMode.value
    ? composedFreeDomainName.value
    : typedDomainName(domainSearch.value, domain.value)))
  const domainComboboxItems = computed(() => (showDomainPickerMenu.value ? domains.value : []))

  /** The TLD rules on the name, then the service blacklist. */
  const domainRules = computed<FormRule[]>(() => {
    const blacklist = props.service?.onboarding?.domains_blacklist ?? []
    return [
      ...formRules.domainRulesTld.map(rule => (value: unknown) => rule(domainNameOf(value))),
      (value: unknown) => (isBlacklistedDomain(domainNameOf(value), blacklist) ? t('form.validation.domain.blacklisted') : true),
    ]
  })

  const isContinueButtonDisabled = computed(() => isContinueDisabled({
    loading: props.loading,
    validating: domainValidationLoading.value,
    freeMode: isFreeSubdomainMode.value,
    composed: composedFreeDomainName.value,
    error: domainError.value,
    passed: domainValidationPassed.value,
    lastValidated: lastValidatedDomain.value,
    current: currentDomainName.value,
  }))

  /** The first rule the current name fails, shown live; an empty field is not wrong yet. */
  const domainFormatError = computed<string | null>(() => {
    const name = currentDomainName.value
    if (!name) {
      return null
    }
    for (const rule of domainRules.value) {
      const result = rule(name)
      if (result !== true) {
        return result
      }
    }
    return null
  })

  /** What the fields show: the format rule first, the availability answer of the service next. */
  const domainError = computed<string | null>(() => domainFormatError.value ?? domainValidationError.value)

  const actionKey = computed(() => chooseDomainActionKey(props.service ?? undefined, props.installationType))
  const secondary = computed(() => chooseDomainSecondary(props.services.length, props.service ?? undefined, props.installationType))
  const secondaryLabelKey = computed(() => {
    switch (secondary.value) {
      case 'change-service': { return 'button.service.change'
      }
      case 'change-theme': { return 'button.theme.change'
      }
      default: { return 'button.maybeLater'
      }
    }
  })

  function cancelDebouncedDomainValidation (): void {
    clearTimeout(validateTimer)
    validateTimer = undefined
  }

  function resetDomainValidation (): void {
    cancelDebouncedDomainValidation()
    domainValidationLoading.value = false
    domainValidationError.value = null
    domainValidationPassed.value = false
    domainValidationSeq = 0
    lastValidatedDomain.value = null
  }

  function initFreeSubdomainDefaults (): void {
    freeDomainAffix.value = subdomainBases.value[0] ?? ''
    freeDomainName.value = ''
  }

  function openDomainPickerMenu (): void {
    menuOpenBlocked = false
    showDomainPickerMenu.value = true
  }

  /**
   * Legacy opens the list only from focus and click and closes it on every typed or picked change, on blur and on Esc. V4
   * `VCombobox` asks for the menu again after typing and clearing (`update:menu` true), which would keep the list open over
   * "Create Site", so after a close only the next click or focus opens it.
   */
  function onDomainMenuUpdate (open: boolean): void {
    if (open && menuOpenBlocked) {
      return
    }
    showDomainPickerMenu.value = open
  }

  function closeDomainPickerMenu (): void {
    menuOpenBlocked = true
    showDomainPickerMenu.value = false
  }

  function resetForm (): void {
    domain.value = null
    domainSearch.value = ''
    panelOpen.value = 0
    initFreeSubdomainDefaults()
    closeDomainPickerMenu()
    clear()
    passedOwnDomain.value = null
    passedFreeDomain.value = null
    resetDomainValidation()
  }

  function runScheduledValidation (): void {
    if (domainFormatError.value !== null) {
      return
    }
    void validateDomainAvailability()
  }

  function scheduleDebouncedDomainValidation (): void {
    cancelDebouncedDomainValidation()
    validateTimer = setTimeout(() => {
      validateTimer = undefined
      runScheduledValidation()
    }, DOMAIN_VALIDATION_DEBOUNCE_MS)
  }

  /** A pending check runs now (on blur), otherwise nothing. */
  function flushDebouncedDomainValidation (): void {
    if (validateTimer === undefined) {
      return
    }
    cancelDebouncedDomainValidation()
    runScheduledValidation()
  }

  /** The typed text becomes the model: the domain of the list with that name is another
   * project, so it is only a name here and the availability check decides (`Domain is already in use.`). */
  function syncDomainModelFromSearch (): void {
    const fromSearch = domainSearch.value.trim()

    if (typeof domain.value === 'object' && domain.value !== null) {
      const fromModel = domainNameOf(domain.value)
      if (!fromSearch || fromSearch.toLowerCase() === fromModel.toLowerCase()) {
        return
      }
    }

    domain.value = fromSearch === '' ? null : fromSearch
  }

  /** The value changed, the check restarts. */
  function onDomainInput (): void {
    syncDomainModelFromSearch()

    const name = currentDomainName.value
    domainValidationPassed.value = false
    domainValidationError.value = null
    lastValidatedDomain.value = null

    if (!name) {
      cancelDebouncedDomainValidation()
      return
    }

    scheduleDebouncedDomainValidation()
  }

  /** A picked value is a domain of the list or the typed name, and it is checked either way. */
  function onDomainComboboxChange (): void {
    const name = domainNameOf(domain.value)
    if (name) {
      domainSearch.value = name
    }
    domain.value = name
    closeDomainPickerMenu()
    onDomainInput()
  }

  function onDomainModelUpdate (value: ServiceDomain | string | null): void {
    domain.value = value
    onDomainComboboxChange()
  }

  function onDomainBlur (): void {
    closeDomainPickerMenu()

    if (!currentDomainName.value) {
      return
    }

    flushDebouncedDomainValidation()
  }

  function onFreeSubdomainInput (): void {
    domainValidationPassed.value = false
    domainValidationError.value = null
    lastValidatedDomain.value = null

    if (!composedFreeDomainName.value) {
      cancelDebouncedDomainValidation()
      return
    }

    scheduleDebouncedDomainValidation()
  }

  function onFreeDomainNameUpdate (value: unknown): void {
    freeDomainName.value = String(value ?? '')
    onFreeSubdomainInput()
  }

  function onFreeAffixUpdate (value: unknown): void {
    freeDomainAffix.value = String(value ?? '')
    onFreeSubdomainInput()
  }

  function onFreeSubdomainBlur (): void {
    if (!composedFreeDomainName.value) {
      return
    }
    flushDebouncedDomainValidation()
  }

  function getDomainValidationError (error: unknown): string {
    const domainErrors = (error as { response?: { data?: { errors?: { domain?: unknown } } } })?.response?.data?.errors?.domain
    if (Array.isArray(domainErrors) && domainErrors.length > 0) {
      return String(domainErrors[0])
    }
    return getErrorMessage(error).replace(/^domain:\s*/i, '')
  }

  /** The service's validate request for the current name. */
  async function validateDomainAvailability (): Promise<boolean> {
    const name = currentDomainName.value
    const serviceId = props.service?.id

    if (serviceId === undefined || serviceId === null || !name) {
      return false
    }

    const seq = ++domainValidationSeq
    domainValidationLoading.value = true
    domainValidationError.value = null
    domainValidationPassed.value = false

    try {
      await validateServiceDomain(serviceId, name)
      if (seq !== domainValidationSeq) {
        return false
      }
      domainValidationPassed.value = true
      lastValidatedDomain.value = name
      if (isFreeSubdomainMode.value) {
        passedFreeDomain.value = name
      } else {
        passedOwnDomain.value = name
      }
      return true
    } catch (error) {
      if (seq !== domainValidationSeq) {
        return false
      }
      domainValidationError.value = getDomainValidationError(error)
      return false
    } finally {
      if (seq === domainValidationSeq) {
        domainValidationLoading.value = false
      }
    }
  }

  /**
    * The field loses focus, the typed text is synced into the model, and the name the continue
   * button acts on is resolved (the composed one in the subdomain panel).
   */
  async function prepareDomainField (): Promise<string> {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    await nextTick()

    if (isFreeSubdomainMode.value) {
      return composedFreeDomainName.value
    }

    syncDomainModelFromSearch()

    const domainName = typedDomainName(domainSearch.value, domain.value).trim()
    if (domainName) {
      domain.value = domainName
      domainSearch.value = domainName
    }

    await nextTick()

    return domainName
  }

  /** The form and the name are checked, the availability check runs, then the pick is emitted. */
  async function selectDomain (): Promise<void> {
    if (props.loading) {
      return
    }

    const domainName = await prepareDomainField()

    const result = await domainForm.value?.validate()
    if (result && !result.valid) {
      return
    }

    if (!domainName) {
      return
    }

    if (!domainValidationPassed.value || lastValidatedDomain.value !== domainName) {
      const ok = await validateDomainAvailability()
      if (!ok) {
        return
      }
    }

    emit('domain-selected', { domain: domainName })
  }

  function onEnter (): void {
    cancelDebouncedDomainValidation()
    void nextTick(() => selectDomain())
  }

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  function onSecondaryClick (): void {
    if (props.loading) {
      return
    }
    switch (secondary.value) {
      case 'change-service': {
        emit('change-service-button-clicked')
        break
      }
      case 'change-theme': {
        emit('change-theme-button-clicked')
        break
      }
      default: {
        emit('remove-modal')
      }
    }
  }

  watch(domainSearch, () => {
    if (!props.modelValue || isFreeSubdomainMode.value) {
      return
    }
    closeDomainPickerMenu()
    onDomainInput()
  })

  watch(panelOpen, () => {
    resetDomainValidation()
    if (isFreeSubdomainMode.value) {
      closeDomainPickerMenu()
    }
    // A name that passed its check still counts when its row comes back.
    const name = currentDomainName.value
    const passed = isFreeSubdomainMode.value ? passedFreeDomain.value : passedOwnDomain.value
    if (passed !== null && passed === name) {
      domainValidationPassed.value = true
      lastValidatedDomain.value = passed
      return
    }
    if (name) {
      scheduleDebouncedDomainValidation()
    }
  })

  watch(subdomainBases, bases => {
    if (!freeDomainAffix.value || !bases.includes(freeDomainAffix.value)) {
      freeDomainAffix.value = bases[0] ?? ''
    }
  }, { immediate: true })

  // Opening starts the domain panel and loads the list; closing resets the form.
  watch(() => props.modelValue, open => {
    if (open) {
      panelOpen.value = 0
      initFreeSubdomainDefaults()
      resetDomainValidation()
      reload()
    } else {
      resetForm()
    }
  })

  onBeforeUnmount(cancelDebouncedDomainValidation)
</script>

<style lang="scss" scoped>
  // Bordered panels with a radio circle in the
  // header instead of the chevron (`hide-actions`). V2 drew the circle on the header `::before` / `::after` (its hover overlay, hidden
  // by `opacity: 1`); V4 keeps the overlay in `__overlay`, so that one is hidden and the pseudo-elements are free.
  .onboarding-domain-panels {
    .v-expansion-panel {
      border: 1px solid var(--v-gray-lighten2);
      background-color: unset !important;

      // V2 `::before` (shadow) and `::after` (divider) were hidden; V4 draws the divider on `::after` and the shadow in `__shadow`.
      &::before,
      &::after {
        display: none;
      }

      :deep(.v-expansion-panel__shadow) {
        display: none;
      }

      &--active {
        border-color: rgb(var(--v-theme-primary));
      }

      // V2 `.v-expansion-panel-content__wrap` is `0 24px 16px`, legacy drops the bottom one; V4 `__wrapper` is `8px 24px 16px`.
      :deep(.v-expansion-panel-text__wrapper) {
        padding: 0 24px;
        color: var(--v-gray-lighten1);
      }
    }

    .v-expansion-panel-title {
      position: relative;
      padding-left: 60px;

      :deep(.v-expansion-panel-title__overlay) {
        display: none;
      }

      &::before,
      &::after {
        position: absolute;
        top: 50%;
        left: 24px;
        border-radius: 20px;
        background: rgb(var(--v-theme-checkbox));
        content: "";
        opacity: 1 !important;
        transform: translateY(-50%);
      }

      &::before {
        width: 20px;
        height: 20px;
        border: 1px solid var(--v-gray-lighten2);
        transition: border-color 0.24s ease, background-color 0.24s ease;
      }

      // V4 gives the title's `::after` a 2px border (its focus ring); the V2 dot had none.
      &::after {
        z-index: 10;
        left: 29px;
        border: 0;
        width: 10px;
        height: 10px;
      }

      &:hover::before {
        border-color: rgb(var(--v-theme-primary));
      }

      &--active::before {
        border-color: rgb(var(--v-theme-primary));
        background-color: rgb(var(--v-theme-primary));
      }
    }
  }

  // A 56px field with 8px corners (the global `v-input--lg` rule covers only text fields).
  .v-combobox.v-input--lg :deep(.v-field) {
    min-height: 56px;
    border-radius: 8px;
  }

  // Legacy subdomain field has no width: the V2 flex basis gave it 146.75px and the affix select the rest (265px of a 431px row);
  // V4 splits the row evenly. Same rule as `.set-domain-subdomain-field` (ui-instance-set-domain); `0 1` lets it shrink on mobile.
  .free-domain-name {
    flex: 0 1 147px;
  }
</style>
