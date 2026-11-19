<template>
  <svg
    v-if="iconSize === '32'"
    fill="none"
    height="33"
    viewBox="0 0 32 33"
    width="32"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M22.4 24.4209C20.8268 25.9869 18.8226 27.0533 16.6409 27.4851C14.4591 27.917 12.1977 27.695 10.1426 26.8471C8.08757 25.9993 6.33111 24.5638 5.09534 22.7221C3.85957 20.8803 3.19999 18.715 3.19999 16.5C3.19999 14.2851 3.85957 12.1198 5.09534 10.278C6.33111 8.43629 8.08757 7.00076 10.1426 6.15295C12.1977 5.30514 14.4591 5.08313 16.6409 5.51499C18.8226 5.94685 20.8268 7.01318 22.4 8.57916"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M27.2 16.5L17.6 16.5"
      stroke="currentColor"
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
      d="M11.2002 11.9603C10.4136 12.7433 9.41151 13.2765 8.32062 13.4924C7.22974 13.7084 6.09905 13.5974 5.07152 13.1735C4.04398 12.7495 3.16575 12.0318 2.54787 11.1109C1.92999 10.19 1.60019 9.1074 1.60019 7.9999C1.60019 6.8924 1.92999 5.80978 2.54787 4.8889C3.16575 3.96802 4.04398 3.25026 5.07152 2.82635C6.09905 2.40245 7.22974 2.29144 8.32062 2.50737C9.41151 2.7233 10.4136 3.25647 11.2002 4.03946"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <path
      d="M13.6001 8L8.8001 8"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>

  <svg
    v-else
    fill="none"
    height="12"
    viewBox="0 0 12 12"
    width="12"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8.40002 8.97032C7.81008 9.55756 7.05851 9.95744 6.24035 10.1194C5.42218 10.2813 4.57416 10.1981 3.80352 9.88015C3.03287 9.56222 2.37419 9.0239 1.91078 8.33324C1.44737 7.64258 1.20002 6.83061 1.20003 5.99999C1.20003 5.16936 1.44737 4.35739 1.91078 3.66674C2.37419 2.97608 3.03287 2.43775 3.80352 2.11983C4.57416 1.8019 5.42218 1.71864 6.24035 1.88059C7.05851 2.04254 7.81008 2.44241 8.40002 3.02966"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <path
      d="M10.2 6L6.59995 6"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script lang="ts" setup>
  import { getCurrentInstance } from 'vue'

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
