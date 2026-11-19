<template>
  <OnboardingDialog
    close-on-back
    data-testid="onboarding-choose-onboarding-process-modal"
    fullscreen
    :model-value="modelValue"
  >
    <v-container
      class="onboarding-process px-0"
      fluid
    >
      <v-row class="pt-8 d-flex justify-center flex-column align-center h-100">
        <v-col
          class="d-flex align-center flex-column onboarding-container"
          cols="12"
        >
          <BrandLogo
            class="mb-10"
            :dark-logo="themeStore.darkLogo"
            :logo="themeStore.lightLogo"
          />

          <v-card
            class="d-flex mx-4 mb-15 onboarding-process-card"
            elevation="4"
          >
            <v-card-title class="d-flex justify-center pr-15">
              <h1
                id="onboarding-process-title"
                class="onboarding-process-card__heading"
              >
                Choose Onboarding Process
              </h1>

              <ModalCloseButton
                v-if="readyToRender"
                class="close-model"
                :push-right="false"
                @click="emit('remove-modal')"
              />
            </v-card-title>

            <v-card-text>
              <p class="mb-8">
                The end-customer using PanelAlpha will have two onboarding options.
              </p>

              <ChoiceCardGrid aria-labelledby="onboarding-process-title">
                <CheckboxBig
                  :checked="selectedType === 0"
                  name="onboarding-process"
                  value="quick"
                  @check="selectedType = 0"
                >
                  <template #custom>
                    <div
                      class="text-left onboarding-fill"
                    >
                      <h5 class="p-1 mb-4">
                        Quick Onboarding
                      </h5>

                      <p class="p-2 font-weight-thin base--text">
                        <b>
                          Optimized for the user experience, similar to popular website builders.
                        </b>
                      </p>

                      <p class="p-2 font-weight-thin base--text">
                        After purchasing a simple plan without a domain, the user will be presented with a quick choice of a theme and a site name. Their site will then be created under a temporary subdomain, which they can change later with a simple CNAME setup.
                      </p>
                    </div>
                  </template>
                </CheckboxBig>

                <CheckboxBig
                  :checked="selectedType === 1"
                  name="onboarding-process"
                  value="classic"
                  @check="selectedType = 1"
                >
                  <template #custom>
                    <div
                      class="text-left onboarding-fill"
                    >
                      <h5 class="p-1 mb-4">
                        Classic Onboarding
                      </h5>

                      <p class="p-2 font-weight-thin base--text">
                        <b>Providing full control over the process for more advanced users.</b>
                      </p>

                      <p class="p-2 font-weight-thin base--text">
                        The user will create their instance using a more detailed form, that includes the domain, template choice or cloning their site. They can optionally choose the theme first.
                      </p>
                    </div>
                  </template>
                </CheckboxBig>
              </ChoiceCardGrid>
            </v-card-text>

            <v-card-actions class="pt-8">
              <AppButton
                block
                kind="primary"
                size="x-large"
                @click="emit('demo-onboarding-selected', selectedType === 1)"
              >
                <span class="font-weight-600">
                  Try It Out!
                  <v-icon
                    icon="$arrowright"
                    size="24"
                  />
                </span>
              </AppButton>
            </v-card-actions>
          </v-card>
        </v-col>

        <v-img
          class="radio-lines"
          :src="radioLinesUrl"
        />
      </v-row>
    </v-container>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // Ported with its English copy: the demo account
  // picks the quick (`false`) or the classic (`true`) onboarding. The X shows only once the shell is ready (not during the autostart).
  import { ref } from 'vue'
  import radioLinesUrl from '@/views/onboarding/assets/radio-lines.svg'
  import ChoiceCardGrid from '@/views/onboarding/ui/ChoiceCardGrid.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import CheckboxBig from '@/shared/ui/buttons/CheckboxBig.vue'
  import BrandLogo from '@/shared/ui/logo/BrandLogo.vue'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  withDefaults(defineProps<{
    modelValue: boolean
    /** The close button shows only when the shell renders. */
    readyToRender?: boolean
  }>(), {
    readyToRender: true,
  })

  const emit = defineEmits<{
    /** `classic` is true for the classic onboarding, false for the quick one. */
    'demo-onboarding-selected': [classic: boolean]
    'remove-modal': []
  }>()

  const themeStore = useThemeStore()
  /** 0 = quick, 1 = classic. Legacy keeps the choice across opens, so it is not reset here. */
  const selectedType = ref<0 | 1>(0)
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

.onboarding-fill {
  height: 100%;
}

  .onboarding-process {
    background: white;
    max-width: 100%;
    min-height: 100%;
  }

  .close-model {
    position: absolute;
    top: 24px;
    right: 24px;
  }

  .onboarding-container {
    z-index: 999;
  }

  // The V2 `v-img` sized itself from the SVG (568 x 747); an absolutely positioned V4 `v-img` has no intrinsic width and collapses.
  .radio-lines {
    position: absolute;
    top: 0;
    left: 0;
    width: 568px;
    height: 747px;
  }

  .onboarding-process-card {
    width: 820px;
    // `calc(100% - 48px)` of the V2 column; the V4 column shrinks to the card, so the percentage capped it at 804px.
    max-width: calc(100vw - 48px);

    // `elevation="4"`: the dialog sheet's `.v-card { box-shadow: none !important }` (`_dialog.scss`) would flatten it.
    &.v-card.elevation-4 {
      box-shadow: v.$box-shadow-elevation-4 !important;
    }

    &__heading {
      font-weight: 800;
    }

    // The legacy scoped `padding-left/right: 48px` lost to the global dialog chrome (`.v-dialog .v-card .v-card__title/text`: 32px sides, no bottom padding on the text); `pr-15` (60px) stays.
    :deep(.v-card-title) {
      padding-top: 32px;
      padding-bottom: 32px;
      padding-left: 32px;
      padding-right: 32px;
    }

    :deep(.v-card-text) {
      overflow: visible;
      padding: 0 32px;
      text-align: center;
      -webkit-line-clamp: unset !important;

      > p {
        font-size: 19px;
        line-height: 28px;
        font-weight: 200;
        color: var(--v-text-darken1);
      }

      b {
        font-weight: 600;
      }
    }
  }
</style>
