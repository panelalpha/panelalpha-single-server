<template>
  <svg
    fill="none"
    height="24"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
  >
    <rect
      :fill="'url(#' + uid0 + ')'"
      height="20.5714"
      width="20.5714"
      x="1.71429"
      y="1.71423"
    />

    <defs>
      <pattern :id="uid0" height="1" patternContentUnits="objectBoundingBox" width="1">
        <use transform="scale(0.0104167)" xlink:href="#image0_6514_4625" />
      </pattern>

      <image
        id="image0_6514_4625"
        height="96"
        preserveAspectRatio="none"
        width="96"
        xlink:href="data:image/png;base64,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"
      />
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'pattern0_6514_4625_' + _uid
</script>
