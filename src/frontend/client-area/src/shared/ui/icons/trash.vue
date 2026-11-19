<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 32 32"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 8H6.66667H28"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M10.6667 8.00001V5.33334C10.6667 4.62609 10.9476 3.94782 11.4477 3.44772C11.9478 2.94762 12.6261 2.66667 13.3334 2.66667H18.6667C19.3739 2.66667 20.0522 2.94762 20.5523 3.44772C21.0524 3.94782 21.3334 4.62609 21.3334 5.33334V8.00001M25.3334 8.00001V26.6667C25.3334 27.3739 25.0524 28.0522 24.5523 28.5523C24.0522 29.0524 23.3739 29.3333 22.6667 29.3333H9.33335C8.62611 29.3333 7.94783 29.0524 7.44774 28.5523C6.94764 28.0522 6.66669 27.3739 6.66669 26.6667V8.00001H25.3334Z"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M13.3333 14.6667V22.6667"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M18.6667 14.6667V22.6667"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />
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
