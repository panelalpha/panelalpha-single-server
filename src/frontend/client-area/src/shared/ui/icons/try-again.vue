<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 16 16"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- <g clip-path="url(#clip0_14494_28107)"> -->
    <path
      d="M0.666748 2.66675V6.66675H4.66675"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M15.3333 13.3333V9.33325H11.3333"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      d="M13.6601 5.99989C13.322 5.04441 12.7473 4.19016 11.9898 3.51683C11.2322 2.84351 10.3164 2.37306 9.32789 2.14939C8.33934 1.92572 7.31024 1.95612 6.33662 2.23774C5.363 2.51936 4.47658 3.04303 3.76008 3.75989L0.666748 6.66655M15.3334 9.33322L12.2401 12.2399C11.5236 12.9567 10.6372 13.4804 9.66354 13.762C8.68992 14.0437 7.66082 14.0741 6.67227 13.8504C5.68372 13.6267 4.76795 13.1563 4.01039 12.4829C3.25284 11.8096 2.67819 10.9554 2.34008 9.99989"
      stroke="#F9F9FB"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />
    <!-- </g> -->
    <!-- <defs>
        <clipPath id="clip0_14494_28107">
        <rect width="16" height="16" fill="white"/>
        </clipPath>
        </defs> -->
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
