<template>
  <v-select
    v-if="items.length >= 2"
    class="v-select--select-bold filter-select elevation-4 v-input--xlg input-dropdown"
    data-testid="hosting-plan-selector"
    hide-details
    item-title="name"
    item-value="id"
    :items="items"
    :menu-icon="''"
    :menu-props="{
      offset: 8,
      // The selector sits in a sticky sidebar: on scroll (and in a full-page screenshot) V4's default reposition strategy closed the menu.
      scrollStrategy: 'none',
      contentClass: 'custom-dropdown-select custom-dropdown-select--plans hosting-plan-menu',
    }"
    :model-value="modelValue"
    return-object
    variant="solo"
    @update:model-value="onUpdate"
  >
    <template #no-data>
      <loader no-margins :size="24" />
    </template>

    <template #selection="{ item }">
      <div class="d-flex flex-column py-3 w-100">
        <span class="font-weight-bold">{{ splitName(nameOf(item))[0] }}</span>

        <span class="plan-selector__domain font-weight-600 p-4 text-gray-darken-1 text-truncate">
          {{ splitName(nameOf(item))[1] }}
        </span>
      </div>
    </template>

    <template #item="{ item, props: itemProps }">
      <v-list-item
        v-bind="itemProps"
        :title="undefined"
      >
        <template #default="{ isSelected }">
          <div
            :aria-selected="isSelected"
            class="input-dropdown-item"
          >
            <div class="plan-selector__text d-flex flex-column">
              <span class="font-weight-bold">{{ splitName(nameOf(item))[0] }}</span>

              <span class="font-weight-600 p-4 text-gray-darken-1 text-truncate">
                {{ splitName(nameOf(item))[1] }}
              </span>
            </div>

            <v-icon
              class="ml-2 input-dropdown-item__icon"
              icon="$check"
            />
          </div>
        </template>
      </v-list-item>
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
  import type { HostingService } from './hosting.types'
  import Loader from '@/shared/ui/loader/Loader.vue'

  defineProps<{
    items: HostingService[]
    modelValue: HostingService | null
  }>()

  const emit = defineEmits<{
    'update:model-value': [value: HostingService]
  }>()

  /** Blur the focused element, then emit. */
  function onUpdate (value: HostingService): void {
    ;(document.activeElement as HTMLElement | null)?.blur()
    emit('update:model-value', value)
  }

  /** V4.2 hands the raw entry (not a `ListItem`) to the `selection` and `item` slots. */
  function nameOf (item: unknown): string {
    const entry = item as { name?: unknown, title?: unknown }
    return String(entry.name ?? entry.title ?? '')
  }

  /** `"<plan> - <domain>"` into its two lines. */
  function splitName (name: string): [string, string | undefined] {
    const split = name.split(' - ')
    return [split[0]!, split[1]]
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.v-input {
  max-width: 100%;
}

.v-select {
  // V2 `.v-input` root is rounded (4px, measured); V4's is square and only the field is rounded.
  border-radius: 4px;

  &.v-select--active-menu {
    // V2 `primary--text` of a focused select (borders follow the text colour).
    color: var(--v-primary-base);
    background-color: map.get(v.$primary, lighten4);

    :deep(.v-icon) {
      color: map.get(v.$primary, darken1);
    }
  }

  // V2 `.v-select__selection--comma`: the selection wraps instead of ellipsis.
  :deep(.v-select__selection) {
    // V2 `.v-select__selections` is 18px line height (measured), V4's field text is 24px.
    line-height: 18px;
    white-space: initial;
    // V2 selections fill the field; a V4 selection shrinks to its content, which truncated the domain (`w-100` of a narrow box).
    flex: 1 1 auto;
    max-width: 100%;
  }

  :deep(.v-field) {
    align-items: center;
    box-shadow: none;
  }
}

// Was inline `max-width` on the two text lines of the selection (`calc(100% - 24px)`) and of the item (`100%`).
.plan-selector__domain {
  max-width: calc(100% - 24px);
}

.plan-selector__text {
  max-width: 100%;
}

.input-dropdown {
  &.v-select--active-menu {
    :deep(.v-field__append-inner .v-icon) {
      color: map.get(v.$primary, darken1);
      transform-origin: center;
      transform: rotate(180deg);
    }
  }
}

.v-list-item {
  max-height: unset;

  .input-dropdown-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    white-space: wrap;
    height: fit-content;
    width: 100%;

    .v-icon {
      opacity: 0;
      transition: opacity 0.24s ease;
    }

    &[aria-selected="true"] {
      font-weight: v.$font-weight-semibold;
      color: map.get(v.$primary, darken1);

      .v-icon {
        opacity: 1;
      }
    }
  }
}

[dir="rtl"] .d-flex.flex-column.py-3.w-100 {
  text-align: right;
}
</style>

<style lang="scss">
// V2 select menus carried the app text colour (rgb(73, 73, 95)); the global V4 menu rule gives them the theme's on-surface colour.
.v-menu > .v-overlay__content.hosting-plan-menu.hosting-plan-menu {
  color: var(--v-text-base);
}
</style>
