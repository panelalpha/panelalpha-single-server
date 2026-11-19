<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <mask
      id="backup-ftp-mask"
      fill="white"
    >
      <rect
        height="6"
        rx="1"
        width="6"
        x="9"
        y="16"
      />
    </mask>

    <rect
      height="6"
      mask="url(#backup-ftp-mask)"
      rx="1"
      stroke="#797997"
      stroke-width="4"
      width="6"
      x="9"
      y="16"
    />

    <path
      d="M21 19L15 19M9.42857 19L3 19"
      stroke="#797997"
      stroke-linecap="round"
      stroke-width="2"
    />

    <path
      d="M10.875 5.3H20C20.5523 5.3 21 5.74772 21 6.3V12C21 12.5523 20.5523 13 20 13H4C3.44772 13 3 12.5523 3 12V3C3 2.44771 3.44772 2 4 2H10.875"
      stroke="#797997"
      stroke-linecap="round"
      stroke-width="2"
    />

    <path
      d="M12 16V13"
      stroke="#797997"
      stroke-width="2"
    />
  </svg>
</template>

<script lang="ts" setup>
  // The FTP, FTPS and SFTP store driver icon.
  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
  }>(), {
    width: 24,
    height: 24,
  })
</script>
