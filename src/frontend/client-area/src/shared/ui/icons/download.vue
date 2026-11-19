<template>
  <svg
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M14.4993 9.5L14.4991 13.1745C14.4991 13.5281 14.3586 13.8672 14.1086 14.1173C13.8585 14.3673 13.5194 14.5078 13.1658 14.5078L2.83138 14.5078C2.47776 14.5078 2.13862 14.3673 1.88857 14.1173C1.63852 13.8672 1.49805 13.5281 1.49805 13.1745L1.49927 9.5" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M4.5 6.5L8 10.5L11.5 6.5" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M8 10V1.5" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    iconColor?: string
  }>(), {
    iconColor: 'currentColor',
  })
</script>
