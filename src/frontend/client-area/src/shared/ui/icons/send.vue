<template>
  <div>
    <svg
      v-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 20 20"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18.3334 1.66669L9.16675 10.8334"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />

      <path
        d="M18.3334 1.66669L12.5001 18.3334L9.16675 10.8334L1.66675 7.50002L18.3334 1.66669Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />
    </svg>

    <svg
      v-else-if="iconSize === '20'"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18.3334 1.66669L9.16675 10.8334"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M18.3334 1.66669L12.5001 18.3334L9.16675 10.8334L1.66675 7.50002L18.3334 1.66669Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <svg
      v-else
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22 2L11 13"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>
  </div>
</template>

<script lang="ts" setup>
  import { getCurrentInstance } from 'vue'

  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
