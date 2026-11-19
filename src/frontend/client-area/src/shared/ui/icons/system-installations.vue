<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 22 22"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M21.0834 11.9166H0.916748"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.375"
    />

    <path
      d="M16.8615 3.95911C17.1803 4.15009 17.4377 4.42321 17.6047 4.74774L21.0834 11.4583V17.3021C21.0834 17.8187 20.8709 18.3141 20.4927 18.6794C20.1145 19.0448 19.6016 19.25 19.0667 19.25H2.93341C2.39856 19.25 1.88561 19.0448 1.50742 18.6794C1.12922 18.3141 0.916748 17.8187 0.916748 17.3021V11.4583L4.3955 4.74774C4.56245 4.42321 4.81983 4.15009 5.13868 3.95911"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.375"
    />

    <circle
      cx="4.13672"
      cy="15.8099"
      fill="#939EB3"
      r="0.6875"
    />

    <circle
      cx="6.88672"
      cy="15.8099"
      fill="#939EB3"
      r="0.6875"
    />

    <path
      d="M11 0.916707L11 7.33337"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.375"
    />

    <path
      d="M13.75 5.5L11 8.25L8.25 5.5"
      :stroke="iconColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.375"
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
