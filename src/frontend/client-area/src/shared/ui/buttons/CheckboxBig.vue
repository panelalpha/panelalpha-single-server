<template>
  <label
    class="checkbox-big"
    :class="{ 'checkbox-big--checked': checked }"
  >
    <!-- A native radio: the cards of a group share `name`, so the browser gives them one tab stop, arrow keys and Space. -->
    <input
      :checked="checked"
      class="checkbox-big__input"
      :name="name"
      type="radio"
      :value="value"
      @change="emit('check', !checked)"
      @click.stop
    >

    <div class="checkbox-big__check">
      <v-icon
        icon="$check"
        size="14"
      />
    </div>

    <v-img
      v-if="img && !hasDefaultSlot"
      class="checkbox-big__icon"
      height="48px"
      :src="img"
      width="48px"
    />

    <div
      v-else-if="hasDefaultSlot"
      class="checkbox-big__icon"
    >
      <slot />
    </div>

    <span class="checkbox-big__title">
      {{ title }}
    </span>

    <slot name="custom" />
  </label>
</template>

<script lang="ts" setup>
  import { computed, useSlots } from 'vue'

  /**
   * A selectable card; the check mark sits in the corner when checked.
   * The card is a radio button of the group `name`: the label clicks it, and the arrow keys and Space reach it.
   */
  defineProps<{
    checked?: boolean
    img?: string
    name: string
    title?: string
    value?: string
  }>()

  const emit = defineEmits<{ check: [checked: boolean] }>()
  const slots = useSlots()
  const hasDefaultSlot = computed(() => !!slots.default)
</script>

<style lang="scss" scoped>
  .checkbox-big {
    position: relative;
    display: flex;
    min-width: 60px;
    padding: 16px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--v-gray-lighten2);
    border-radius: 4px;
    cursor: pointer;
    transition: border 0.24s ease;

    &::after {
      position: absolute;
      width: calc(100% + 2px);
      height: calc(100% + 2px);
      border: 2px solid transparent;
      border-radius: 4px;
      content: "";
      transition: border 0.24s ease;
    }

    &:hover,
    &--checked {
      border: 1px solid transparent;

      &::after {
        border: 2px solid rgb(var(--v-theme-primary));
      }
    }

    /* Visually hidden, still focusable: the card is the visible part of this control. */
    &__input {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    // A visible ring for keyboard focus (a checked card already paints the primary border, so the ring sits outside it).
    &:has(.checkbox-big__input:focus-visible) {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
    }

    &__icon {
      max-width: 64px;
      max-height: 64px;
      margin-bottom: 16px;
    }

    &__title {
      // The legacy `$text: headings` is `--v-text-darken2`.
      color: var(--v-text-darken2);
      font-size: 14px;
      font-weight: 700;
      line-height: 20px;
    }

    &__check {
      position: absolute;
      top: 0;
      right: 0;
      width: 32px;
      height: 32px;
      overflow: hidden;
      opacity: 0;
      transition: opacity 0.24s ease;

      .v-icon {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 999;
        color: var(--v-white-base);
      }

      &::after {
        position: absolute;
        top: -24px;
        left: 13px;
        width: 48px;
        height: 48px;
        background: rgb(var(--v-theme-primary));
        transform: rotate(45deg);
        transform-origin: center center;
        content: "";
      }
    }

    &--checked &__check {
      opacity: 1;
    }
  }

  // In RTL (legacy `.v-application--is-rtl`) the corner mark moves to the left edge.
  [dir=rtl] .checkbox-big__check {
    left: 1px;
    top: 1px;
    right: unset;
    rotate: 270deg;

    .v-icon {
      rotate: 90deg;
    }
  }
</style>
