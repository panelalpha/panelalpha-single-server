<template>
  <OnboardingDialog
    data-testid="onboarding-creation-type-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      @close="emit('remove-modal')"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-center">
          <h4
            id="onboarding-creation-type-title"
            class="font-weight-light"
          >
            {{ t('heading.onboarding.selectType.title') }}
          </h4>
        </div>

        <ChoiceCardGrid aria-labelledby="onboarding-creation-type-title">
          <CheckboxBig
            :checked="selectedType === 0"
            class="pa-6"
            name="onboarding-creation-type"
            value="create"
            @check="selectedType = 0"
          >
            <template #custom>
              <div
                class="text-left creation-type__custom"
              >
                <v-icon
                  class="mb-4"
                  color="primary"
                  icon="$pluscircle"
                  size="24"
                />

                <h5 class="p-1 mb-4 font-weight-bold">
                  {{ t('heading.onboarding.selectType.create.title') }}
                </h5>

                <p class="p-2 font-weight-light mb-0 text--gray-darken1">
                  {{ t('heading.onboarding.selectType.create.subtitle') }}
                </p>
              </div>
            </template>
          </CheckboxBig>

          <CheckboxBig
            :checked="selectedType === 1"
            class="pa-6"
            name="onboarding-creation-type"
            value="import"
            @check="selectedType = 1"
          >
            <template #custom>
              <div
                class="text-left creation-type__custom"
              >
                <v-icon
                  class="mb-4"
                  color="primary"
                  icon="$installIcon"
                  size="24"
                />

                <h5 class="p-1 mb-4 font-weight-bold">
                  {{ t('heading.onboarding.selectType.import.title') }}
                </h5>

                <p class="p-2 font-weight-light mb-0 text--gray-darken1">
                  {{ t('heading.onboarding.selectType.import.subtitle') }}
                </p>
              </div>
            </template>
          </CheckboxBig>
        </ChoiceCardGrid>
      </v-card-text>

      <OnboardingStepFooter
        :back-label="t('button.cancel')"
        :loading="loading"
        :max-steps="4"
        :next-label="t('button.continue')"
        :step="1"
        @back="emit('remove-modal')"
        @next="emit('next', selectedType)"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { ref, toRef, watch } from 'vue'
  import ChoiceCardGrid from '@/views/onboarding/ui/ChoiceCardGrid.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import CheckboxBig from '@/shared/ui/buttons/CheckboxBig.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = defineProps<{
    modelValue: boolean
    loading?: boolean
  }>()
  const emit = defineEmits<{
    'next': [creationType: 0 | 1]
    'remove-modal': []
  }>()

  const { t } = useTranslation()

  // Every open starts on Create.
  const selectedType = ref<0 | 1>(0)
  watch(toRef(props, 'modelValue'), open => {
    if (open) {
      selectedType.value = 0
    }
  })
</script>

<style lang="scss" scoped>
  .onboarding-modal {
    .creation-type__custom {
      height: 100%;
    }
  }
</style>
