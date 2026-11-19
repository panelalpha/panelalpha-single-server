<template>
  <v-select
    ref="select"
    :class="[
      'filter-select',
      'custom-select',
      bold ? 'v-select--select-bold' : '',
      block ? 'custom-select--block' : '',
      `v-input--${size}`,
      'input-dropdown',
      customClasses,
    ]"
    :clearable="clearable"
    :disabled="disabled"
    :hide-details="!showDetails"
    :item-title="itemText ?? 'text'"
    :item-value="itemValue ?? 'value'"
    :items="items"
    :loading="loading"
    :menu-icon="''"
    :menu-props="{
      offset: outlined ? 8 : undefined,
      contentClass: ['custom-dropdown-select', menuClass],
    }"
    :model-value="model === '' ? null : model"
    :placeholder="placeholder"
    :required="required"
    :return-object="returnObject"
    :taggable="taggable || undefined"
    :variant="outlined ? 'outlined' : 'underlined'"
    @update:model-value="onUpdate"
  >
    <template #no-data>
      <loader no-margins :size="24" />
    </template>

    <!-- V4 renders an empty `.v-field__prepend-inner` (10px of padding) whenever the slot is passed, so it is passed only when there is content. -->
    <template
      v-if="$slots['prepend-inner'] || prefix"
      #prepend-inner
    >
      <slot name="prepend-inner">
        <div
          v-if="prefix"
          class="v-text-field__prefix"
        >
          {{ prefix }}
        </div>
      </slot>
    </template>

    <template #selection="{ item }">
      <span class="select-dropdown__selection input-dropdown">{{ selectionText(item) }}</span>
    </template>

    <template #item="{ item, props: itemProps }">
      <v-list-item
        v-bind="itemProps"
        :title="undefined"
      >
        <template #default="{ isSelected }">
          <v-tooltip
            v-if="hasTooltip(item)"
            content-class="tooltip-left-center"
            location="end"
            open-delay="200"
          >
            <template #activator="{ props: tooltipProps }">
              <div
                class="w-100"
                style="align-self: stretch"
                v-bind="tooltipProps"
              >
                <div
                  :aria-selected="isSelected"
                  class="input-dropdown-item"
                >
                  <span>{{ itemLabel(item) }}</span>

                  <v-icon
                    class="ml-2 input-dropdown-item__icon"
                    icon="$check"
                  />
                </div>
              </div>
            </template>
            {{ item.tooltip }}
          </v-tooltip>

          <div
            v-else
            :aria-selected="isSelected"
            class="input-dropdown-item"
          >
            <span>{{ itemLabel(item) }}</span>

            <v-icon
              class="ml-2 input-dropdown-item__icon"
              icon="$check"
            />
          </div>
        </template>
      </v-list-item>
    </template>

    <template #append-item>
      <slot name="append-item" />
    </template>

    <template #append-inner>
      <v-icon
        icon="$chevrondown"
        size="16"
      />
    </template>
  </v-select>
</template>

<script lang="ts" setup>
  import type { PropType } from 'vue'
  import { useTranslation } from 'i18next-vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { getItemLabel, getSelectionLabel, type SelectLabelOptions } from './select-label'

  // Runtime props (not type-based) only to keep the legacy `size` validator warning.
  const props = defineProps({
    bold: { type: Boolean, default: true },
    placeholder: { type: String, default: undefined },
    outlined: { type: Boolean, default: true },
    customClasses: { type: String, default: '' },
    // Extra class on the menu overlay (the menu is teleported, so a screen styles it through this class).
    menuClass: { type: String, default: '' },
    block: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    showDetails: { type: Boolean, default: false },
    items: { type: Array as PropType<unknown[]>, default: () => [] },
    itemValue: { type: String, default: undefined },
    itemText: { type: String, default: undefined },
    taggable: { type: Boolean, default: false },
    size: {
      type: String as PropType<'xlg' | 'lg' | 'md' | 'sm' | 'xsm'>,
      default: 'lg',
      validator: (value: string) => ['xlg', 'lg', 'md', 'sm', 'xsm'].includes(value),
    },
    prefix: { type: String, default: '' },
    returnObject: { type: Boolean, default: true },
    rawItemText: { type: Boolean, default: false },
    clearable: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  })

  const model = defineModel<string | number | Record<string, unknown> | null>({ default: '' })

  const { t } = useTranslation()

  function labelOptions (): SelectLabelOptions {
    return {
      items: props.items,
      itemValue: props.itemValue,
      rawItemText: props.rawItemText,
      placeholder: props.placeholder,
      t: (key: string) => t(key),
    }
  }

  function selectionText (item: unknown): unknown {
    return getSelectionLabel(item, labelOptions())
  }

  function itemLabel (item: unknown): unknown {
    return getItemLabel(item, labelOptions())
  }

  function hasTooltip (item: unknown): item is { tooltip: string } {
    return typeof item === 'object' && item !== null && Boolean((item as { tooltip?: unknown }).tooltip)
  }

  // Legacy setter: blur the focused element, then emit.
  function onUpdate (value: string | number | Record<string, unknown> | null): void {
    ;(document.activeElement as HTMLElement | null)?.blur()
    model.value = value
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.v-input:not(.custom-select--block) {
  max-width: fit-content;
}

// With nothing selected V4 has no selection span, so `.v-field__input` collapses to 0px and clips the absolutely
// positioned native input that carries the placeholder ("Select Role" of a mixed role was blank). V2 showed the placeholder; one line
// of height brings it back. The 48px field box does not change, and a selected value already gives the box this height.
.v-input :deep(.v-field:not(.v-field--dirty) .v-field__input) {
  min-height: v.$line-height-base;
}

.v-input.custom-select--block {
  width: 100%;

  // V2 `.v-input__control .v-input__slot`: the V4 field box.
  :deep(.v-field) {
    align-items: center;
    min-height: 56px;
  }

  // V2 `.v-select__selections` (flex row of selections) is the V4 `.v-field__input`.
  :deep(.v-field__input) {
    align-items: center;
    flex-wrap: nowrap;
    overflow: hidden;
    min-width: 0;
    max-width: 100%;
  }

  :deep(.v-select__selection) {
    overflow: hidden;
    max-width: 100%;
    margin: 0;
    line-height: v.$line-height-base;
  }

  :deep(.select-dropdown__selection) {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    font-size: v.$font-size-base;
    line-height: v.$line-height-base;
    color: var(--v-text-base);
  }
}

// V2 `.v-label` of the placeholder-as-label is the native input placeholder in V4.
.v-input.v-select--select-bold {
  :deep(.select-dropdown__selection),
  :deep(input::placeholder) {
    font-weight: v.$font-weight-bold !important;
  }

  :deep(input::placeholder) {
    color: var(--v-text-base);
  }
}

// V2 `.primary--text` (focused, no error) is `.v-field--focused:not(.v-field--error)` inside the V4 root.
.v-input:not(.v-select--active-menu) :deep(.v-field--focused:not(.v-field--error) .v-field__prepend-inner .v-icon > svg) {
  color: var(--v-gray-darken1) !important;
}

.v-input :deep(.v-field--focused:not(.v-field--error) .v-field__prepend-inner .v-icon > svg) {
  transition: color 0.24s ease;
}

// V2 `.v-select:not(.v-text-input--outlined)`: the guarded class never existed in V2, so this matched every select.
.v-select.v-select--active-menu :deep(.v-select__selection) {
  color: var(--v-primary-base);
}

.input-dropdown {
  &.v-select--active-menu {
    :deep(.v-field__append-inner) {
      .v-icon {
        color: map.get(v.$primary, darken1) !important;
        transform-origin: center;
        transform: rotate(180deg);
      }
    }

    :deep(span) {
      color: map.get(v.$primary, darken1) !important;
    }
  }
}

.v-text-field__prefix {
  margin-top: 2px;
}

.v-list-item {
  .input-dropdown-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 100%;
    transition: color 0.24s ease;
    padding: 0 16px;

    .v-icon {
      opacity: 0;
      transition-delay: 0.5s;
      transition: opacity 0.24s ease;
    }

    &:hover {
      .v-icon {
        opacity: 0.5;
      }
    }

    &.input-dropdown-item[aria-selected="true"] {
      font-weight: v.$font-weight-semibold;

      .v-icon {
        opacity: 1;
      }
    }

    &.input-dropdown-item[aria-selected="true"] {
      color: map.get(v.$primary, darken1);

      &::before {
        background-color: transparent;
      }
    }
  }
}
</style>
