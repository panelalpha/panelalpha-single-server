<template>
  <svg
    :height="height"
    version="1.1"
    viewBox="0 0 128 128"
    :width="width"
    x="0px"
    xml:space="preserve"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    y="0px"
  >
    <g id="_x31_6">
      <polygon
        points="36.465,80.36 63.104,95.274 90.401,80.36 63.433,66.57 "
        style="fill:#D8D8D8;"
      />

      <path
        d="M64,0L7.01,31.008v65.971L64,128l56.99-31.022V31.008L64,0z M64,4.683l50.714,27.616L92.261,45.276
        L64,29.895l-28.275,15.38L13.272,32.299L64,4.683z M40.064,80.403L64,67.825L87.922,80.39L64,93.408L40.064,80.403z M37.757,76.943
        V48.86L61.94,35.704V64.24L37.757,76.943z M66.06,64.254v-28.55L90.229,48.86v28.083L66.06,64.254z M11.13,35.8l22.507,13.032
        v32.752L61.94,96.978v25.199L11.13,94.534V35.8z M116.87,94.534l-50.81,27.643V96.978l28.289-15.394V48.833L116.87,35.8V94.534z"
        style="fill:#232323;"
      />
    </g>
  </svg>
</template>

<script lang="ts" setup>
  // The S3 store driver icon.
  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
  }>(), {
    width: 24,
    height: 24,
  })
</script>
