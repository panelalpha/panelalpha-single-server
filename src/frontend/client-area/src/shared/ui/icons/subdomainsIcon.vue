<template>
  <svg
    fill="none"
    height="20"
    viewBox="0 0 20 20"
    width="20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :clip-path="'url(#' + uid0 + ')'">
      <path
        d="M9.99996 18.3334C14.6023 18.3334 18.3333 14.6025 18.3333 10.0001C18.3333 5.39771 14.6023 1.66675 9.99996 1.66675C5.39759 1.66675 1.66663 5.39771 1.66663 10.0001C1.66663 14.6025 5.39759 18.3334 9.99996 18.3334Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M1.66663 10H18.3333"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M9.99996 1.66675C12.0844 3.94871 13.2689 6.91011 13.3333 10.0001C13.2689 13.0901 12.0844 16.0515 9.99996 18.3334C7.91556 16.0515 6.731 13.0901 6.66663 10.0001C6.731 6.91011 7.91556 3.94871 9.99996 1.66675V1.66675Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </g>

    <defs>
      <clipPath :id="uid0">
        <rect fill="white" height="20" width="20" />
      </clipPath>
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_9534_14185_' + _uid
</script>
