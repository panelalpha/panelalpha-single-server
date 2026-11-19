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
        d="M9.33331 25.3333L9.33331 6.66667"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M22.6667 6.66666L22.6667 25.3333"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M4.00002 13.3333L9.33335 6.66667L14.6667 13.3333"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M28 18.6667L22.6666 25.3333L17.3333 18.6667"
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
        d="M4 13L4 3"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />

      <path
        d="M12 2.99999L12 12.3333"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />

      <path
        d="M1 6L4 3L7 6"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />

      <path
        d="M15 10L12 13L9 10"
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
      :viewBox="`0 0 24 24`"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 19L7 5"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M17 5L17 19"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M3 10L7 5L11 10"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M21 14L17 19L13 14"
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
