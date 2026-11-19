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
        d="M13.375 5.5H6.62498C6.06249 5.5 5.5 6.0625 5.5 6.625V13.375C5.5 13.9375 6.06249 14.5 6.62498 14.5H13.375C13.9375 14.5 14.4998 13.9375 14.5 13.375L14.4999 10L14.5 6.625C14.4999 6.0625 13.9373 5.5 13.375 5.5Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M3.5 10.5L2.83333 10.5C2.47971 10.5 2.14057 10.3595 1.89052 10.1095C1.64048 9.85943 1.5 9.52029 1.5 9.16667L1.50008 2.83333C1.50008 2.47971 1.64055 2.14057 1.8906 1.89052C2.14065 1.64048 2.47979 1.5 2.83341 1.5H9.16667C9.52029 1.5 9.85943 1.64048 10.1095 1.89052C10.3595 2.14057 10.5 2.47971 10.5 2.83333V3.5"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
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
        d="M17.3077 8H9.69231C8.75767 8 8 8.75767 8 9.69231V17.3077C8 18.2423 8.75767 19 9.69231 19H17.3077C18.2423 19 19 18.2423 19 17.3077V9.69231C19 8.75767 18.2423 8 17.3077 8Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M4.5 12.8333H3.66667C3.22464 12.8333 2.80072 12.6577 2.48816 12.3452C2.17559 12.0326 2 11.6087 2 11.1667V3.66667C2 3.22464 2.17559 2.80072 2.48816 2.48816C2.80072 2.17559 3.22464 2 3.66667 2H11.1667C11.6087 2 12.0326 2.17559 12.3452 2.48816C12.6577 2.80072 12.8333 3.22464 12.8333 3.66667V4.5"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
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
        d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 22 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5"
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
