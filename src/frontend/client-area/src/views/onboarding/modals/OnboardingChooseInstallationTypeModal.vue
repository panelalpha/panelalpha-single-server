<template>
  <OnboardingDialog
    data-testid="onboarding-installation-type-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      @close="emit('remove-modal')"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-center">
          <h4
            id="onboarding-installation-type-title"
            class="font-weight-light"
          >
            {{ t('heading.onboarding.instanceSource.title') }}
          </h4>
        </div>

        <ChoiceCardGrid
          aria-labelledby="onboarding-installation-type-title"
          column
        >
          <CheckboxBig
            v-if="available.includes('wordpress')"
            :checked="selected === 'wordpress'"
            class="pa-6"
            name="onboarding-installation-type"
            value="wordpress"
            @check="select('wordpress')"
          >
            <template #custom>
              <div class="text-left">
                <div class="d-flex align-center mb-2">
                  <v-icon
                    color="primary"
                    icon="$wordpress"
                    size="24"
                  />

                  <h5 class="p-1 font-weight-bold ml-2 mb-0">
                    {{ t('heading.onboarding.instanceSource.wordpress.title') }}
                  </h5>
                </div>

                <p class="p-2 font-weight-light mb-0 text--gray-darken1">
                  {{ t('heading.onboarding.instanceSource.wordpress.subtitle') }}
                </p>
              </div>
            </template>
          </CheckboxBig>

          <CheckboxBig
            v-if="available.includes('git')"
            :checked="selected === 'git'"
            class="pa-6"
            name="onboarding-installation-type"
            value="git"
            @check="select('git')"
          >
            <template #custom>
              <div class="text-left">
                <div class="d-flex align-center mb-2">
                  <v-icon
                    color="primary"
                    icon="$github"
                    size="24"
                  />

                  <h5 class="p-1 font-weight-bold ml-2 mb-0">
                    {{ t('heading.onboarding.instanceSource.git.title') }}
                  </h5>
                </div>

                <p class="p-2 font-weight-light mb-0 text--gray-darken1">
                  {{ t('heading.onboarding.instanceSource.git.subtitle') }}
                </p>
              </div>
            </template>
          </CheckboxBig>

          <CheckboxBig
            v-if="available.includes('files')"
            :checked="selected === 'files'"
            class="pa-6"
            name="onboarding-installation-type"
            value="files"
            @check="select('files')"
          >
            <template #custom>
              <div class="text-left">
                <div class="d-flex align-center mb-2">
                  <v-icon
                    color="primary"
                    icon="$filetext"
                    size="24"
                  />

                  <h5 class="p-1 font-weight-bold ml-2 mb-0">
                    {{ t('heading.onboarding.instanceSource.zip.title') }}
                  </h5>
                </div>

                <p class="p-2 font-weight-light mb-0 text--gray-darken1">
                  {{ t('heading.onboarding.instanceSource.zip.subtitle') }}
                </p>
              </div>
            </template>
          </CheckboxBig>

          <!-- PanelAlpha Go (without the legacy "coming soon" chip): the next step is Go's catalog, full page. -->
          <CheckboxBig
            v-if="available.includes('go') && !goLocked"
            :checked="selected === 'go'"
            class="pa-6"
            data-testid="onboarding-installation-type-go"
            name="onboarding-installation-type"
            value="go"
            @check="select('go')"
          >
            <template #custom>
              <div class="text-left">
                <div class="d-flex align-center mb-2">
                  <img
                    alt=""
                    class="installation-type__go-mark"
                    height="24"
                    :src="goMark"
                    width="24"
                  >

                  <h5 class="p-1 font-weight-bold ml-2 mb-0">
                    {{ t('heading.onboarding.instanceSource.go.title') }}
                  </h5>
                </div>

                <p class="p-2 font-weight-light mb-0 text--gray-darken1">
                  {{ t('heading.onboarding.instanceSource.go.subtitle') }}
                </p>
              </div>
            </template>
          </CheckboxBig>

          <!-- Not paired with PanelAlpha Hub: the Go card is greyed and not selectable; it asks to connect first (Settings). -->
          <div
            v-if="available.includes('go') && goLocked"
            class="installation-type__go-locked pa-6"
            data-testid="onboarding-installation-type-go-locked"
          >
            <div class="text-left">
              <div class="installation-type__go-locked-body">
                <div class="d-flex align-center mb-2">
                  <img
                    alt=""
                    class="installation-type__go-mark"
                    height="24"
                    :src="goMark"
                    width="24"
                  >

                  <h5 class="p-1 font-weight-bold ml-2 mb-0">
                    {{ t('heading.onboarding.instanceSource.go.title') }}
                  </h5>
                </div>

                <p class="p-2 font-weight-light mb-0 text--gray-darken1">
                  {{ t('heading.onboarding.instanceSource.go.subtitle') }}
                </p>
              </div>

              <p class="p-2 mt-4 mb-3 installation-type__go-hint">
                <v-icon
                  icon="$alertcircle"
                  size="16"
                />
                {{ t('heading.onboarding.instanceSource.go.connectHub') }}
              </p>

              <AppButton
                data-testid="onboarding-installation-type-go-connect"
                kind="secondary"
                size="small"
                @click="emit('connect-hub')"
              >
                {{ t('button.onboarding.goCatalog.connectHub') }}
              </AppButton>
            </div>
          </div>
        </ChoiceCardGrid>
      </v-card-text>

      <OnboardingStepFooter
        :back-label="t('button.cancel')"
        :loading="loading"
        :max-steps="4"
        :next-label="t('button.continue')"
        :step="1"
        @back="emit('remove-modal')"
        @next="selected && !(selected === 'go' && goLocked) && emit('next', selected)"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { InstallationTypeKey } from '@/views/onboarding/onboarding-service'
  import { useTranslation } from 'i18next-vue'
  import { watch } from 'vue'
  import goMark from '@/views/onboarding/go/assets/logo-go-mark.svg'
  import ChoiceCardGrid from '@/views/onboarding/ui/ChoiceCardGrid.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import CheckboxBig from '@/shared/ui/buttons/CheckboxBig.vue'
  import { preloadSocialIcons } from '@/shared/ui/icons/socials/lazy-socials'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = defineProps<{
    modelValue: boolean
    loading?: boolean
    available: InstallationTypeKey[]
    selected: InstallationTypeKey | null
    /** PanelAlpha Go needs the Hub pairing: unpaired, its card is greyed and asks to connect first. */
    goLocked?: boolean
  }>()
  const emit = defineEmits<{
    'update:selected': [type: InstallationTypeKey]
    'next': [type: InstallationTypeKey]
    'connect-hub': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()

  function select (type: InstallationTypeKey): void {
    emit('update:selected', type)
  }

  // The "git" card draws the GitHub logo, a separate chunk (`lazy-socials.ts`). `OnboardingModalWrapper` already fetches it at start-up
  // (this component only mounts with the first step); the call stays as a cached safety net so the card never renders without it.
  watch(() => props.available.includes('git'), hasGit => {
    if (hasGit) {
      void preloadSocialIcons(['github'])
    }
  }, { immediate: true })
</script>

<style lang="scss" scoped>
  // The locked PanelAlpha Go card: the `CheckboxBig` frame, greyed, with its connect button still active.
  .installation-type__go-locked {
    border: 1px dashed var(--v-gray-lighten2);
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.02);
  }

  // The PanelAlpha GO! mark (brand colours, in its own SVG) in place of a line icon.
  .installation-type__go-mark {
    flex: none;
    display: block;
  }

  .installation-type__go-locked-body {
    opacity: 0.5;
  }

  .installation-type__go-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(var(--v-theme-on-surface), 0.75);
  }
</style>
