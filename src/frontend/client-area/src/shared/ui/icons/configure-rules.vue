<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 20 20"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10.875 2H4.75C4.28587 2 3.84075 2.16857 3.51256 2.46863C3.18437 2.76869 3 3.17565 3 3.6V16.4C3 16.8243 3.18437 17.2313 3.51256 17.5314C3.84075 17.8314 4.28587 18 4.75 18H15.25C15.7141 18 16.1592 17.8314 16.4874 17.5314C16.8156 17.2313 17 16.8243 17 16.4V7.6V4C17 2.89543 16.1046 2 15 2H10.875Z"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path d="M8.96289 6H14.0471" :stroke="iconColor" stroke-linecap="round" stroke-width="2" />
    <path d="M8.96289 10H14.0471" :stroke="iconColor" stroke-linecap="round" stroke-width="2" />
    <path d="M8.96289 14H14.0471" :stroke="iconColor" stroke-linecap="round" stroke-width="2" />
    <circle cx="6" cy="6" :fill="iconColor" r="1" />
    <circle cx="6" cy="10" :fill="iconColor" r="1" />
    <circle cx="6" cy="14" :fill="iconColor" r="1" />
  </svg>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })
</script>
