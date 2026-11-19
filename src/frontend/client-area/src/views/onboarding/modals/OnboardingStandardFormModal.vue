<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-standard-form-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      :close-disabled="loading"
      @close="closeModal"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-start">
          <h4>{{ t('heading.onboarding.newInstance.title') }}</h4>
        </div>

        <v-divider class="mb-5" />

        <v-tabs
          v-if="hasAdvanced"
          v-model="tabs"
          class="mb-6"
        >
          <v-tab :value="0">
            {{ t('heading.onboarding.newInstance.advanced.tab.basic') }}
          </v-tab>

          <v-tab :value="1">
            {{ t('heading.onboarding.newInstance.advanced.tab.advanced') }}
          </v-tab>
        </v-tabs>

        <v-window v-model="tabs">
          <v-window-item :value="0">
            <v-form
              ref="formRef"
              class="form-box"
              @submit.prevent
            >
              <div class="d-flex flex-column">
                <label class="base--text p-3 mb-2 d-block">{{ t('form.label.siteName') }}</label>

                <validated-text-field
                  v-model="form.name"
                  class="v-input--md"
                  hide-details="auto"
                  :placeholder="t('form.placeholder.siteName')"
                  :rules="formRules.siteNameRules"
                  validate-on="blur"
                  variant="outlined"
                />
              </div>

              <div class="d-flex flex-column">
                <label class="base--text p-3 mb-2 d-block">{{ t('form.label.domain') }}</label>

                <template v-if="hasSubdomainBases">
                  <div class="d-flex input-group mb-2">
                    <v-select
                      v-model="form.domainProtocol"
                      class="mr-4 onboarding-protocol-select"
                      density="compact"
                      hide-details
                      :items="DOMAIN_PROTOCOLS"
                      variant="outlined"
                    />
                  </div>

                  <v-expansion-panels
                    v-model="domainPanelOpen"
                    class="onboarding-domain-panels mb-2"
                    mandatory
                  >
                    <v-expansion-panel :value="0">
                      <v-expansion-panel-title class="h6 text--heading font-weight-bold">
                        {{ t('heading.instance.modal.setDomain.set.domain.title') }}
                      </v-expansion-panel-title>

                      <v-expansion-panel-text>
                        <div
                          v-if="domainPanelOpen !== 1"
                          class="d-flex input-group"
                        >
                          <v-combobox
                            v-model:menu="showDomainMenu"
                            v-model:search="domainSearch"
                            class="v-input--md flex-grow-1"
                            hide-details="auto"
                            hide-no-data
                            item-title="domain"
                            item-value="domain"
                            :items="domainItems"
                            :loading="domainsLoading"
                            :menu-props="{
                              offset: 8,
                              contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding',
                            }"
                            :model-value="form.domain || null"
                            no-filter
                            persistent-placeholder
                            :placeholder="t('form.placeholder.domain')"
                            :rules="domainRules"
                            validate-on="blur"
                            variant="outlined"
                            @click="showDomainMenu = true"
                            @focus="showDomainMenu = true"
                            @update:model-value="onDomainPicked"
                          />

                          <OnboardingStandardFormSubdirectory
                            v-model:dir="form.dir"
                            v-model:open="subdirectoryOpen"
                          />
                        </div>
                      </v-expansion-panel-text>
                    </v-expansion-panel>

                    <v-expansion-panel :value="1">
                      <v-expansion-panel-title class="h6 text--heading font-weight-bold">
                        {{ t('heading.instance.modal.setDomain.set.subdomain.title') }}
                      </v-expansion-panel-title>

                      <v-expansion-panel-text>
                        <div
                          v-if="domainPanelOpen === 1"
                          class="d-flex align-center"
                        >
                          <validated-text-field
                            v-model="freeDomainName"
                            class="flex-grow-1"
                            hide-details="auto"
                            placeholder="mydomain"
                            :rules="[
                              (value: string) => !!value || t('validation.required', { field: t('general.subdomain') }),
                            ]"
                            validate-on="blur"
                            variant="outlined"
                          />

                          <span class="mx-2 mb-6">.</span>

                          <v-select
                            v-model="freeDomainAffix"
                            class="free-domain-affix"
                            hide-details
                            :items="subdomainBases"
                            :menu-props="{
                              offset: 8,
                              closeOnContentClick: false,
                              contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding',
                            }"
                            variant="outlined"
                          />
                        </div>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </template>

                <div
                  v-else
                  class="d-flex input-group"
                >
                  <v-select
                    v-model="form.domainProtocol"
                    class="mr-4 onboarding-protocol-select"
                    density="compact"
                    hide-details
                    :items="DOMAIN_PROTOCOLS"
                    variant="outlined"
                  />

                  <v-combobox
                    v-model:menu="showDomainMenu"
                    v-model:search="domainSearch"
                    class="v-input--md flex-grow-1"
                    hide-details="auto"
                    hide-no-data
                    item-title="domain"
                    item-value="domain"
                    :items="domainItems"
                    :loading="domainsLoading"
                    :menu-props="{
                      offset: 8,
                      contentClass: 'custom-dropdown-select custom-dropdown-select--onboarding',
                    }"
                    :model-value="form.domain || null"
                    no-filter
                    persistent-placeholder
                    :placeholder="t('form.placeholder.domain')"
                    :rules="domainRules"
                    validate-on="blur"
                    variant="outlined"
                    @click="showDomainMenu = true"
                    @focus="showDomainMenu = true"
                    @update:model-value="onDomainPicked"
                  />

                  <OnboardingStandardFormSubdirectory
                    v-model:dir="form.dir"
                    v-model:open="subdirectoryOpen"
                  />
                </div>
              </div>

              <div
                v-if="!forceTemplate"
                class="mt-4"
              >
                <v-tabs
                  v-model="installTab"
                  class="pb-4"
                >
                  <v-tab :value="0">
                    {{ t('heading.onboarding.newInstance.type.clean.tab') }}
                  </v-tab>

                  <v-tab
                    :disabled="noInstances"
                    :value="1"
                  >
                    <v-tooltip
                      :disabled="!noInstances"
                      location="bottom"
                    >
                      <template #activator="{ props: activatorProps }">
                        <span
                          class="tab-activator"
                          v-bind="activatorProps"
                        >
                          {{ t('heading.onboarding.newInstance.type.clone.tab') }}
                          <v-icon
                            v-if="noInstances"
                            class="ml-2"
                            icon="$help"
                            size="16"
                          />
                        </span>
                      </template>

                      <i class="text-error p-4">
                        {{ t('tooltip.onboarding.newInstance.noInstanceToClone') }}
                      </i>
                    </v-tooltip>
                  </v-tab>

                  <v-tab
                    :disabled="noTemplates"
                    :value="2"
                  >
                    <v-tooltip
                      :disabled="!noTemplates"
                      location="bottom"
                    >
                      <template #activator="{ props: activatorProps }">
                        <span
                          class="tab-activator"
                          v-bind="activatorProps"
                        >
                          {{ t('heading.onboarding.newInstance.type.template.tab') }}
                          <v-icon
                            v-if="noTemplates"
                            class="ml-2"
                            icon="$help"
                            size="16"
                          />
                        </span>
                      </template>

                      <i class="text-error p-4">
                        {{ t('heading.onboarding.newInstance.type.template.empty') }}
                      </i>
                    </v-tooltip>
                  </v-tab>
                </v-tabs>

                <v-window v-model="installTab">
                  <v-window-item :value="0">
                    <span
                      v-if="noVersions"
                      class="text-error"
                    >
                      {{ t('heading.onboarding.newInstance.type.clean.noVersions') }}
                    </span>

                    <v-tooltip
                      v-else
                      :disabled="asksVersion"
                      location="bottom"
                    >
                      <template #activator="{ props: activatorProps }">
                        <div v-bind="activatorProps">
                          <v-select
                            v-model="form.version"
                            density="compact"
                            :disabled="!asksVersion"
                            hide-details
                            item-title="text"
                            item-value="value"
                            :items="versionOptions"
                            :loading="loadingVersions"
                            variant="outlined"
                          >
                            <template #no-data>
                              <v-progress-circular
                                color="primary"
                                indeterminate
                                size="20"
                                width="2"
                              />
                            </template>
                          </v-select>
                        </div>
                      </template>

                      <span>{{ t('tooltip.onboarding.newInstance.onlyLatestVersion') }}</span>
                    </v-tooltip>
                  </v-window-item>

                  <v-window-item :value="1">
                    <v-select
                      v-if="!noInstances"
                      v-model="form.clone_instance_id"
                      density="compact"
                      hide-details
                      item-title="name"
                      item-value="id"
                      :items="instances"
                      :loading="loadingInstances"
                      variant="outlined"
                    >
                      <template #no-data>
                        <v-progress-circular
                          color="primary"
                          indeterminate
                          size="20"
                          width="2"
                        />
                      </template>
                    </v-select>
                  </v-window-item>

                  <v-window-item :value="2">
                    <span
                      v-if="noTemplates"
                      class="text-error mt-3 mb-6 d-block"
                    >
                      {{ t('message.emptyTable.templates.title') }}
                    </span>

                    <v-select
                      v-else
                      v-model="form.instance_template_id"
                      density="compact"
                      hide-details
                      item-title="name"
                      item-value="id"
                      :items="templates"
                      :loading="loadingTemplates"
                      placeholder="WordPress Templates"
                      variant="outlined"
                    >
                      <template #no-data>
                        <v-progress-circular
                          color="primary"
                          indeterminate
                          size="20"
                          width="2"
                        />
                      </template>
                    </v-select>
                  </v-window-item>
                </v-window>
              </div>
            </v-form>
          </v-window-item>

          <!-- Advanced tab: each field shows when its `standard_fields` flag is set. -->
          <v-window-item :value="1">
            <v-form
              ref="advancedFormRef"
              class="form-box"
              @submit.prevent
            >
              <div
                v-if="standardFields.language"
                class="d-flex flex-column mb-4"
              >
                <label class="base--text p-3 mb-2 d-block">{{ t('form.label.language') }}</label>

                <v-select
                  v-model="form.language"
                  density="compact"
                  hide-details
                  :items="languageItems"
                  variant="outlined"
                />
              </div>

              <div
                v-if="standardFields.database_name"
                class="d-flex flex-column mb-4"
              >
                <label class="base--text p-3 mb-2 d-block">{{ t('form.label.databaseName') }}</label>

                <validated-text-field
                  v-model="form.db_name"
                  class="v-input--md"
                  hide-details="auto"
                  validate-on="blur"
                  variant="outlined"
                />
              </div>

              <div
                v-if="standardFields.database_prefix"
                class="d-flex flex-column mb-4"
              >
                <label class="base--text p-3 mb-2 d-block">{{ t('form.label.databasePrefix') }}</label>

                <validated-text-field
                  v-model="form.db_prefix"
                  class="v-input--md"
                  hide-details="auto"
                  validate-on="blur"
                  variant="outlined"
                />
              </div>

              <v-row
                v-if="standardFields.admin_username || standardFields.admin_email"
                no-gutters
              >
                <v-col
                  v-if="standardFields.admin_username"
                  class="d-flex flex-column pr-2"
                  cols="6"
                >
                  <label class="base--text p-3 mb-2 d-block">{{ t('form.label.administratorUsername') }}</label>

                  <validated-text-field
                    v-model="form.admin_username"
                    class="v-input--md"
                    hide-details="auto"
                    placeholder="admin"
                    :rules="formRules.nameRules"
                    validate-on="blur"
                    variant="outlined"
                  />
                </v-col>

                <v-col
                  v-if="standardFields.admin_email"
                  class="d-flex flex-column pl-2"
                  cols="6"
                >
                  <label class="base--text p-3 mb-2 d-block">{{ t('form.label.administratorEmail') }}</label>

                  <validated-text-field
                    v-model="form.admin_email"
                    class="v-input--md"
                    hide-details="auto"
                    placeholder="test@nicedomain.com"
                    :rules="formRules.emailRules"
                    type="email"
                    validate-on="blur"
                    variant="outlined"
                  />
                </v-col>
              </v-row>

              <div
                v-if="standardFields.admin_password"
                class="d-flex flex-column"
              >
                <label class="base--text p-3 mb-2 d-block">{{ t('form.label.administratorPassword') }}</label>

                <div class="d-flex input-group">
                  <validated-text-field
                    v-model="form.admin_password"
                    autocomplete="new-password"
                    class="v-input--md"
                    hide-details="auto"
                    :rules="formRules.adminPasswordRules"
                    :type="showPassword ? 'text' : 'password'"
                    validate-on="blur"
                    variant="outlined"
                  />

                  <AppButton
                    :aria-label="showPassword ? t('button.secret.hide') : t('button.secret.show')"
                    class="mr-4 ml-4"
                    color="gray"
                    icon
                    size="large"
                    variant="outlined"
                    @click="showPassword = !showPassword"
                  >
                    <v-icon :icon="showPassword ? '$eye' : '$eyeclosed'" />
                  </AppButton>

                  <AppButton
                    color="gray"
                    size="large"
                    variant="outlined"
                    @click.prevent="form.admin_password = generateStandardFormPassword()"
                  >
                    <span>{{ t('button.password.generate') }}</span>
                  </AppButton>
                </div>
              </div>
            </v-form>
          </v-window-item>
        </v-window>
      </v-card-text>

      <OnboardingStepFooter
        :back-disabled="loading"
        :back-label="t('button.back')"
        :loading="loading"
        :max-steps="3"
        :next-arrow="!retry"
        :next-label="retry ? t('button.installation.retry') : t('button.continue')"
        :step="1"
        @back="closeModal"
        @next="retry ? submitRetryForm() : submitForm()"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The Basic and Advanced tabs, and the
  // retry with the form (Try again of a standard or advanced install). The pure rules live in ../standard-form and ./choose-domain.
  import type { OnboardingService } from '@/views/onboarding/onboarding-service'
  import type { CloneInstance, WordpressTemplate, WordpressVersionOption } from '@/views/onboarding/onboarding.api'
  import type { LoaderField, StandardFormPrefill, StandardFormValues } from '@/views/onboarding/standard-form'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, reactive, ref, toRef, watch } from 'vue'
  import { getCloneInstances, getWordpressTemplates, getWordpressVersions } from '@/views/onboarding/onboarding.api'
  import {
    asksForWordpressVersion,
    createStandardForm,
    DOMAIN_PROTOCOLS,
    forcesTemplate,
    generateStandardFormPassword,
    hasAdvancedFields,
    installTypeForTab,
    prefilledLoaderFields,
    selectInstallType,
    setLoaderDefault,
    STANDARD_LANGUAGES,
    standardFieldsOf,
  } from '@/views/onboarding/standard-form'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { useServiceDomains } from '@/views/onboarding/use-service-domains'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'
  import {
    composeFreeDomainName,
    domainNameOf,
    isBlacklistedDomain,
    typedDomainName,
  } from './choose-domain'
  import OnboardingStandardFormSubdirectory from './OnboardingStandardFormSubdirectory.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    service: OnboardingService | null
    /** The flow's `submitting`: the Continue button runs its request behind the spinner. */
    loading?: boolean
    /** The form is a Try again, so its button sends the retry request instead of the install. */
    retry?: boolean
    /** The instance a Try again retries. */
    retryInstanceId?: number | string | null
    /** The values a Try again opens the form with (`install_details`); the loaders leave the fields they set. */
    prefill?: StandardFormPrefill | null
  }>(), {
    loading: false,
    retry: false,
    retryInstanceId: null,
    prefill: null,
  })

  const emit = defineEmits<{
    'remove-modal': []
    'install-instance': [form: StandardFormValues]
    'retry-install-instance': [instanceId: number | string | null, form: Record<string, unknown>]
  }>()

  const { t } = useTranslation()
  const formRules = useFormRules()
  const session = useSessionStore()

  // The admin email is the account's, the password a fresh one.
  const form = reactive<StandardFormValues>(createStandardForm(session.user?.email ?? '', generateStandardFormPassword()))

  type FormHandle = { validate: () => Promise<{ valid: boolean }> }
  const formRef = ref<FormHandle | null>(null)
  const advancedFormRef = ref<FormHandle | null>(null)
  const showPassword = ref(false)
  const tabs = ref(0)
  /**
    * The loader fields the current Try again prefill set. A loader answers after the prefill, so it leaves these fields alone.
    * Set on open, cleared on close.
   */
  let prefilledLoaders: LoaderField[] = []
  /** 0 clean, 1 clone, 2 template. */
  const installTab = ref(0)
  const showDomainMenu = ref(false)
  const domainSearch = ref('')
  /** 0 = the domain panel, 1 = the subdomain panel. */
  const domainPanelOpen = ref<number | undefined>(0)
  const freeDomainName = ref('')
  const freeDomainAffix = ref('')
  const subdirectoryOpen = ref(false)

  const { domains, loading: domainsLoading, reload, clear, search } = useServiceDomains(toRef(props, 'service'))
  // Select lists: loaded on every open (the calls are cached); an empty answer disables its tab.
  const versionOptions = ref<WordpressVersionOption[]>([])
  const instances = ref<CloneInstance[]>([])
  const templates = ref<WordpressTemplate[]>([])
  const noVersions = ref(false)
  const noInstances = ref(false)
  const noTemplates = ref(false)
  const loadingVersions = ref(false)
  const loadingInstances = ref(false)
  const loadingTemplates = ref(false)

  const standardFields = computed<Record<string, unknown>>(() => standardFieldsOf(props.service) ?? {})
  const hasAdvanced = computed(() => hasAdvancedFields(standardFieldsOf(props.service)))
  /** The 37 languages, labelled by `languages.<code>`. */
  const languageItems = computed(() => STANDARD_LANGUAGES.map(code => ({ title: t(`languages.${code}`), value: code })))
  const forceTemplate = computed(() => forcesTemplate(props.service))
  const asksVersion = computed(() => asksForWordpressVersion(props.service))
  const subdomainBases = computed<string[]>(() => {
    const bases = props.service?.onboarding?.subdomain_bases
    return Array.isArray(bases) ? bases.filter((base): base is string => typeof base === 'string' && base !== '') : []
  })
  const hasSubdomainBases = computed(() => subdomainBases.value.length > 0)
  const isFreeSubdomainMode = computed(() => hasSubdomainBases.value && domainPanelOpen.value === 1)
  const composedFreeDomainName = computed(() => composeFreeDomainName(freeDomainName.value, freeDomainAffix.value))
  const domainItems = computed(() => (showDomainMenu.value ? domains.value : []))

  /** The domain rules and the service blacklist, applied to the name of the value. */
  const domainRules = computed(() => {
    const blacklist = props.service?.onboarding?.domains_blacklist ?? []
    return [
      ...formRules.domainRules.map(rule => (value: unknown) => rule(domainNameOf(value))),
      (value: unknown) => (isBlacklistedDomain(domainNameOf(value), blacklist) ? t('form.validation.domain.blacklisted') : true),
    ]
  })

  function initFreeSubdomainDefaults (): void {
    freeDomainAffix.value = subdomainBases.value[0] ?? ''
    freeDomainName.value = ''
  }

  function alertFailure (error: unknown): void {
    useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
  }

  /** The first version is the default; an empty list disables the clean tab. */
  async function loadVersions (): Promise<void> {
    loadingVersions.value = true
    try {
      const options = await getWordpressVersions()
      noVersions.value = options.length === 0
      versionOptions.value = options
      const [first] = options
      if (first) {
        setLoaderDefault(form, 'version', first.value, prefilledLoaders)
      }
    } catch (error) {
      alertFailure(error)
    } finally {
      loadingVersions.value = false
    }
  }

  /** The first instance is the clone source. */
  async function loadInstances (): Promise<void> {
    loadingInstances.value = true
    try {
      const list = await getCloneInstances()
      noInstances.value = list.length === 0
      instances.value = list
      const [first] = list
      if (first) {
        setLoaderDefault(form, 'clone_instance_id', first.id, prefilledLoaders)
      }
    } catch (error) {
      alertFailure(error)
    } finally {
      loadingInstances.value = false
    }
  }

  /** The first template is the default. */
  async function loadTemplates (): Promise<void> {
    loadingTemplates.value = true
    try {
      const list = await getWordpressTemplates()
      noTemplates.value = list.length === 0
      templates.value = list
      const [first] = list
      if (first) {
        setLoaderDefault(form, 'instance_template_id', first.id, prefilledLoaders)
      }
    } catch (error) {
      alertFailure(error)
    } finally {
      loadingTemplates.value = false
    }
  }

  /** The picked or typed value becomes the domain name, and the search shows that name. */
  function onDomainPicked (value: unknown): void {
    const name = domainNameOf(value)
    form.domain = name
    domainSearch.value = name
    showDomainMenu.value = false
  }

  /** The field loses focus, the typed text becomes the domain, the subdomain panel composes its name. */
  async function prepareDomainField (): Promise<void> {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    await nextTick()
    if (isFreeSubdomainMode.value) {
      form.domain = composedFreeDomainName.value
      await nextTick()
      return
    }
    const name = typedDomainName(domainSearch.value, form.domain)
    form.domain = name
    domainSearch.value = name
    await nextTick()
  }

  /** Validates the Basic and the Advanced forms, the ones rendered so far. */
  async function formsValid (): Promise<boolean> {
    const results = await Promise.all([formRef.value?.validate(), advancedFormRef.value?.validate()])
    return results.every(result => !result || result.valid)
  }

  /** True while Continue runs its checks: a second click before the emit sends no second install (legacy has no such guard). */
  let submitPending = false

  /** The fields are checked, then the flow creates the site on the typed domain. */
  async function submitForm (): Promise<void> {
    if (props.loading || submitPending) {
      return
    }
    submitPending = true
    try {
      await prepareDomainField()
      if (!await formsValid()) {
        return
      }
      emit('install-instance', { ...form })
    } finally {
      submitPending = false
    }
  }

  /**
    * The same checks, then the instance's retry goes out with the form's values. The install method is the
    * instance's own, as legacy sends it (the new-install form never sends `standard`).
   */
  async function submitRetryForm (): Promise<void> {
    if (props.loading) {
      return
    }
    await prepareDomainField()
    if (!await formsValid()) {
      return
    }
    emit('retry-install-instance', props.retryInstanceId, {
      ...form,
      install_method: props.prefill?.installMethod ?? form.install_method,
    })
  }

  /**
    * The instance's values fill the form, and its install type picks
   * the tab. The loaders that run after this leave the fields it set (`prefilledLoaders`).
   */
  function applyPrefill (): void {
    const prefill = props.prefill
    if (!prefill) {
      return
    }
    Object.assign(form, prefill.values)
    prefilledLoaders = prefilledLoaderFields(prefill.values)
    if (prefill.tab !== null) {
      installTab.value = prefill.tab
    }
    if (prefill.subdirectoryOpen) {
      subdirectoryOpen.value = true
    }
  }

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  // Opening loads the lists and the domain picker; closing resets the panels and the domain list.
  watch(() => props.modelValue, open => {
    if (open) {
      // The prefill goes in before the loaders start, so their answers see which fields it holds.
      prefilledLoaders = []
      applyPrefill()
      void loadVersions()
      void loadInstances()
      void loadTemplates()
      domainPanelOpen.value = 0
      initFreeSubdomainDefaults()
      reload()
    } else {
      prefilledLoaders = []
      domainPanelOpen.value = 0
      initFreeSubdomainDefaults()
      clear()
    }
  })

  // The affix is one of the bases, the first one when the current one is gone.
  watch(subdomainBases, bases => {
    if (!freeDomainAffix.value || !bases.includes(freeDomainAffix.value)) {
      freeDomainAffix.value = bases[0] ?? ''
    }
  }, { immediate: true })

  // The tab sets the install type, and a clone takes the first instance when none is chosen.
  watch(installTab, tab => {
    selectInstallType(form, installTypeForTab(tab), instances.value)
  })

  // A typed name searches the service's domains (the composable debounces it).
  watch(domainSearch, term => {
    if (props.modelValue && !isFreeSubdomainMode.value) {
      search(term)
    }
  })
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

.onboarding-protocol-select {
  max-width: 112px;

  // V2 shows the whole `https://` in the 112px select; the V4 selection text is cut with an ellipsis after 5 characters.
  :deep(.v-select__selection-text) {
    overflow: visible;
    text-overflow: clip;
  }
}

  :deep(.v-window) {
    overflow: visible;
  }

  :deep(.v-tabs .v-tab) {
    font-size: v.$font-size-base;
    line-height: v.$line-height-base;
  }

  :deep(.v-card-text) {
    -webkit-line-clamp: unset !important;
  }

  // The legacy `.v-text-field--outlined.v-input.v-text-field { margin-bottom: 16px }` rule replaces the old `mb-4` wrapper margin.
  .form-box :deep(.v-text-field.v-input--md) {
    margin-bottom: 16px;
  }

  // The basic form sits in a bordered box.
  .form-box {
    border: 1px solid var(--v-gray-lighten2);
    border-radius: 8px;
    padding: 16px 24px;
    grid-gap: 16px 12px;
  }

  .onboarding-domain-panels {
    .v-expansion-panel {
      border: 1px solid var(--v-gray-lighten2);
      background-color: unset !important;
    }
  }

  .free-domain-affix {
    max-width: 50%;
  }

  .input-group {
    align-items: center;
    flex-wrap: nowrap;
  }

  // A disabled tab does not pass pointer events, so its tooltip needs the label to take them.
  .tab-activator {
    pointer-events: auto;
  }
</style>
