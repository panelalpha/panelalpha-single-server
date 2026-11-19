<template>
  <WizardTextField
    ref="textField"
    v-model="model"
    v-model:focused="focused"
    :autocomplete="autocomplete"
    :label="label"
    :name="name"
    :placeholder="placeholder"
    :rules="rules"
    :type="visible ? 'text' : 'password'"
  >
    <template #append-inner>
      <button
        :aria-label="visible
          ? t('setup.wizard.general.hidePassword', { defaultValue: 'Hide password' })
          : t('setup.wizard.general.showPassword', { defaultValue: 'Show password' })"
        :aria-pressed="visible"
        class="wizard-password-toggle"
        type="button"
        @click="visible = !visible"
      >
        <WizardEyeIcon v-if="visible" />

        <WizardEyeClosedIcon v-else />
      </button>
    </template>
  </WizardTextField>

  <v-menu
    :close-on-content-click="false"
    content-class="wizard-checker-menu"
    location="bottom start"
    :location-strategy="checkerLocation"
    :model-value="checker && focused"
    :open-on-click="false"
    :open-on-focus="false"
    :scrim="false"
    :target="anchor"
    :width="width"
  >
    <WizardPasswordChecker :password="model" />
  </v-menu>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useTemplateRef } from 'vue'
  import { checkerLocation } from './checker-location'
  import WizardEyeClosedIcon from './icons/WizardEyeClosedIcon.vue'
  import WizardEyeIcon from './icons/WizardEyeIcon.vue'
  import WizardPasswordChecker from './WizardPasswordChecker.vue'
  import WizardTextField from './WizardTextField.vue'

  // Password field with the eye of the admin area (`:append-icon="$eyeIcon"` / `$eyeClosedIcon`): the eye switches
  // the type of the input between `password` and `text`.
  defineProps<{
    /** Shows the strength hint under the field while it has the focus (`v-menu` with `open-on-focus`). */
    checker?: boolean
    label?: string
    placeholder?: string
    name?: string
    autocomplete?: string
    rules?: Array<(value: unknown) => true | string>
  }>()

  const model = defineModel<string>({ required: true })

  const { t } = useTranslation()
  const visible = ref(false)
  const focused = ref(false)
  const textField = useTemplateRef<{ element: () => HTMLElement | null }>('textField')

  // The hint opens under the field and is as wide as the field. The target stays the field while the hint animates, so a quick blur cannot take it away.
  const anchor = computed(() => textField.value?.element() ?? undefined)
  const width = computed(() => anchor.value?.getBoundingClientRect().width)
</script>

<style lang="scss" scoped>
  // The eye: a 20px glyph in `gray-darken1` (`.v-input__append-inner` of the source, `margin-left: 8px`).
  .wizard-password-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-left: 8px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--v-wizard-label);
    cursor: pointer;

    svg {
      width: 20px;
      height: 20px;
    }
  }
</style>

<style lang="scss">
  // The global menu rule caps a menu at 220px; the hint is as wide as the password field.
  .v-menu > .v-overlay__content.wizard-checker-menu.wizard-checker-menu {
    max-width: none;
  }
</style>
