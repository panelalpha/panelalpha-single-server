<template>
  <svg
    v-if="iconSize === '16'"
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M1 4V10H7"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="stroke"
    />

    <path
      d="M23 20V14H17"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="stroke"
    />

    <path
      d="M20.49 9.00001C19.9828 7.5668 19.1209 6.28542 17.9845 5.27543C16.8482 4.26545 15.4745 3.55978 13.9917 3.22427C12.5089 2.88877 10.9652 2.93436 9.50481 3.35679C8.04437 3.77922 6.71475 4.56473 5.64 5.64001L1 10M23 14L18.36 18.36C17.2853 19.4353 15.9556 20.2208 14.4952 20.6432C13.0348 21.0657 11.4911 21.1113 10.0083 20.7758C8.52547 20.4402 7.1518 19.7346 6.01547 18.7246C4.87913 17.7146 4.01717 16.4332 3.51 15"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="stroke"
    />
  </svg>

  <svg
    v-else-if="iconSize === '16-2'"
    fill="none"
    height="16"
    viewBox="0 0 24 24"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M1 4V10H7"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M23 20V14H17"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M20.49 9.00001C19.9828 7.5668 19.1209 6.28542 17.9845 5.27543C16.8482 4.26545 15.4745 3.55978 13.9917 3.22427C12.5089 2.88877 10.9652 2.93436 9.50481 3.35679C8.04437 3.77922 6.71475 4.56473 5.64 5.64001L1 10M23 14L18.36 18.36C17.2853 19.4353 15.9556 20.2208 14.4952 20.6432C13.0348 21.0657 11.4911 21.1113 10.0083 20.7758C8.52547 20.4402 7.1518 19.7346 6.01547 18.7246C4.87913 17.7146 4.01717 16.4332 3.51 15"
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
      d="M1 4V10H7"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M23 20V14H17"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M20.49 9.00001C19.9828 7.5668 19.1209 6.28542 17.9845 5.27543C16.8482 4.26545 15.4745 3.55978 13.9917 3.22427C12.5089 2.88877 10.9652 2.93436 9.50481 3.35679C8.04437 3.77922 6.71475 4.56473 5.64 5.64001L1 10M23 14L18.36 18.36C17.2853 19.4353 15.9556 20.2208 14.4952 20.6432C13.0348 21.0657 11.4911 21.1113 10.0083 20.7758C8.52547 20.4402 7.1518 19.7346 6.01547 18.7246C4.87913 17.7146 4.01717 16.4332 3.51 15"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />
  </svg>
</template>

<script lang="ts" setup>
  import { getCurrentInstance } from 'vue'

  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    stroke?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    stroke: 1,
    iconColor: 'currentColor',
  })

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
