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
        d="M9.11111 6H2.88889C2.39797 6 2 6.40701 2 6.90909V10.0909C2 10.593 2.39797 11 2.88889 11H9.11111C9.60203 11 10 10.593 10 10.0909V6.90909C10 6.40701 9.60203 6 9.11111 6Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M4 5V3.66741C3.9995 3.25433 4.18516 2.85582 4.52096 2.54926C4.85675 2.2427 5.31872 2.04995 5.81717 2.00844C6.31563 1.96692 6.81501 2.0796 7.21837 2.3246C7.62174 2.5696 8 2.99944 8 3.49916V5"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <svg
      v-else-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.7778 7H3.22222C2.54721 7 2 7.65122 2 8.45455V13.5455C2 14.3488 2.54721 15 3.22222 15H11.7778C12.4528 15 13 14.3488 13 13.5455V8.45455C13 7.65122 12.4528 7 11.7778 7Z"
        :fill="iconColor"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />

      <path
        d="M4 7.00336V4.33669C3.99917 3.51006 4.30552 2.7126 4.85958 2.09914C5.41365 1.48567 6.17589 1.09996 6.99834 1.01688C7.82079 0.933808 8.64477 1.15929 9.31032 1.64957C9.97587 2.13984 10.6 3 10.6 4V7.00336"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1"
      />
    </svg>

    <svg
      v-else
      fill="none"
      :height="height"
      viewBox="0 0 24 24"
      :width="width"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19 11H5C3.89543 11 3 11.8954 3 13V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V13C21 11.8954 20.1046 11 19 11Z"
        :fill="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11"
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
