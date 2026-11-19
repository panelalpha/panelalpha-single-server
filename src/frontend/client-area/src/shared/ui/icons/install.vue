<template>
  <svg
    v-if="iconSize === '16'"
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.5 11V13.8C2.5 13.9857 2.64487 14.1637 2.90273 14.295C3.16059 14.4263 3.51033 14.5 3.875 14.5H12.125C12.4897 14.5 12.8394 14.4263 13.0973 14.295C13.3551 14.1637 13.5 13.9857 13.5 13.8V11"
      stroke="#07C07E"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1"
    />

    <path
      d="M5.33342 7.33333L8.00008 10L10.6667 7.33333"
      stroke="#07C07E"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1"
    />

    <path
      d="M8 10L8 3"
      stroke="#07C07E"
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
      d="M2.03125 15.5V19.9C2.03125 20.1917 2.29413 20.4715 2.76205 20.6778C3.22998 20.8841 3.86462 21 4.52637 21H19.4971C20.1588 21 20.7935 20.8841 21.2614 20.6778C21.7293 20.4715 21.9922 20.1917 21.9922 19.9V15.5"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M8 10L12 14L16 10"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M12 14L12 3.49999"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />
  </svg>
</template>

<script lang="ts" setup>
  import { getCurrentInstance } from 'vue'

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
