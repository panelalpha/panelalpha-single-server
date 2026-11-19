<template>
  <OnboardingDialog
    data-testid="onboarding-import-url-modal"
    :model-value="isOpen"
  >
    <OnboardingCard
      v-if="isOpen"
      @close="emit('remove-modal')"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-start">
          <div class="d-flex flex-column">
            <span class="font-weight-light p-1">
              {{ t('heading.onboarding.import.url.title') }}
            </span>

            <h4>{{ t('heading.onboarding.import.url.subtitle') }}</h4>
          </div>
        </div>

        <v-divider class="mb-5" />

        <p class="p-2 text-gray-darken-2 mb-5 font-weight-light">
          {{ t('heading.onboarding.import.url.info') }}
        </p>

        <div class="form-box">
          <div>
            <span
              class="text-gray-darken-1 mb-1"
              :class="verification.state === 'error_message' ? 'text-error' : ''"
            >
              {{ t('heading.onboarding.import.url.label') }}
            </span>

            <v-text-field
              autofocus
              class="mt-2 v-input--md import-url-field"
              density="compact"
              :error="verification.state === 'error_message'"
              :model-value="url"
              placeholder="https://"
              variant="outlined"
              @keydown.enter.prevent="submitUrl"
              @update:model-value="onUrlInput"
            >
              <!-- Legacy `append` slot sits outside the field and is empty while idle; V4 `append-inner` always reserves its width. -->
              <template
                v-if="verification.state === 'loading'"
                #append-inner
              >
                <Loader
                  color="primary"
                  :no-margins="true"
                  :size="20"
                />
              </template>
            </v-text-field>
          </div>

          <!-- Legacy advanced section: the optional server ip, for a domain that does not resolve yet. -->
          <div
            class="advanced-toggle-row mt-4 cursor-pointer"
            @click="advancedOpen = !advancedOpen"
          >
            <span class="font-weight-medium text-gray-darken-1">
              {{ t('heading.instance.tab.advanced') }}
            </span>

            <v-icon
              class="ml-1 text-gray-darken-1 advanced-chevron"
              :class="{ 'advanced-chevron--active': advancedOpen }"
              icon="$chevrondown"
              size="16"
            />
          </div>

          <v-expand-transition>
            <div
              v-if="advancedOpen"
              class="mt-4"
            >
              <span class="text-gray-darken-1 mb-1 d-block">
                {{ t('form.label.ipAddress') }}
              </span>

              <validated-text-field
                v-model="ipAddress"
                class="mt-2 v-input--md"
                density="compact"
                hide-details="auto"
                placeholder="203.0.113.10"
                :rules="ipAddressRules"
                validate-on="blur"
                variant="outlined"
                @keydown.enter.prevent="submitUrl"
              />

              <div class="caption text-gray-darken-1 pb-1 mt-1">
                {{ t('heading.onboarding.import.url.ipAddress.info') }}
              </div>
            </div>
          </v-expand-transition>
        </div>

        <v-scale-transition>
          <AppMessage
            v-if="verification.state === 'error_message'"
            class="mt-5"
            icon="$alertcircle"
            variant="error"
          >
            <b>
              <i18next :translation="t('message.alert.failed')">
                <template #message>
                  <span class="font-weight-medium">{{ verification.message }}</span>
                </template>
              </i18next>
            </b>
          </AppMessage>

          <AppMessage
            v-else-if="verification.state === 'not-detected'"
            class="mt-5"
            icon="$alertcircle"
            variant="warning"
          >
            <b>
              <i18next :translation="t('message.alert.warning')">
                <template #message>
                  <span class="font-weight-medium">{{ t('notification.wordpress.notDetected') }}</span>
                </template>
              </i18next>
            </b>
          </AppMessage>
        </v-scale-transition>
      </v-card-text>

      <OnboardingStepFooter
        :back-label="t('button.cancel')"
        :loading="loading"
        :max-steps="maxSteps"
        :next-disabled="!canContinue"
        :next-label="verification.state === 'not-detected' ? t('button.continueAnyway') : t('button.continue')"
        :step="2"
        @back="emit('remove-modal')"
        @next="submitUrl"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The check of the url is debounced
  // (500 ms), and a response that a newer check has overtaken is dropped. The rules and the request shapes are in `import-url.ts`.
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import {
    IMPORT_URL_DEBOUNCE_MS,
    type ImportUrlSelection,
    isContinueAllowed,
    isCurrentResponse,
    isIpAddressValid,
    isValidIpv4,
    normalizeImportUrl,
    optionalIpAddress,
    type UrlVerification,
    verificationFromError,
    verificationFromTest,
  } from '@/views/onboarding/import-url'
  import { getWordpressUrlTest } from '@/views/onboarding/onboarding.api'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { getErrorMessage } from '@/shared/api/error-message'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    /** The step count of the import flow. */
    maxSteps?: number
    /** The flow's `submitting`: the continue button shows its spinner. */
    loading?: boolean
  }>(), {
    maxSteps: 0,
    loading: false,
  })

  const emit = defineEmits<{
    'remove-modal': []
    'url-selected': [selection: ImportUrlSelection]
  }>()

  const { t } = useTranslation()

  const url = ref('')
  const ipAddress = ref('')
  const advancedOpen = ref(false)
  const verification = ref<UrlVerification>({ state: 'empty', message: null })

  // The sequence and the debounce timer are not reactive: only the verification state is shown.
  let sequence = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const canContinue = computed(() => isContinueAllowed(verification.value.state) && isIpAddressValid(ipAddress.value))

  /** An empty ip passes, a filled one must be a valid IPv4. */
  const ipAddressRules = [
    (value: string) => !value || isValidIpv4(value) || t('Invalid IP address'),
  ]

  /** Drops the pending debounce and marks every request in flight as stale. */
  function cancelPending (): void {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
    sequence++
  }

  /** The field changed, so the previous answer is no longer shown and the check waits for the pause. */
  function handleInput (value: string): void {
    url.value = value
    cancelPending()
    if (value === '') {
      verification.value = { state: 'empty', message: null }
      return
    }
    verification.value = { state: 'loading', message: null }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void verifyUrl()
    }, IMPORT_URL_DEBOUNCE_MS)
  }

  function onUrlInput (value: string | null): void {
    handleInput(value ?? '')
  }

  /** The scheme is added to the field, then the check runs; only the latest check may answer. */
  async function verifyUrl (): Promise<void> {
    const current = ++sequence
    url.value = normalizeImportUrl(url.value)
    verification.value = { state: 'loading', message: null }
    try {
      const result = await getWordpressUrlTest(url.value, optionalIpAddress(ipAddress.value))
      if (!isCurrentResponse(current, sequence)) {
        return
      }
      verification.value = verificationFromTest(result)
    } catch (error) {
      if (!isCurrentResponse(current, sequence)) {
        return
      }
      verification.value = verificationFromError(getErrorMessage(error))
    }
  }

  /** A blocked continue does nothing, nor does Enter while the flow loads; the ip is sent only when it is valid and filled. */
  function submitUrl (): void {
    if (props.loading || !canContinue.value) {
      return
    }
    const ip = optionalIpAddress(ipAddress.value)
    emit('url-selected', { url: url.value, ...(ip ? { ip } : {}) })
  }

  // Every open and close resets the form.
  watch(() => props.isOpen, () => {
    cancelPending()
    url.value = ''
    ipAddress.value = ''
    advancedOpen.value = false
    verification.value = { state: 'empty', message: null }
  })

  // The check runs again with the new ip, once the url has text.
  watch(ipAddress, () => {
    if (url.value !== '') {
      handleInput(url.value)
    }
  })

  onBeforeUnmount(() => {
    cancelPending()
  })
</script>

<style lang="scss" scoped>
  .form-box {
    border: 1px solid rgb(var(--v-theme-on-surface), 0.12);
    border-radius: 8px;
    padding: 16px;
  }

  .advanced-toggle-row {
    display: flex;
    align-items: center;
  }

  .advanced-chevron {
    transition: color 0.24s ease, transform 0.24s ease;
  }

  .advanced-chevron--active {
    color: rgb(var(--v-theme-primary)) !important;
    transform: rotate(180deg);
  }

  // Legacy dense field with its details row (`hide-details` is not set): the V2 slot keeps a 4px bottom margin and a 20px details row
  // (`import-url-field` margin-bottom 4px, modal 475px); V4 draws a 22px row below a 0px field margin.
  .import-url-field {
    :deep(.v-field) {
      margin-bottom: 4px;
    }

    // The global `_inputs.scss` pulls the details row up by 10px and down by 12px (`margin-top/bottom`); the legacy row is 2px shorter than that.
    :deep(.v-input__details) {
      margin-bottom: -14px;
    }
  }
</style>
