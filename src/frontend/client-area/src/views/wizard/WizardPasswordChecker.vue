<template>
  <div
    class="wizard-checker"
    data-testid="wizard-password-checker"
  >
    <span class="wizard-checker__title">
      {{ t('setup.wizard.checker.title', { defaultValue: 'To ensure that your password is strong, use at least:' }) }}
    </span>

    <span
      v-for="check in checks"
      :key="check.key"
      class="wizard-checker__row"
      :data-passed="check.passed"
      :data-testid="`wizard-checker-${check.key}`"
    >
      <FeatureCheckIcon
        v-if="check.passed"
        class="wizard-checker__icon wizard-checker__icon--passed"
      />

      <WizardCloseIcon
        v-else
        class="wizard-checker__icon wizard-checker__icon--failed"
      />

      {{ label(check.key) }}

      <span class="wizard-checker__status">
        {{ check.passed
          ? t('setup.wizard.checker.met', { defaultValue: '(met)' })
          : t('setup.wizard.checker.notMet', { defaultValue: '(not met)' }) }}
      </span>
    </span>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import FeatureCheckIcon from '@/shared/ui/feature-card/FeatureCheckIcon.vue'
  import WizardCloseIcon from './icons/WizardCloseIcon.vue'
  import { type PasswordCheckKey, passwordChecks } from './password-checks'

  // Hint under the first password field: a heading and one row per rule, a green check when the rule
  // holds and a red cross when it does not. The rules are `passwordChecks` (the ones of `setupPasswordRules`).
  const props = defineProps<{ password: string }>()

  const { t } = useTranslation()
  const checks = computed(() => passwordChecks(props.password))

  function label (key: PasswordCheckKey): string {
    switch (key) {
      case 'uppercase': {
        return t('setup.wizard.checker.uppercase', { defaultValue: '1 uppercase character' })
      }
      case 'lowercase': {
        return t('setup.wizard.checker.lowercase', { defaultValue: '1 lowercase character' })
      }
      case 'number': {
        return t('setup.wizard.checker.number', { defaultValue: '1 number' })
      }
      case 'symbol': {
        return t('setup.wizard.checker.symbol', { defaultValue: '1 symbol' })
      }
      default: {
        return t('setup.wizard.checker.length', { defaultValue: '8 characters' })
      }
    }
  }
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  // The `.pa-4` padding of the menu and of the column of the checker.
  .wizard-checker {
    display: flex;
    flex-direction: column;
    padding: 16px;
  }

  // `gray--text.text--darken-4.font-weight-bold.mb-2`.
  .wizard-checker__title {
    margin-bottom: 8px;
    color: var(--v-wizard-title);
    font-size: v.$font-size-base;
    line-height: 24px;
    font-weight: v.$font-weight-bold;
  }

  // `gray--text.text--darken-2.mb-1.d-flex.align-center` (the last row has no `mb-1`); the icon has `mr-3` (12px).
  .wizard-checker__row {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    color: var(--v-wizard-checker-text);
    font-size: v.$font-size-base;
    line-height: 24px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  // The check and the cross are icons only; the status is read out by assistive tools (the row is the same size for sighted users).
  .wizard-checker__status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .wizard-checker__icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-right: 12px;
  }

  .wizard-checker__icon--passed {
    color: rgb(var(--v-theme-primary));
  }

  .wizard-checker__icon--failed {
    color: rgb(var(--v-theme-error));
  }
</style>
