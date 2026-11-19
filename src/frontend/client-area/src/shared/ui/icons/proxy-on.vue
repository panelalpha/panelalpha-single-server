<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8.99274 10.8321C8.89269 11.2014 8.54926 11.4579 8.15807 11.4551L7.30712 11.4492C6.68828 11.45 6.06693 11.6887 5.65552 12.0809C5.26264 12.4554 5 13.1275 5 13.7276C5 14.292 5.289 14.9708 5.70605 15.3684C6.12793 15.7705 6.70447 16 7.30988 16H12.9165C13.6927 16.0005 14.4528 15.7935 15.109 15.4041C15.7649 15.0148 16.2904 14.4596 16.6281 13.804C16.9446 13.1895 17.0564 12.2971 16.9738 11.5206C16.8966 10.7963 16.6078 10.1052 16.1375 9.526C15.6671 8.94656 15.0335 8.50209 14.307 8.24565C13.5804 7.98926 12.792 7.93207 12.0321 8.08114C11.2723 8.23024 10.5741 8.57903 10.016 9.08537C9.48161 9.57004 9.19285 10.0933 8.99274 10.8321Z"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.4"
    />

    <path d="M17 13H22" :stroke="iconColor" stroke-linecap="round" stroke-width="1.4" />
    <path d="M2 13H5" :stroke="iconColor" stroke-linecap="round" stroke-width="1.4" />

    <path
      d="M19.5 15.5L22 13L19.5 10.5"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.4"
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
