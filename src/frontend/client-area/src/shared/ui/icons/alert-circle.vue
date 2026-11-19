<template>
  <svg
    v-if="iconSize === '16'"
    fill="none"
    height="17"
    viewBox="0 0 16 17"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :clip-path="'url(#' + uid0 + ')'">
      <path
        d="M15.5 8.02002C15.5 12.1622 12.1421 15.52 8 15.52C3.85786 15.52 0.5 12.1622 0.5 8.02002C0.5 3.87788 3.85786 0.52002 8 0.52002C12.1421 0.52002 15.5 3.87788 15.5 8.02002Z"
        stroke="currentColor"
      />
    </g>

    <path
      d="M8 5.02002V8.02002"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1"
    />

    <circle
      cx="8"
      cy="11.02"
      fill="currentColor"
      r="0.5"
      stroke="currentColor"
    />

    <defs>
      <clipPath :id="uid0">
        <rect
          fill="white"
          height="16"
          transform="translate(0 0.0200195)"
          width="16"
        />
      </clipPath>
    </defs>
  </svg>

  <svg
    v-else
    fill="none"
    height="20"
    viewBox="0 0 20 20"
    width="20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="10" cy="10" r="8.5" :stroke="iconColor" />

    <path
      d="M10 6.5V9"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <circle cx="10" cy="13" :fill="iconColor" r="1" />
  </svg>
</template>

<script lang="ts" setup>
  import { getCurrentInstance, useId } from 'vue'

  withDefaults(defineProps<{
    iconColor?: string
  }>(), {
    iconColor: 'currentColor',
  })

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_8354_11778_' + _uid
</script>
