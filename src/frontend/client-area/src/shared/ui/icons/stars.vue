<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 20 20"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :clip-path="'url(#' + uid0 + ')'">
      <path
        d="M13.8389 2.44929L14.0547 1.84862L14.2705 2.44929C14.712 3.67839 15.6796 4.64596 16.9087 5.08751L17.5094 5.3033L16.9087 5.51909C15.6796 5.96064 14.712 6.92821 14.2705 8.15731L14.0547 8.75799L13.8389 8.15731C13.3973 6.92821 12.4298 5.96064 11.2007 5.51909L10.6 5.3033L11.2007 5.08751C12.4298 4.64596 13.3973 3.67839 13.8389 2.44929Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linejoin="round"
        stroke-width="1.25"
      />

      <path
        d="M6.6231 8.98511L7.39062 6.84862L8.15815 8.98511C8.5997 10.2142 9.56727 11.1818 10.7964 11.6233L12.9329 12.3909L10.7964 13.1584C9.56727 13.5999 8.5997 14.5675 8.15815 15.7966L7.39062 17.9331L6.6231 15.7966C6.18155 14.5675 5.21398 13.5999 3.98488 13.1584L1.84838 12.3909L3.98487 11.6233C5.21398 11.1818 6.18155 10.2142 6.6231 8.98511Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linejoin="round"
        stroke-width="1.25"
      />

      <path
        d="M14.2535 16.0861C15.0922 15.6642 15.7734 14.983 16.1953 14.1443C16.6172 14.983 17.2984 15.6642 18.1371 16.0861C17.2984 16.508 16.6172 17.1892 16.1953 18.0279C15.7734 17.1892 15.0922 16.508 14.2535 16.0861Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linejoin="round"
        stroke-width="1.25"
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

  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_12824_217222_' + _uid
</script>
