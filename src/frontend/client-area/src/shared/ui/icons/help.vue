<template>
  <svg
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="#797997" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M6 6.00002C6.15674 5.55446 6.52616 5.17875 6.93336 4.93944C7.34056 4.70012 7.81932 4.61264 8.28484 4.69249C8.75036 4.77234 9.1726 5.01436 9.47678 5.3757C9.78095 5.73703 9.94743 6.19436 9.94673 6.66668C9.94673 8.00001 8 9.00002 8 9.00002" stroke="#797997" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M8 11H8.00667" stroke="#797997" stroke-linecap="round" stroke-linejoin="round" />
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
