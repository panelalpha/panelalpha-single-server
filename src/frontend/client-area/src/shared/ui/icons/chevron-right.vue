<template>
  <div>
    <svg
      v-if="iconSize === '32'"
      fill="none"
      height="32"
      viewBox="0 0 32 32"
      width="32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 24L20 16L12 8"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
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
        d="M7.5 15L12.5 10L7.5 5"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <svg
      v-else-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 12L10 8L6 4"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
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
        d="M9 18L15 12L9 6"
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
    iconColor?: string
  }>(), {
    iconColor: 'currentColor',
  })

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
