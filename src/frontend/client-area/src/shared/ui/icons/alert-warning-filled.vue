<template>
  <div>
    <svg
      v-if="iconSize === '16'"

      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.85432 2.63819L1.17957 12.5C1.06257 12.7005 1.00066 12.9278 1.00001 13.1592C0.99935 13.3907 1.05997 13.6184 1.17583 13.8195C1.2917 14.0206 1.45877 14.1882 1.66042 14.3056C1.86207 14.423 2.09128 14.4861 2.32524 14.4886H13.6748C13.9087 14.4861 14.1379 14.423 14.3396 14.3056C14.5412 14.1882 14.7083 14.0206 14.8242 13.8195C14.94 13.6184 15.0006 13.3907 15 13.1592C14.9993 12.9278 14.9374 12.7005 14.8204 12.5L9.14566 2.63819C9.02622 2.44337 8.85805 2.2823 8.65737 2.17051C8.4567 2.05873 8.23029 2 7.99999 2C7.76969 2 7.54328 2.05873 7.3426 2.17051C7.14193 2.2823 6.97376 2.44337 6.85432 2.63819Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M8 6V9"
        stroke="white"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <circle cx="8" cy="12" fill="white" r="1" />
    </svg>

    <svg
      v-else
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.52699 3.2637L1.23089 14.9432C1.08046 15.2009 1.00086 15.4931 1.00002 15.7908C0.99918 16.0884 1.07712 16.3811 1.22609 16.6397C1.37506 16.8982 1.58986 17.1137 1.84913 17.2647C2.1084 17.4156 2.40309 17.4967 2.7039 17.5H17.2961C17.5969 17.4967 17.8916 17.4156 18.1509 17.2647C18.4102 17.1137 18.625 16.8982 18.7739 16.6397C18.9229 16.3811 19.0009 16.0884 19 15.7908C18.9992 15.4931 18.9196 15.2009 18.7691 14.9432L11.473 3.2637C11.3194 3.01322 11.1032 2.80613 10.8452 2.66241C10.5872 2.51868 10.2961 2.44318 10 2.44318C9.7039 2.44318 9.4128 2.51868 9.15479 2.66241C8.89678 2.80613 8.68056 3.01322 8.52699 3.2637Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M10 7.5V10"
        stroke="white"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <circle cx="10" cy="14" fill="white" r="1" />
    </svg>
  </div>
</template>

<script lang="ts" setup>
  import { getCurrentInstance } from 'vue'

  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
