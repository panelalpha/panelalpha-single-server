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
        <use transform="scale(0.0104167)" xlink:href="#image0_6514_4647" />
      </pattern>

      <image
        id="image0_6514_4647"
        height="96"
        preserveAspectRatio="none"
        width="96"
        xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABGUlEQVR4Ae3BsUmdAQBG0evFiE0gS2QDl3i26RxGSIZJl1YhZIS3gUsIlim0FRzg45d7zsXLj++vHM/j1z9Pt7zz89/VA3DiYCRTkinJlGRKMiWZkkxJpiRTkinJlGRKMiWZkkxJpiRTkinJlGRKMiWZkkxJpiRTkinJlGRKMiWZkkxJpiRTkinJlGRKMiWZkkxJpiRTkinJlGTqEnjkeM58dCZJkgO5+PL7+YHjOf+/+3bPO69/r38BNxzMJXDic7gBThyMZEoyJZmSTEmmJFOSKcmUZEoyJZmSTEmmJFOSKcmUZEoyJZmSTEmmJFOSKcmUZEoyJZmSTEmmJFOSKcmUZEoyJZmSTEmmJFOSKcmUZEoyJZmSTL0BJOsSifJybGQAAAAASUVORK5CYII="
      />
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'pattern0_6514_4647_' + _uid
</script>
