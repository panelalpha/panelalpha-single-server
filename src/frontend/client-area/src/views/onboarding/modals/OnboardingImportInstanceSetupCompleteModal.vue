<template>
  <OnboardingDialog
    close-on-back
    data-testid="onboarding-import-setup-complete-modal"
    fullscreen
    :model-value="isOpen"
  >
    <ProgressScreen>
      <ProgressCard
        bar-tone="brand"
        bare
        generic-title
        :show-image="!completed || error"
        :status="progressStatus"
      >
        <template #logo>
          <BrandLogo
            compact
            :dark-logo="themeStore.darkLogo"
            :logo="themeStore.lightLogo"
          />
        </template>

        <template #title>
          <span
            v-if="completed && !error"
            class="text-center text-primary"
          >
            {{ t('heading.onboarding.import.success.title') }}
          </span>

          <span
            v-else-if="completed && error"
            class="text-center text-error"
          >
            {{ t('heading.onboarding.import.failed.title') }}
          </span>

          <span
            v-if="!completed"
            class="text-center"
          >
            {{ t('heading.onboarding.import.inProgress.subtitle') }}
          </span>

          <span
            v-else-if="!error"
            class="text-center"
          >
            {{ t('heading.onboarding.import.success.subtitle') }}
          </span>

          <span
            v-else
            class="text-center"
          >
            {{ t('heading.onboarding.import.failed.subtitle') }}
          </span>
        </template>

        <img
          v-if="!completed"
          alt=""
          :src="partialLogoUrl"
        >

        <img
          v-if="completed && error"
          alt=""
          :src="failedUrl"
        >

        <template #actions>
          <div class="text-center">
            <p
              v-if="completed && !error"
              class="p-1 heading--text my-8"
            >
              {{ t('heading.onboarding.import.success.info.general') }}
            </p>

            <p
              v-else-if="!completed"
              class="p-1 pt-8 mb-0 text-center heading--text"
            >
              {{ t('heading.onboarding.import.inProgress.info.general') }}
            </p>

            <p
              v-else
              class="p-1 pt-8 mb-0 text-center heading--text"
            >
              {{ t('heading.onboarding.import.failed.info.general') }}
            </p>
          </div>

          <div
            v-if="completed && !error"
            class="success-box mb-5"
          >
            <i18next :translation="t('heading.onboarding.import.success.info.domain')">
              <template #domain>
                <br>

                <a
                  class="h5 font-weight-600"
                  :href="domainUrl"
                  rel="noopener"
                  target="_blank"
                >
                  {{ domainUrl }}
                </a>
              </template>
            </i18next>
          </div>

          <div
            v-if="completed"
            class="d-flex justify-center my-8"
          >
            <!-- Legacy "Return To Dashboard" is the only exit, and it shows once the import answered (success or failure). -->
            <AppButton
              kind="primary"
              size="x-large"
              @click="emit('next')"
            >
              <span class="font-weight-600">{{ t('button.returnToDashboard') }}</span>
            </AppButton>
          </div>
        </template>
      </ProgressCard>
    </ProgressScreen>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The import result, in-progress,
  // success (the domain link) and failure. The failure has no retry. `nameservers` comes from the wrapper and is not rendered,
  // as in legacy; the legacy copy-to-clipboard helper is not ported (it had no caller).
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import failedUrl from '@/views/onboarding/assets/Failed.svg'
  import partialLogoUrl from '@/views/onboarding/assets/LogoPartialWhite.svg'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import ProgressScreen from '@/views/onboarding/ui/ProgressScreen.vue'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import BrandLogo from '@/shared/ui/logo/BrandLogo.vue'
  import ProgressCard from '@/shared/ui/progress-card/ProgressCard.vue'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    completed?: boolean
    error?: boolean
    /** The import's result, its `url` is the domain link of the success state. */
    importedInstance?: Record<string, unknown> | null
    /** Passed, never rendered (legacy does not render them either). */
    nameservers?: string[]
  }>(), {
    completed: false,
    error: false,
    importedInstance: null,
    nameservers: () => [],
  })

  const emit = defineEmits<{
    /** The "Return To Dashboard" button, which the wrapper turns into the instances list reload. */
    next: []
  }>()

  const { t } = useTranslation()
  const themeStore = useThemeStore()

  const domainUrl = computed<string | undefined>(() => {
    const url = props.importedInstance?.url
    return typeof url === 'string' ? url : undefined
  })

  /** Bar status of the progress card (kit `ProgressCard`): in-progress until the import answers, then success or failed. */
  const progressStatus = computed<'in-progress' | 'success' | 'failed'>(() => {
    if (!props.completed) {
      return 'in-progress'
    }
    return props.error ? 'failed' : 'success'
  })

</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  // Paragraph size and the 60px x-large button.
  .p-1 {
    font-size: v.$font-size-xlg;
    line-height: v.$line-height-xlg;
    font-weight: v.$font-weight-extra-light;
  }

  .v-btn.v-btn--size-x-large {
    height: 60px;
    padding: 16px;
  }
</style>
