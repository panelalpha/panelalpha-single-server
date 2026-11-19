<template>
  <div>
    <svg
      v-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.69201 2.39599C9.94556 2.14244 10.2894 2 10.648 2C11.0066 2 11.3505 2.14244 11.604 2.39599C11.8576 2.64954 12 2.99342 12 3.35199C12 3.71056 11.8576 4.05444 11.604 4.30799L5.54934 10.3627L3 11L3.63733 8.45066L9.69201 2.39599Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M3 14H14"
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
        d="M2 21H22"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12.5 3.5C12.8978 3.10217 13.4374 2.87868 14 2.87868C14.5626 2.87868 15.1022 3.10217 15.5 3.5C15.8978 3.89782 16.1213 4.43739 16.1213 5C16.1213 5.56261 15.8978 6.10217 15.5 6.5L6 16L2 17L3 13L12.5 3.5Z"
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
