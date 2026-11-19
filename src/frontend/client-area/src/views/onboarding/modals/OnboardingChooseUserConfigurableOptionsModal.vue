<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-user-options-modal"
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
        <template v-if="optionName">
          <h6>{{ t(`heading.onboarding.newInstance.${optionName}.subtitle`) }}</h6>

          <p class="p-3 mt-2">
            {{ t(`heading.onboarding.newInstance.${optionName}.info`) }}
          </p>
        </template>

        <div
          v-for="field in built.fields"
          :key="field.name"
        >
          <label class="base--text p-3 mb-2">{{ field.label }}</label>

          <v-select
            v-if="field.type === 'select'"
            v-model="selected[field.name]"
            class="options-select mb-4 mt-2"
            density="compact"
            hide-details
            item-title="label"
            item-value="value"
            :items="field.options"
            :readonly="loading"
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

          <v-text-field
            v-else
            v-model="selected[field.name]"
            class="v-input--lg mb-4 mt-2"
            hide-details
            :placeholder="t('form.placeholder.domain')"
            variant="outlined"
          />
        </div>
      </v-card-text>

      <template v-if="isImport">
        <OnboardingStepFooter
          :back-disabled="loading"
          :back-label="t('button.back')"
          :max-steps="maxSteps"
          :next-disabled="loading"
          :next-label="t('button.continue')"
          :step="maxSteps === 6 ? 4 : 3"
          @back="closeModal"
          @next="selectOptions"
        />
      </template>

      <template v-else>
        <v-card-actions class="d-flex flex-column pb-4 px-10 pt-2">
          <AppButton
            block
            kind="primary"
            :loading="loading"
            size="x-large"
            @click="selectOptions"
          >
            <template #loader>
              <v-progress-circular
                class="mr-2"
                indeterminate
                size="20"
                width="2"
              />

              <span>{{ loadingText ? t(loadingText) : t('button.domain.creating') }}</span>
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
            :disabled="loading"
            kind="cancel"
            size="x-large"
            @click="onSecondaryClick"
          >
            <span class="p-1 font-weight-light text--gray-darken1">
              {{ ' ' + t(secondaryLabelKey) + ' ' }}
            </span>
          </AppButton>
        </v-card-actions>
      </template>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The app and app-lite versions differ only in
  // the option values: LITE treats an array of values as "no values" (`normalizedOptionValues`), which is what this port does.
  import type { InstallationTypeKey, OnboardingService } from '@/views/onboarding/onboarding-service'
  import type { OnboardingTheme } from '@/views/onboarding/onboarding.api'
  import type { ServiceInstanceOptions } from '@/entities/project/instance-actions.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { canChooseTheme, userOptionsActionLabelKey } from '@/views/onboarding/onboarding-steps'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { buildUserConfigurableFields } from '@/entities/project/instance-row-actions'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    service: OnboardingService | null
    services: OnboardingService[]
    theme?: OnboardingTheme | null
    /** The values of the service's options (`GET /services/{id}/instance-options`), empty until they load. */
    optionValues?: ServiceInstanceOptions | null
    /** Only read for the change-theme button of the import flow. */
    installationType?: InstallationTypeKey
    loading?: boolean
    loadingText?: string | null
    isImport?: boolean
    maxSteps?: number
  }>(), {
    theme: null,
    optionValues: null,
    installationType: 'wordpress',
    loading: false,
    loadingText: null,
    isImport: false,
    maxSteps: 0,
  })

  const emit = defineEmits<{
    'user-configurable-options-selected': [values: Record<string, unknown>]
    'change-service-button-clicked': []
    'change-theme-button-clicked': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()

  /** Anything that is not an object of values counts as none. */
  const normalizedOptionValues = computed<ServiceInstanceOptions>(() => {
    const values = props.optionValues as unknown
    if (!values || Array.isArray(values) || typeof values !== 'object') {
      return {}
    }
    return props.optionValues as ServiceInstanceOptions
  })

  /** The account config of the service: its values win over the first option value. */
  const accountConfig = computed<Record<string, unknown>>(() => {
    const config = props.service?.onboarding?.account_config
    return config && typeof config === 'object' ? config as Record<string, unknown> : {}
  })

  const built = computed(() => buildUserConfigurableFields(
    props.service?.onboarding?.user_configurable_options ?? [],
    normalizedOptionValues.value,
    (key, options) => t(key, options),
    accountConfig.value,
  ))

  /** The heading copy names the first option. */
  const optionName = computed(() => props.service?.onboarding?.user_configurable_options?.[0]?.name ?? null)

  const selected = ref<Record<string, unknown>>({})

  // Each open starts from the account config or the first value of every option.
  watch(() => props.modelValue, open => {
    if (open) {
      selected.value = { ...built.value.values }
    }
  }, { immediate: true })

  const actionKey = computed(() => userOptionsActionLabelKey(props.service ?? undefined))

  /** Footer: change service when there are several, else change theme when the service has themes, else cancel. */
  const secondaryAction = computed<'change-service' | 'change-theme' | 'cancel'>(() => {
    if (props.services.length > 1) {
      return 'change-service'
    }
    if (canChooseTheme(props.service ?? undefined)) {
      return 'change-theme'
    }
    return 'cancel'
  })

  const secondaryLabelKey = computed(() => {
    switch (secondaryAction.value) {
      case 'change-service': { return 'button.service.change'
      }
      case 'change-theme': { return 'button.theme.change'
      }
      default: { return 'button.cancel'
      }
    }
  })

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  function onSecondaryClick (): void {
    if (props.loading) {
      return
    }
    switch (secondaryAction.value) {
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

  function selectOptions (): void {
    emit('user-configurable-options-selected', { ...selected.value })
  }
</script>

<style lang="scss" scoped>
  .onboarding-modal {
    // Legacy `dense outlined` V2 select: a 50px box (V4 compact: 48px).
    .options-select :deep(.v-field) {
      min-height: 50px;
    }
  }
</style>
