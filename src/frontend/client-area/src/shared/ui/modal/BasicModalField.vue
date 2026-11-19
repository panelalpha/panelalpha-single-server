<template>
  <div class="d-flex flex-column">
    <label
      v-if="(field.label || field.tooltip) && field.type !== 'checkbox'"
      v-show="!field.hidden"
      class="base--text mb-2"
    >{{ field.label }}
      <form-help-icon
        v-if="field.tooltip"
        :text="t(field.tooltip)"
      />
    </label>

    <div
      v-if="field.type === 'text'"
      v-show="!field.hidden"
      :class="last ? 'last-child' : ''"
    >
      <validated-text-field
        v-if="!field.loading"
        v-model="textModel"
        class="v-input--md"
        density="compact"
        :error-messages="field.errorMessages"
        hide-details="auto"
        :placeholder="field.placeholder"
        :prefix="field.prefix"
        :readonly="field.readonly"
        :rules="rules"
        :suffix="field.suffix"
        validate-on="blur"
        variant="outlined"
        @blur="emit('blur')"
      />

      <v-skeleton-loader
        v-else
        type="text"
      />
    </div>

    <div
      v-else-if="field.type === 'multiText'"
      v-show="!field.hidden"
      class="d-flex input-group"
      :class="last ? 'last-child' : ''"
    >
      <validated-text-field
        v-for="input in field.inputs"
        :key="input.name"
        class="v-input--md"
        density="compact"
        hide-details="auto"
        :model-value="textPart(input.name)"
        :placeholder="input.placeholder"
        :prefix="input.prefix"
        :readonly="input.readonly"
        :rules="rules"
        :suffix="input.suffix"
        validate-on="blur"
        variant="outlined"
        @update:model-value="onMultiInput(input.name, $event)"
      />
    </div>

    <div
      v-else-if="field.type === 'text-select'"
      v-show="!field.hidden"
      :class="last ? 'last-child' : ''"
    >
      <text-select-input
        v-if="!field.loading"
        :available-select-options="field.options"
        :placeholder="field.placeholder"
        :readonly="field.options.length < 2"
        :rules="field.hidden ? [] : field.rules"
        :select="selectPart(field.selectName)"
        :suffix="field.suffix"
        :text="textPart(field.textName) ?? ''"
        @update:select="setPart(field.selectName, $event)"
        @update:text="setPart(field.textName, $event)"
      />

      <v-skeleton-loader
        v-else
        type="text"
      />
    </div>

    <div
      v-else-if="field.type === 'domain-input'"
      v-show="!field.hidden"
      :class="last ? 'last-child' : ''"
    >
      <domain-name-input
        v-if="!field.loading"
        :error-messages="field.errorMessages"
        :placeholder="field.placeholder"
        :rules="field.hidden ? [] : field.rules"
        :text="textPart(field.textName) ?? ''"
        @update:text="setPart(field.textName, $event)"
      />

      <v-skeleton-loader
        v-else
        type="text"
      />
    </div>

    <div
      v-else-if="field.type === 'select'"
      v-show="!field.hidden"
      :class="last ? 'last-child' : ''"
    >
      <v-select
        v-if="!field.loading"
        :class="field.customClass ? field.customClass : ''"
        density="compact"
        hide-details="auto"
        item-title="label"
        item-value="value"
        :items="field.options"
        :list-props="{ density: 'compact' }"
        :menu-icon="!field.readonly ? '$dropdown' : ''"
        :menu-props="{ contentClass: 'basic-modal-select-menu', maxHeight: 304 }"
        :model-value="model"
        :multiple="field.multiple"
        :readonly="field.readonly"
        :rules="rules"
        variant="outlined"
        @update:model-value="onSelect"
      >
        <template
          v-if="field.name === 'role' && !field.plainOptions"
          #item="{ item, props: itemProps }"
        >
          <v-list-item
            v-bind="itemProps"
            :title="undefined"
          >
            <user-role-label :role="item.value as string" />
          </v-list-item>
        </template>

        <template
          v-if="field.name === 'role' && !field.plainOptions"
          #selection="{ item }"
        >
          <user-role-label :role="item.value as string" />
        </template>
      </v-select>

      <v-skeleton-loader
        v-else
        type="text"
      />
    </div>

    <div
      v-else-if="field.type === 'combobox'"
      v-show="!field.hidden"
      :class="last ? 'last-child' : ''"
    >
      <v-combobox
        v-if="!field.loading"
        :class="field.customClass ? field.customClass : ''"
        density="compact"
        hide-details="auto"
        item-title="label"
        item-value="value"
        :items="field.options"
        :list-props="{ density: 'compact' }"
        :menu-icon="!field.readonly ? '$dropdown' : ''"
        :menu-props="{ contentClass: 'basic-modal-select-menu', maxHeight: 304 }"
        :model-value="comboboxModel"
        :readonly="field.readonly"
        :return-object="false"
        :rules="rules"
        variant="outlined"
        @update:model-value="onSelect"
      />

      <v-skeleton-loader
        v-else
        type="text"
      />
    </div>

    <div
      v-else-if="field.type === 'checkbox'"
      v-show="!field.hidden"
      :class="[
        last ? 'last-child' : '',
        field.hidden ? '' : 'd-flex flex-column align-start w-100 pb-4',
      ]"
    >
      <template v-if="!field.hidden">
        <template v-if="!field.loading">
          <p
            v-if="field.message"
            v-safe-html="field.message"
            class="p-2"
            :class="field.messageClass"
          />

          <label class="base--text checkbox-label d-flex align-center p-2">
            <checkbox
              :label="field.label"
              :model-value="Boolean(model)"
              :rules="rules"
              :tooltip="field.tooltip ? t(field.tooltip) : ''"
              @update:model-value="onCheckbox"
            />
          </label>
        </template>

        <v-skeleton-loader
          v-else
          class="w-100"
          type="text"
        />
      </template>
    </div>

    <div
      v-else-if="field.type === 'textarea'"
      v-show="!field.hidden"
      :class="last ? 'last-child' : ''"
    >
      <p
        v-if="field.message"
        v-safe-html="field.message"
        class="p-2"
        :class="field.messageClass"
      />

      <v-textarea
        v-if="!field.loading"
        v-model="textModel"
        auto-grow
        :class="field.height === undefined ? 'modal-textarea--default' : undefined"
        density="compact"
        hide-details="auto"
        :placeholder="field.placeholder"
        :rows="field.height === undefined ? 4 : undefined"
        :rules="rules"
        :style="field.height === undefined ? undefined : { '--modal-textarea-height': toCssSize(field.height) }"
        variant="outlined"
      />

      <v-skeleton-loader
        v-else
        type="text@3"
      />
    </div>

    <div
      v-else-if="field.type === 'generatePassword'"
      v-show="!field.hidden"
      class="d-flex input-group"
    >
      <validated-text-field
        v-show="!field.hidden"
        v-model="textModel"
        autocomplete="new-password"
        :autofocus="false"
        class="v-input--md generated-password-field"
        density="compact"
        :error-messages="field.errorMessages"
        hide-details="auto"
        :rules="rules"
        :type="showPassword ? 'text' : 'password'"
        validate-on="blur"
        variant="outlined"
      />

      <AppButton
        v-show="!field.hidden"
        :aria-label="showPassword ? t('button.secret.hide') : t('button.secret.show')"
        class="password-toggle mr-4 ml-4"
        icon
        kind="secondary"
        size="large"
        @click="showPassword = !showPassword"
      >
        <v-icon
          class="password-toggle__icon"
          :icon="showPassword ? '$eye' : '$eyeclosed'"
        />
      </AppButton>

      <AppButton
        v-show="!field.hidden"
        kind="secondary"
        size="large"
        @click.prevent="model = generatePassword()"
      >
        <span class="password-button__label password-button__label--text">{{ t('button.password.generate') }}</span>
      </AppButton>
    </div>

    <div
      v-else-if="field.type === 'password'"
      v-show="!field.hidden"
      class="d-flex input-group"
    >
      <validated-text-field
        v-show="!field.hidden"
        v-model="textModel"
        autocomplete="new-password"
        :autofocus="false"
        class="v-input--md"
        density="compact"
        :error-messages="field.errorMessages"
        hide-details="auto"
        :rules="rules"
        :type="showPassword ? 'text' : 'password'"
        validate-on="blur"
        variant="outlined"
      />

      <AppButton
        v-show="!field.hidden"
        :aria-label="showPassword ? t('button.secret.hide') : t('button.secret.show')"
        class="password-toggle mr-0 ml-4"
        icon
        kind="secondary"
        size="large"
        @click="showPassword = !showPassword"
      >
        <v-icon
          class="password-toggle__icon"
          :icon="showPassword ? '$eye' : '$eyeclosed'"
        />
      </AppButton>
    </div>

    <div
      v-else-if="field.type === 'hiddenPassword'"
      v-show="!field.hidden"
      class="d-flex input-group"
    >
      <v-text-field
        v-show="!field.hidden"
        autocomplete="new-password"
        :autofocus="false"
        class="v-input--md"
        density="compact"
        disabled
        hide-details="auto"
        model-value="************"
        type="password"
        validate-on="blur"
        variant="outlined"
      />

      <AppButton
        v-show="!field.hidden"
        class="ml-4"
        kind="secondary"
        size="large"
        @click.prevent="emit('button-click')"
      >
        <span class="password-button__label">{{ t('button.password.setNew') }}</span>
      </AppButton>
    </div>

    <div
      v-else-if="field.type === 'switch'"
      v-show="!field.hidden"
      class="d-flex input-group"
    >
      <AppSwitch
        v-show="!field.hidden"
        v-model="model"
        class="pa-0 ma-0"
        hide-details="auto"
        kind="inset"
        validate-on="blur"
      />
    </div>

    <span
      v-if="field.description"
      class="mb-3"
    ><strong>{{ field.description }}</strong></span>
  </div>
</template>

<script lang="ts" setup>
  // The per-type field renderer; app-lite comments out the `role` select slots.
  // The screen owns the values: `v-model` is the value of this field (an object keyed by sub-name for
  // `multiText` and `text-select`), so there is no `formValues` bag.
  import { useTranslation } from 'i18next-vue'
  import { computed, inject, ref } from 'vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppSwitch from '@/shared/ui/buttons/AppSwitch.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import DomainNameInput from '@/shared/ui/form/DomainNameInput.vue'
  import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
  import TextSelectInput from '@/shared/ui/form/TextSelectInput.vue'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import UserRoleLabel from '@/shared/ui/labels/UserRoleLabel.vue'
  import { type ModalField, type ModalFieldRule, showPasswordKey } from './basic-modal.types'
  import { generatePassword } from './generate-password'

  const props = defineProps<{
    field: ModalField
    /** Legacy `last-child` on the wrapper of the last field (drops the bottom margin of the text field). */
    last?: boolean
  }>()

  const emit = defineEmits<{
    'blur': []
    'change': [value: unknown]
    'input': []
    'button-click': []
  }>()

  const model = defineModel<unknown>()

  const { t } = useTranslation()

  const showPassword = inject(showPasswordKey, ref(false))

  const values = computed(() => (model.value ?? {}) as Record<string, unknown>)

  /** The combobox holds a free-text value (`Branch` dialog); the field turns `return-object` off so a pick arrives as that value. */
  const comboboxModel = computed<string | null>(() => (typeof model.value === 'string' ? model.value : null))

  const textModel = computed<string | null>({
    get: () => (model.value ?? null) as string | null,
    set: value => {
      model.value = value
    },
  })

  // Legacy `spreadRules`: custom rules count only when every one is a function.
  function spreadRules (rules: ModalFieldRule[] | undefined): ModalFieldRule[] {
    if (Array.isArray(rules) && rules.length > 0 && rules.every(rule => typeof rule === 'function')) {
      return rules
    }
    return []
  }

  const rules = computed<ModalFieldRule[]>(() => {
    const { field } = props
    if (field.hidden || field.type === 'switch') {
      return []
    }
    // Legacy `password` message is English and not translated.
    const requiredRule: ModalFieldRule = field.type === 'password'
      ? value => !!value || `${field.label} Required.`
      : value => !!value || t('form.validation.required', { field: field.label })
    return [
      field.required ? requiredRule : () => true,
      ...spreadRules(field.rules),
    ]
  })

  function textPart (name: string): string | null {
    return (values.value[name] ?? null) as string | null
  }

  // Legacy initialised only `formValues[field.name]`, so an unset select part was `undefined` and
  // TextSelectInput's default (blank select) applied; `null` would fall back to the first option.
  function selectPart (name: string): string | undefined {
    return values.value[name] as string | undefined
  }

  function setPart (name: string, value: unknown): void {
    model.value = { ...values.value, [name]: value }
  }

  // Legacy `@input="field.onInput(formValues)"` on every input of a `multiText` field.
  function onMultiInput (name: string, value: unknown): void {
    setPart(name, value)
    emit('input')
  }

  function toCssSize (size: number | string): string {
    return typeof size === 'number' ? `${size}px` : size
  }

  function onSelect (value: unknown): void {
    model.value = value
    emit('change', value)
  }

  function onCheckbox (value: boolean): void {
    model.value = value
    emit('change', value)
  }
</script>

<style
  lang="scss"
  scoped
  src="./BasicModal.scss"
/>

<style lang="scss" scoped>
// V2 drew the prefix (database name `wpsk1_`, FTP directory `/home/wpsk1/`) always visible, in the colour of the field text, with a 4px
// gap to the typed text, and the focus (primary) and error colours of the field reached it by inheritance. V4 hides it until the field
// is active (`opacity: 0`), paints it grey and pads it by the field padding.
.v-text-field :deep(.v-text-field__prefix) {
  padding-inline: 0 4px;
  color: inherit;
  opacity: 1;
}

// V2 password field is 24 px wide in the narrow error row, V4 17 px (messages wrap more).
.generated-password-field {
  min-width: 24px;
}

// Colours of the password buttons (were inline `style` with `!important`): the outlined `color="gray"` button would otherwise set its own.
.password-toggle .password-toggle__icon,
.v-btn .password-button__label {
  color: var(--v-icon-base);
}

.v-btn .password-button__label--text {
  color: var(--v-text-darken1);
}

// V2 `tile` large icon buttons got a 5px radius from `_buttons`; V4 emits no `--tile` class and icon buttons are round.
.password-toggle.v-btn--icon {
  border-radius: 5px;
}

// V2 `height` on the textarea sized its input slot; V4 has no `height` prop, so it becomes a minimum field height.
.v-textarea :deep(.v-field) {
  min-height: var(--modal-textarea-height);
}

// Without a `height` the V2 textarea slot was 120px (autoGrow). The V4 `rows` height adds the 16px input padding to the 22px rows (5 rows =
// 126px), so the field has four rows and a 120px minimum; it still grows with the text.
.v-textarea.modal-textarea--default :deep(.v-field) {
  min-height: 120px;
}
</style>
