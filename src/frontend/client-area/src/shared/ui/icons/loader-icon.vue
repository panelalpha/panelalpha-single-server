<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 20 20"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      class="a6"
      d="M10 1.66663V4.99996"
      opacity="0"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      class="a2"
      d="M10 15V18.3333"
      opacity="0"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      class="a7"
      d="M4.10828 4.10828L6.46661 6.46661"
      opacity="0"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      class="a3"
      d="M13.5333 13.5333L15.8917 15.8917"
      opacity="0"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      class="a8"
      d="M1.66675 10H5.00008"
      opacity="0"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      class="a4"
      d="M15 10H18.3333"
      opacity="0"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      class="a9"
      d="M4.10828 15.8917L6.46661 13.5333"
      opacity="0"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />

    <path
      class="a5"
      d="M13.5333 6.46661L15.8917 4.10828"
      opacity="0"
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

<style scoped lang="scss">
  svg path {
    animation: loader 2.4s linear infinite;
    &.a2 {
      animation-delay: 2.1s;
    }
    &.a3 {
      animation-delay: 1.8s;
    }
    &.a4 {
      animation-delay: 1.5s;
    }
    &.a5 {
      animation-delay: 1.2s;
    }
    &.a6 {
      animation-delay: 0.9s;
    }
    &.a7 {
      animation-delay: 0.6s;
    }
    &.a8 {
      animation-delay: 0.3s;
    }
    &.a9 {
      animation-delay: 0s;
    }
  }

  @keyframes loader {
    0% {
      opacity: 0.1;
    }
    50% {
      opacity: 0.9;
    }
    100% {
      opacity: 0.1;
    }
  }
  </style>
