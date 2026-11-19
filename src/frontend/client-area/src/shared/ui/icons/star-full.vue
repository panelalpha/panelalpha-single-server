<template>
  <svg
    :fill="iconFill"
    height="24"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10.8881 2.12666C11.2377 1.0525 12.7623 1.05251 13.1119 2.12666L14.4578 6.26183C14.8825 7.5666 16.0997 8.44845 17.4715 8.44845H21.8269C22.9628 8.44845 23.4268 9.89429 22.5147 10.5558L18.991 13.1115C17.8802 13.9172 17.4146 15.3462 17.8393 16.6513L19.1852 20.7864C19.5328 21.8542 18.3066 22.7562 17.3856 22.0882L13.862 19.5325C12.7516 18.7272 11.2484 18.7272 10.138 19.5325L6.61438 22.0882C5.69344 22.7562 4.46723 21.8542 4.81476 20.7864L6.16067 16.6513C6.58544 15.3462 6.11979 13.9172 5.00898 13.1115L1.48535 10.5558C0.57324 9.89429 1.03718 8.44845 2.17309 8.44845H6.52854C7.90029 8.44845 9.11754 7.5666 9.54222 6.26183L10.8881 2.12666Z"
      :stroke="iconColor"
      stroke-width="2"
    />
  </svg>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
    iconFill?: string
  }>(), {
    width: 20,
    height: 20,
    iconColor: 'var(--v-primary-base)',
    iconFill: 'var(--v-primary-base)',
  })
</script>
