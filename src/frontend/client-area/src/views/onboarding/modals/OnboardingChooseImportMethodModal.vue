<template>
  <OnboardingDialog
    data-testid="onboarding-import-method-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      @close="emit('remove-modal')"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-start">
          <div class="d-flex flex-column">
            <span class="font-weight-light p-1">
              {{ t('heading.onboarding.import.url.title') }}
            </span>

            <h4 id="onboarding-import-method-title">
              {{ t('heading.onboarding.import.url.subtitle') }}
            </h4>
          </div>
        </div>

        <ChoiceCardGrid aria-labelledby="onboarding-import-method-title">
          <CheckboxBig
            :checked="selectedMethod === 'plugin'"
            class="pa-6"
            name="onboarding-import-method"
            value="plugin"
            @check="selectedMethod = 'plugin'"
          >
            <template #custom>
              <div
                class="text-left onboarding-fill"
              >
                <h5 class="p-1">
                  {{ t('heading.onboarding.chooseImportMethod.simple.title') }}
                </h5>

                <p class="mb-4">
                  {{ t('general.recommended') }}
                </p>

                <!-- Legacy rendered the method descriptions as raw HTML (translation copy); here they go through `v-safe-html` (profile `copy`). -->
                <p
                  v-safe-html="t('heading.onboarding.chooseImportMethod.simple.description')"
                  class="p-2 font-weight-thin mb-0"
                />
              </div>
            </template>
          </CheckboxBig>

          <CheckboxBig
            :checked="selectedMethod === 'ftp'"
            class="pa-6"
            name="onboarding-import-method"
            value="ftp"
            @check="selectedMethod = 'ftp'"
          >
            <template #custom>
              <div
                class="text-left onboarding-fill"
              >
                <h5 class="p-1 mb-4">
                  {{ t('heading.onboarding.chooseImportMethod.advanced.title') }}
                </h5>

                <p
                  v-safe-html="t('heading.onboarding.chooseImportMethod.advanced.description')"
                  class="p-2 font-weight-thin mb-0"
                />
              </div>
            </template>
          </CheckboxBig>
        </ChoiceCardGrid>
      </v-card-text>

      <OnboardingStepFooter
        :back-label="t('button.cancel')"
        :max-steps="maxSteps"
        :next-label="t('button.continue')"
        :step="maxSteps - 1"
        @back="emit('remove-modal')"
        @next="emit('import-method-selected', selectedMethod)"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The copy and the layout are the same as in legacy. No API, no loading and no error state: the method is only picked here.
  import type { ImportMethod } from '@/views/onboarding/onboarding-steps'
  import { useTranslation } from 'i18next-vue'
  import { ref, toRef, watch } from 'vue'
  import ChoiceCardGrid from '@/views/onboarding/ui/ChoiceCardGrid.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import CheckboxBig from '@/shared/ui/buttons/CheckboxBig.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    /** The step count of the import flow. */
    maxSteps?: number
  }>(), {
    maxSteps: 0,
  })
  const emit = defineEmits<{
    'import-method-selected': [method: ImportMethod]
    'remove-modal': []
  }>()

  const { t } = useTranslation()

  // Every open starts on the plugin, the recommended method.
  const selectedMethod = ref<ImportMethod>('plugin')
  watch(toRef(props, 'modelValue'), open => {
    if (open) {
      selectedMethod.value = 'plugin'
    }
  })
</script>

<style lang="scss" scoped>
.onboarding-fill {
  height: 100%;
}
</style>
