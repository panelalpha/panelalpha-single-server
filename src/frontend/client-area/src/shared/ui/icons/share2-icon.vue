<template>
  <div>
    <svg
      v-if="iconSize === '24'"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 12V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V12"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M16 6L12 2L8 6"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 2V15"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>
  </div>
</template>

<script lang="ts" setup>
  import { getCurrentInstance } from 'vue'

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
