<template>
  <div
    :class="['checkbox', dark ? 'checkbox--dark' : '']"
    @mouseleave="hover = false"
    @mouseover="hover = true"
  >
    <v-checkbox
      v-model="checked"
      :aria-label="ariaLabel"
      :class="[
        checked ? 'active' : '',
        labellg ? 'labellg' : '',
        color ? `v-input--checkbox-${color}` : '',
      ]"
      :disabled="disabled"
      hide-details
      :indeterminate="hover || indeterminate"
      indeterminate-icon="$check"
      :ripple="false"
      :rules="rules"
    >
      <template #label>
        <span>{{ label }}</span>

        <span
          v-if="tooltip"
          class="ms-2 d-inline-flex align-center"
        >
          <form-help-icon :text="tooltip" />
        </span>
      </template>
    </v-checkbox>
  </div>
</template>

<script lang="ts" setup>
  import type { FieldRule } from './field-rule'
  import { ref } from 'vue'
  import FormHelpIcon from './FormHelpIcon.vue'

  const checked = defineModel<boolean>({ default: false })

  withDefaults(defineProps<{
    indeterminate?: boolean
    disabled?: boolean
    label?: string
    /** Name for a box that has no visible label (the card and row selection boxes); it lands on the `<input>`. */
    ariaLabel?: string
    tooltip?: string
    labellg?: boolean
    rules?: FieldRule[]
    color?: string
    /** Unchecked box on a dark surface (the select snackbar is always dark). */
    dark?: boolean
  }>(), {
    indeterminate: false,
    disabled: false,
    label: undefined,
    ariaLabel: undefined,
    tooltip: '',
    labellg: false,
    rules: undefined,
    color: undefined,
    dark: false,
  })

  const hover = ref(false)
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `.v-input--selection-controls__input` (the 22px box) is the V4 `.v-selection-control__input`;
// the V4 wrapper and input both take the size from `--v-selection-control-size`.
// `.v-input--is-label-active` (checked) is `.active` on the root, which is set from the same model.
@mixin checkbox-active($palette) {
  &.active {
    :deep(.v-selection-control__input) {
      background: map.get($palette, base);
      border-color: map.get($palette, base);
      // V2 put the palette text class (`primary--text`) on the active input box.
      color: map.get($palette, base);
    }

    :deep(.v-icon) {
      color: white !important;
    }
  }
}

@mixin checkbox-indeterminate($palette) {
  :deep(.v-selection-control--indeterminate.v-selection-control--disabled) {
    opacity: 1 !important;

    .v-icon svg {
      color: map.get($palette, lighten1);
    }
  }

  &:not(.active) {
    :deep(.v-selection-control--indeterminate) {
      .v-icon svg {
        color: map.get($palette, lighten1);
      }

      .v-selection-control__input {
        border-color: map.get($palette, base);
        background-color: map.get($palette, lighten2);
      }

      &.v-selection-control--disabled {
        opacity: 1 !important;
      }
    }
  }
}

.v-input.v-checkbox {
  margin: 0;
  padding: 0;

  :deep(.v-selection-control) {
    --v-selection-control-size: 22px;

    margin: 0;
    padding: 0;
    min-height: 22px;
  }

  :deep(.v-selection-control__wrapper) {
    margin: 0;
  }

  :deep(.v-selection-control__input) {
    background-color: rgb(var(--v-theme-checkbox));
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid map.get(v.$gray, lighten2);
    display: flex;
    justify-content: center;
    align-items: center;
    margin-right: 0px;
    transition: background-color 0.3s ease, border-color 0.3s ease;

    // V4 hover layer is a round overlay; the legacy ripple was off.
    &::before {
      display: none;
    }

    > .v-icon {
      opacity: 1;
    }
  }

  // V4 puts the label next to the wrapper, V2 next to the input box.
  :deep(.v-selection-control__wrapper + .v-label) {
    margin-left: 16px;
  }

  // The legacy bundle ships no icon font, so the V2 `$checkboxOff` glyph painted nothing.
  :deep(.v-selection-control:not(.v-selection-control--dirty, .v-selection-control--indeterminate) .v-selection-control__input > .v-icon) {
    visibility: hidden;
  }

  :deep(.v-icon svg) {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    margin-left: 1px;
    transition: color 0.3s ease;
  }

  :deep(.v-label) {
    font-size: v.$font-size-sm;
    line-height: v.$line-height-sm;
    // V2 vendor: the V2 label had `letter-spacing: normal`; V4 `.v-label` adds 0.009em.
    letter-spacing: normal;
  }

  &.labellg {
    :deep(.v-label) {
      font-size: v.$font-size-base;
      line-height: v.$line-height-base;
    }
  }

  @include checkbox-active(v.$primary);

  // Same order as legacy: disabled follows the active state, so a disabled checked box is gray.
  :deep(.v-selection-control--disabled .v-selection-control__input) {
    background-color: map.get(v.$gray, lighten2);
    border-color: map.get(v.$gray, lighten2);
  }

  @include checkbox-indeterminate(v.$primary);

  &.v-input--checkbox-error {
    @include checkbox-active(v.$error);
    @include checkbox-indeterminate(v.$error);
  }
}

.checkbox {
  border-radius: 4px;
  // V2 vendor: `checkbox` is also a palette class (theme colour `checkbox`), so V2 painted this root with
  // `background-color`/`border-color` of that colour (`!important`). V4 has no palette classes.
  background-color: rgb(var(--v-theme-checkbox));
  border-color: rgb(var(--v-theme-checkbox));
}

.checkbox--dark {
  :deep(.v-selection-control__input:not(.active)) {
    background-color: transparent;
    border: 1px solid var(--v-gray-darken2) !important;
  }
}
</style>
