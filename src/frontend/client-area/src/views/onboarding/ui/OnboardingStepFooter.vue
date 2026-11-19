<template>
  <v-card-actions class="onboarding-step-footer pt-8 d-flex align-center justify-space-between">
    <div class="onboarding-step-footer__steps">
      <StepIndicator
        :current-step="step"
        :max-steps="maxSteps"
      />
    </div>

    <div class="onboarding-step-footer__buttons d-flex align-center">
      <AppButton
        class="mr-3"
        :disabled="backDisabled"
        size="large"
        variant="text"
        @click="emit('back')"
      >
        <span class="font-weight-bold text-gray-darken-1">
          {{ ' ' + backLabel + ' ' }}
        </span>
      </AppButton>

      <AppButton
        :disabled="nextDisabled"
        kind="primary"
        :loading="loading"
        size="large"
        @click="emit('next')"
      >
        <slot name="next">
          <span class="font-weight-bold">
            {{ ' ' + nextLabel + ' ' }}
          </span>

          <v-icon
            v-if="nextArrow"
            class="ml-2 mr-0"
            icon="$arrowright"
            size="20"
          />
        </slot>
      </AppButton>
    </div>
  </v-card-actions>
</template>

<script lang="ts" setup>
  // Footer of an onboarding step: the step dots, the text back button and the
  // primary next button with its arrow. The labels come translated; the slot `next` replaces
  // the label and the arrow (the three states of the Git step). Under 550px the footer stacks.
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import StepIndicator from '@/shared/ui/step-indicator/StepIndicator.vue'

  withDefaults(defineProps<{
    step: number
    maxSteps: number
    backLabel: string
    nextLabel?: string
    backDisabled?: boolean
    nextDisabled?: boolean
    loading?: boolean
    nextArrow?: boolean
  }>(), {
    nextLabel: '',
    backDisabled: false,
    nextDisabled: false,
    loading: false,
    nextArrow: true,
  })

  const emit = defineEmits<{
    back: []
    next: []
  }>()
</script>

<style lang="scss" scoped>
  // On the import and choice steps under 550px the footer stacks, the buttons go full width under the dots.
  @media (max-width: 549px) {
    .onboarding-step-footer {
      flex-direction: column-reverse;
    }

    .onboarding-step-footer__steps {
      margin-top: 16px;
      width: 100%;
    }

    .onboarding-step-footer__buttons {
      flex-direction: column-reverse;
      width: 100%;

      .v-btn {
        width: 100%;
      }
    }
  }
</style>
