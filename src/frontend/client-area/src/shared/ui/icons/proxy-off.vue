<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 19V14.5V14C3 12.067 4.567 10.5 6.5 10.5V10.5H8.5C9.05228 10.5 9.5 10.0523 9.5 9.5V7V7C9.5 5.61929 10.6193 4.5 12 4.5H16.5"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-width="1.6"
    />

    <path
      d="M11.9583 12.8827C11.8416 13.3239 11.4409 13.6302 10.9845 13.6269L9.99171 13.6199C9.26973 13.6208 8.54481 13.9059 8.06483 14.3744C7.60647 14.8217 7.30004 15.6245 7.30004 16.3412C7.30004 17.0154 7.63722 17.8262 8.12378 18.3011C8.61598 18.7814 9.28861 19.0555 9.99493 19.0555H16.5361L16.5368 19.0555C17.4424 19.0561 18.3284 18.8088 19.0939 18.3437C19.8593 17.8787 20.4722 17.2156 20.8662 16.4325C21.2355 15.6985 21.366 14.6326 21.2695 13.7051C21.1796 12.84 20.8426 12.0145 20.294 11.3227C19.7451 10.6306 19.0059 10.0997 18.1583 9.79345C17.3106 9.48716 16.3907 9.41885 15.5043 9.59694C14.6179 9.775 13.8033 10.1916 13.152 10.7964C12.5286 11.3753 12.1917 12.0003 11.9583 12.8827Z"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.6"
    />

    <path
      d="M16 7L18.5 4.5L16 2"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.6"
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
