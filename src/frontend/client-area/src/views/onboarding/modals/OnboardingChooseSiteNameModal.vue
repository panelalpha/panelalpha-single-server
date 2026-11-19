<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-site-name-modal"
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
        <h6>{{ t('heading.onboarding.chooseProduct.website.title') }}</h6>

        <p class="p-3 mt-2">
          {{ t('heading.onboarding.chooseProduct.website.subtitle') }}
        </p>

        <v-form @submit.prevent="submitSiteName">
          <validated-text-field
            v-model="siteName"
            class="v-input--lg"
            hide-details
            :placeholder="t('form.placeholder.website')"
            :rules="siteNameRules"
            validate-on="blur"
            variant="outlined"
            @keydown.enter.prevent="submitSiteName"
          />
        </v-form>
      </v-card-text>

      <v-card-actions class="d-flex flex-column pb-4 px-10 pt-2">
        <AppButton
          block
          kind="primary"
          :loading="loading"
          size="x-large"
          @click="emit('site-name-selected', siteName)"
        >
          <span>{{ t('button.website.create') }}</span>

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
          @click="changeService"
        >
          <span class="p-1 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.service.change') + ' ' }}
          </span>
        </AppButton>

        <AppButton
          v-else-if="!service?.plan_default_theme"
          block
          class="mx-0 mt-2"
          :disabled="loading"
          kind="cancel"
          size="x-large"
          @click="changeTheme"
        >
          <span class="p-2 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.theme.change') + ' ' }}
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
          <span class="p-2 font-weight-light text--gray-darken1">
            {{ ' ' + t('button.maybeLater') + ' ' }}
          </span>
        </AppButton>
      </v-card-actions>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { OnboardingService } from '@/views/onboarding/onboarding-service'
  // The primary button sends the name without validating it:
  // the rules only mark the field on blur, as in legacy. Enter is ignored while the flow runs.
  import type { OnboardingTheme } from '@/views/onboarding/onboarding.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    /** The flow's `submitting`: the create request (or the install) that runs after this step. */
    loading?: boolean
    services: OnboardingService[]
    service: OnboardingService | null
    theme: OnboardingTheme | null
  }>(), {
    loading: false,
  })

  const emit = defineEmits<{
    'remove-modal': []
    'change-service-button-clicked': []
    'change-theme-button-clicked': []
    'site-name-selected': [siteName: string]
  }>()

  const { t } = useTranslation()

  const siteName = ref('')

  /** Required, and at most 25 characters. */
  const siteNameRules = computed(() => [
    (value: string) => !!value || t('form.validation.required', { field: t('form.label.siteName') }),
    (value: string) => (!!value && value.length <= 25) || t('form.validation.maxLength', { field: t('form.label.siteName'), length: 25 }),
  ])

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  function changeService (): void {
    if (!props.loading) {
      emit('change-service-button-clicked')
    }
  }

  function changeTheme (): void {
    if (!props.loading) {
      emit('change-theme-button-clicked')
    }
  }

  function submitSiteName (): void {
    if (!props.loading) {
      emit('site-name-selected', siteName.value)
    }
  }
</script>

<style lang="scss" scoped>
  // The `lg` field slot is rounded 8px (V2 vendor 4px).
  :deep(.v-input--lg .v-field) {
    border-radius: 8px;
  }
</style>
