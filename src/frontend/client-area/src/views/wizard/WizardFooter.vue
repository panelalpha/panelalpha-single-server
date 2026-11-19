<template>
  <div
    class="wizard-footer"
    :class="{ 'wizard-footer--flat': flat }"
    data-testid="wizard-footer"
  >
    <AppButton
      v-if="!hidePrevious"
      class="wizard-footer__previous"
      :data-testid="previousTestid ?? 'wizard-previous'"
      kind="secondary"
      size="large"
      @click="emit('previous')"
    >
      <span class="wizard-footer__previous-label">
        {{ previousLabel ?? t('setup.wizard.footer.previous', { defaultValue: 'Previous Step' }) }}
      </span>
    </AppButton>

    <AppButton
      v-if="!hideNext"
      class="wizard-footer__next"
      data-testid="wizard-next"
      :disabled="disabled"
      :form="form"
      kind="primary"
      :loading="loading"
      size="large"
      :type="form ? 'submit' : 'button'"
      @click="onNext"
    >
      {{ nextLabel ?? t('setup.wizard.footer.next', { defaultValue: 'Continue' }) }}
      <WizardArrowRightIcon class="wizard-footer__arrow" />
    </AppButton>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import WizardArrowRightIcon from './icons/WizardArrowRightIcon.vue'

  // The row under a step, with "Previous Step" and the main button. "Leave Wizard"
  // is not ported (`v-if="!isAppSingleServer"`). With `form` (the id of the form of the step) the main button submits that form, so Enter
  // in a field sends it as well; without it the button only emits `next`.
  const props = defineProps<{
    /** Id of the `<form>` the main button belongs to (the row sits outside of it, under the content). */
    form?: string
    /** "Previous Step" is left out (step 1 once the account exists: its start page is gone, so the button would only leave the wizard). */
    hidePrevious?: boolean
    /** The main button is left out (`hideNextButton`: the step moves on by its own buttons). */
    hideNext?: boolean
    /** The row sits inside the body of the step, with no line (`hideDivider`): the last step. */
    flat?: boolean
    /** The main button shows the loader and ignores clicks. */
    loading?: boolean
    /** The main button is inactive (the value of the step is still loading). */
    disabled?: boolean
    previousLabel?: string
    previousTestid?: string
    nextLabel?: string
  }>()

  const emit = defineEmits<{
    previous: []
    next: []
  }>()

  const { t } = useTranslation()

  function onNext (): void {
    if (props.form === undefined) {
      emit('next')
    }
  }
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-lg: map.get(v.$grid-breakpoints, lg) - 0.02px;
  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  // The row has 16px above and below, 80px on the left, 24px on the right, a 1px line along the top edge.
  .wizard-footer {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: flex-end;
    padding: 16px 24px 16px 80px;

    @media (max-width: $below-lg) {
      padding-left: 24px;
    }

    // Under 650px of the source: the buttons one under the other, the main one on top, full width.
    @media (max-width: $below-sm) {
      flex-direction: column-reverse;
      align-items: stretch;
    }
  }

  // `&--hide-divider`: 36px above and below, no line, no side padding (the body of the step has them).
  .wizard-footer--flat {
    padding: 36px 0;

    &::before {
      display: none;
    }
  }

  // The source draws the line from the sidebar edge to the right edge of the window (`&::before`, `1000vw`); the content area clips it.
  .wizard-footer::before {
    content: '';
    position: absolute;
    top: 0;
    right: -100vw;
    left: -100vw;
    z-index: 0;
    height: 1px;
    background: var(--v-wizard-footer-line);
  }

  // Both buttons are 17px wide on each side of the label (the large button of client area has 18px; measured on the screenshot).
  .wizard-footer .wizard-footer__previous.v-btn,
  .wizard-footer .wizard-footer__next.v-btn {
    padding-inline: 17px;
  }

  // `mr-4` of "Previous Step"; in the column the gap goes under the buttons (`.v-btn { margin-bottom: 16px }`).
  .wizard-footer .wizard-footer__previous.v-btn {
    margin-inline-end: 16px;
  }

  @media (max-width: $below-sm) {
    .wizard-footer .wizard-footer__previous.v-btn,
    .wizard-footer .wizard-footer__next.v-btn {
      width: 100%;
      margin-inline-end: 0;
    }

    .wizard-footer .wizard-footer__previous.v-btn:not(:only-child) {
      margin-top: 16px;
    }
  }

  // The label inside the outlined button is grey, not the green of the outlined buttons of client area.
  .wizard-footer__previous-label {
    color: var(--v-wizard-label);
  }

  // `v-icon size="20"` after the label, `ml-2` (8px); 5px here, because the arrow of the screenshot sits closer to the label.
  .wizard-footer__arrow {
    width: 20px;
    height: 20px;
    margin-left: 5px;
  }
</style>
