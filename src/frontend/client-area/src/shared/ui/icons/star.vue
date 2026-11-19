<template>
  <svg
    fill="none"
    height="21"
    viewBox="0 0 20 21"
    width="20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      class="star-filled"
      d="M9.04894 2.94707C9.3483 2.02576 10.6517 2.02576 10.9511 2.94707L12.0206 6.23887C12.1545 6.65089 12.5385 6.92985 12.9717 6.92985H16.4329C17.4016 6.92985 17.8044 8.16947 17.0207 8.73887L14.2205 10.7733C13.87 11.028 13.7234 11.4793 13.8572 11.8913L14.9268 15.1831C15.2261 16.1045 14.1717 16.8706 13.388 16.3012L10.5878 14.2667C10.2373 14.0121 9.7627 14.0121 9.41221 14.2667L6.61204 16.3012C5.82833 16.8706 4.77385 16.1044 5.0732 15.1831L6.14277 11.8913C6.27665 11.4793 6.12999 11.028 5.7795 10.7733L2.97933 8.73887C2.19562 8.16946 2.59839 6.92985 3.56712 6.92985H7.02832C7.46154 6.92985 7.8455 6.65089 7.97937 6.23887L9.04894 2.94707Z"
      stroke-width="2"
    />

    <mask
      :id="uid0"
      height="17"
      maskUnits="userSpaceOnUse"
      style="mask-type: alpha"
      width="18"
      x="1"
      y="1"
    >
      <path
        class="star-mask"
        d="M9.04894 2.94707C9.3483 2.02576 10.6517 2.02576 10.9511 2.94707L12.0206 6.23887C12.1545 6.65089 12.5385 6.92985 12.9717 6.92985H16.4329C17.4016 6.92985 17.8044 8.16947 17.0207 8.73887L14.2205 10.7733C13.87 11.028 13.7234 11.4793 13.8572 11.8913L14.9268 15.1831C15.2261 16.1045 14.1717 16.8706 13.388 16.3012L10.5878 14.2667C10.2373 14.0121 9.7627 14.0121 9.41221 14.2667L6.61204 16.3012C5.82833 16.8706 4.77385 16.1044 5.0732 15.1831L6.14277 11.8913C6.27665 11.4793 6.12999 11.028 5.7795 10.7733L2.97933 8.73887C2.19562 8.16946 2.59839 6.92985 3.56712 6.92985H7.02832C7.46154 6.92985 7.8455 6.65089 7.97937 6.23887L9.04894 2.94707Z"
        stroke-width="2"
      />
    </mask>

    <g :mask="'url(#' + uid0 + ')'">
      <rect
        class="star-empty"
        height="20"
        :width="`${(1 - filled) * 100}%`"
        :x="20 * filled"
        y="0.0200195"
      />
    </g>
  </svg>
</template>

<script lang="ts" setup>
  // The part from `percent` to the right is grey, the part before it stays yellow. Without `percent`
  // the star is empty (the `$starIcon` alias renders it that way).
  import { computed, useId } from 'vue'

  const props = withDefaults(defineProps<{
    /** Share of the star that is filled, 0 to 1. */
    percent?: number
  }>(), {
    percent: 0,
  })

  const filled = computed(() => Math.min(1, Math.max(0, props.percent)))

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'mask0_7366_16067_' + _uid
</script>

<style lang="scss" scoped>
  // Colours from the global tokens (themes-variables.scss `--v-star-*`): the same in both themes.
  .star-filled {
    stroke: var(--v-star-filled);
  }

  .star-mask {
    stroke: var(--v-star-mask);
  }

  .star-empty {
    fill: var(--v-star-empty);
  }
</style>
