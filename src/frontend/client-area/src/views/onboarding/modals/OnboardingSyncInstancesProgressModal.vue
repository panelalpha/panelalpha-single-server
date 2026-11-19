<template>
  <OnboardingDialog
    close-on-back
    data-testid="onboarding-sync-progress-modal"
    fullscreen
    :model-value="modelValue"
  >
    <ProgressScreen>
      <ProgressCard
        bar-tone="brand"
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
            {{ t('heading.onboarding.syncInstances.title.completed') }}
          </span>

          <span
            v-else-if="completed && error"
            class="text-center text-error"
          >
            {{ t('heading.onboarding.syncInstances.title.failed') }}
          </span>

          <span
            v-if="!completed"
            class="text-center"
          >
            {{ t('heading.onboarding.syncInstances.subtitle.inProgress') }}
          </span>

          <span
            v-else-if="!error"
            class="text-center"
          >
            {{ t('heading.onboarding.syncInstances.subtitle.completed') }}
          </span>

          <span
            v-else
            class="text-center"
          >
            {{ t('heading.onboarding.syncInstances.subtitle.failed') }}
          </span>
        </template>

        <img
          v-if="!completed"
          alt=""
          :src="partialLogoUrl"
        >

        <img
          v-if="completed && !error"
          alt=""
          :src="checkUrl"
        >

        <img
          v-if="completed && error"
          alt=""
          :src="failedUrl"
        >

        <template #media>
          <v-img
            v-show="!error || completed"
            height="315px"
            position="center top"
            width="100vw"
          />
        </template>

        <template #actions>
          <p
            v-if="!error"
            class="p-1 pt-8 mb-0 text-center heading--text"
          >
            {{ infoText }}
          </p>

          <div
            class="d-flex pt-8"
            :class="mdAndDown ? 'flex-column' : ''"
          >
            <!-- Legacy "Try Again" emits `tryAgain`, which the wrapper never bound: the button stays dead, as in legacy. -->
            <AppButton
              v-if="error"
              class="btn-xx-large"
              :class="mdAndDown ? 'ml-0 mt-4' : ''"
              color="gray"
              elevation="0"
              size="x-large"
              variant="outlined"
              width="210px"
              @click="emit('try-again')"
            >
              <span class="heading--text">{{ t('button.try') }}</span>
            </AppButton>

            <AppButton
              v-if="completed && error"
              class="btn-xx-large mb-10"
              :class="mdAndDown ? 'ml-0 mt-4' : 'ml-6'"
              kind="primary"
              size="x-large"
              width="210px"
              @click="emit('go-to-dashboard')"
            >
              {{ t('button.dashboard.back') }}
            </AppButton>

            <AppButton
              v-else
              class="btn-xx-large mb-10"
              :class="mdAndDown ? 'ml-0 mt-4' : 'ml-6'"
              :disabled="!completed && !error"
              kind="primary"
              size="x-large"
              width="210px"
              @click="emit('go-to-dashboard')"
            >
              {{ t('button.getStarted') }}
            </AppButton>
          </div>
        </template>
      </ProgressCard>
    </ProgressScreen>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The sync progress of a `control-panel-upgrade`
  // login, in-progress, completed and failed. It has no DNS box and no screenshot: the sync is not one site.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import checkUrl from '@/views/onboarding/assets/Check.svg'
  import failedUrl from '@/views/onboarding/assets/Failed.svg'
  import partialLogoUrl from '@/views/onboarding/assets/LogoPartialWhite.svg'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import ProgressScreen from '@/views/onboarding/ui/ProgressScreen.vue'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import BrandLogo from '@/shared/ui/logo/BrandLogo.vue'
  import ProgressCard from '@/shared/ui/progress-card/ProgressCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    completed?: boolean
    error?: boolean
  }>(), {
    completed: false,
    error: false,
  })

  const emit = defineEmits<{
    /** The "Get started" and "Dashboard" buttons. */
    'go-to-dashboard': []
    'try-again': []
  }>()

  const { t } = useTranslation()
  const { mdAndDown } = useDisplay()
  const themeStore = useThemeStore()

  /** Bar status of the progress card (kit `ProgressCard`): working until the sync completes, then success or failed. */
  const progressStatus = computed<'in-progress' | 'success' | 'failed'>(() => {
    if (!props.completed) {
      return 'in-progress'
    }
    return props.error ? 'failed' : 'success'
  })

  const infoText = computed(() => {
    return props.completed
      ? t('heading.onboarding.syncInstances.info.completed')
      : t('heading.onboarding.syncInstances.info.inProgress')
  })

</script>
