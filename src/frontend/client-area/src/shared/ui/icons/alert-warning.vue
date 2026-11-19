<template>
  <div>
    <svg
      v-if="iconSize === '12'"
      fill="none"
      height="12"
      viewBox="0 0 12 12"
      width="12"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 6.26995C6 6.26995 5 3.51995 5 3.01995C5 1.66002 7 1.66002 7 3.01995C7 3.51995 6 6.26995 6 6.26995Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <circle cx="6" cy="10" :fill="iconColor" r="1" />
    </svg>

    <svg
      v-else-if="iconSize === '16'"
      fill="none"
      height="17"
      viewBox="0 0 16 17"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.85432 2.65821L1.17957 12.52C1.06257 12.7205 1.00066 12.9478 1.00001 13.1793C0.99935 13.4108 1.05997 13.6384 1.17583 13.8395C1.2917 14.0406 1.45877 14.2082 1.66042 14.3256C1.86207 14.443 2.09128 14.5061 2.32524 14.5087H13.6748C13.9087 14.5061 14.1379 14.443 14.3396 14.3256C14.5412 14.2082 14.7083 14.0406 14.8242 13.8395C14.94 13.6384 15.0006 13.4108 15 13.1793C14.9993 12.9478 14.9374 12.7205 14.8204 12.52L9.14566 2.65821C9.02622 2.46339 8.85805 2.30232 8.65737 2.19053C8.4567 2.07875 8.23029 2.02002 7.99999 2.02002C7.76969 2.02002 7.54328 2.07875 7.3426 2.19053C7.14193 2.30232 6.97376 2.46339 6.85432 2.65821Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M8 6.02002V9.02002"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />

      <circle cx="8" cy="12.02" :fill="iconColor" r="1" />
    </svg>

    <svg
      v-else-if="iconSize === '20'"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.5749 3.21665L1.51656 15C1.37104 15.252 1.29403 15.5377 1.29322 15.8288C1.2924 16.1198 1.3678 16.4059 1.51192 16.6588C1.65603 16.9116 1.86383 17.1223 2.11465 17.2699C2.36547 17.4175 2.65056 17.4968 2.94156 17.5H17.0582C17.3492 17.4968 17.6343 17.4175 17.8851 17.2699C18.136 17.1223 18.3438 16.9116 18.4879 16.6588C18.632 16.4059 18.7074 16.1198 18.7066 15.8288C18.7058 15.5377 18.6288 15.252 18.4832 15L11.4249 3.21665C11.2763 2.97174 11.0672 2.76925 10.8176 2.62872C10.568 2.48819 10.2863 2.41437 9.9999 2.41437C9.71345 2.41437 9.43184 2.48819 9.18223 2.62872C8.93263 2.76925 8.72345 2.97174 8.5749 3.21665V3.21665Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M10 7.5V10.8333"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M10 14.1667H10.0083"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <svg
      v-else-if="iconSize === '24'"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.29 3.85999L1.82002 18C1.64539 18.3024 1.55299 18.6453 1.55201 18.9945C1.55103 19.3437 1.64151 19.6871 1.81445 19.9905C1.98738 20.2939 2.23675 20.5467 2.53773 20.7238C2.83871 20.9009 3.18082 20.9962 3.53002 21H20.47C20.8192 20.9962 21.1613 20.9009 21.4623 20.7238C21.7633 20.5467 22.0127 20.2939 22.1856 19.9905C22.3585 19.6871 22.449 19.3437 22.448 18.9945C22.4471 18.6453 22.3547 18.3024 22.18 18L13.71 3.85999C13.5318 3.5661 13.2807 3.32311 12.9812 3.15447C12.6817 2.98584 12.3438 2.89725 12 2.89725C11.6563 2.89725 11.3184 2.98584 11.0188 3.15447C10.7193 3.32311 10.4683 3.5661 10.29 3.85999V3.85999Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 9V13"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 17H12.01"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <svg
      v-else
      fill="none"
      height="32"
      viewBox="0 0 32 32"
      width="32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.72 5.14667L2.42669 24C2.19385 24.4032 2.07065 24.8604 2.06935 25.326C2.06804 25.7917 2.18868 26.2495 2.41926 26.654C2.64984 27.0586 2.98233 27.3957 3.38364 27.6318C3.78495 27.8679 4.24109 27.9949 4.70669 28H27.2934C27.759 27.9949 28.2151 27.8679 28.6164 27.6318C29.0177 27.3957 29.3502 27.0586 29.5808 26.654C29.8114 26.2495 29.932 25.7917 29.9307 25.326C29.9294 24.8604 29.8062 24.4032 29.5734 24L18.28 5.14667C18.0423 4.75481 17.7077 4.43082 17.3083 4.20598C16.9089 3.98113 16.4583 3.86301 16 3.86301C15.5417 3.86301 15.0911 3.98113 14.6918 4.20598C14.2924 4.43082 13.9577 4.75481 13.72 5.14667V5.14667Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M16 12V17.3333"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M16 22.6667H16.0133"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
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
