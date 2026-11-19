<template>
  <div>
    <svg
      v-if="useSmallDrawing"
      fill="none"
      height="16"
      viewBox="0 0 17 16"
      width="17"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.5 3.19995L8.49988 12.8"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.6"
      />

      <path
        d="M3.69995 8H13.3"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.6"
      />
    </svg>

    <svg
      v-else
      fill="none"
      :height="height"
      viewBox="0 0 24 24"
      :width="width"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 5V19"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M5 12H19"
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
  const useSmallDrawing = String(vIconSize) === '16'
</script>
