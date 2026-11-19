<template>
  <div class="no-data">
    <div class="nodata-container w-100 d-flex align-center justify-center">
      <EmptyState
        :desc="description"
        :title="title"
        variant="card"
      >
        <template #image>
          <svg
            fill="none"
            height="65"
            viewBox="0 0 64 65"
            width="64"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M50 11.02L46 7.02002"
              stroke="#B0B0D3"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />

            <path
              d="M46 11.02L50 7.02002"
              stroke="#B0B0D3"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />

            <path
              d="M10.0739 45.2266V52.7674C10.0739 52.7674 10.0739 52.805 10.0739 52.8237C10.0739 55.6938 18.5675 58.0198 29.0369 58.0198C39.5063 58.0198 47.9446 55.7125 48 52.8425V44.9452L47.483 44.3262L10.0739 45.2078V45.2266Z"
              fill="white"
              stroke="#B0B0D3"
              stroke-miterlimit="10"
              stroke-width="2"
            />

            <path
              d="M29.0369 49.9913C39.5099 49.9913 48 47.6649 48 44.7952C48 41.9255 39.5099 39.5991 29.0369 39.5991C18.5639 39.5991 10.0739 41.9255 10.0739 44.7952C10.0739 47.6649 18.5639 49.9913 29.0369 49.9913Z"
              fill="white"
              stroke="#B0B0D3"
              stroke-miterlimit="10"
              stroke-width="2"
            />

            <path
              d="M10.0739 33.5781V41.0064C10.0739 41.0064 10.0739 41.044 10.0739 41.0627C10.0739 43.9328 18.5675 46.2588 29.0369 46.2588C39.5063 46.2588 47.9446 43.9515 48 41.0815V33.5781H10.0739Z"
              fill="#EEEEF4"
              stroke="#77849F"
              stroke-miterlimit="10"
              stroke-width="2"
            />

            <path
              d="M29.0369 38.23C39.5099 38.23 48 35.9037 48 33.034C48 30.1643 39.5099 27.8379 29.0369 27.8379C18.5639 27.8379 10.0739 30.1643 10.0739 33.034C10.0739 35.9037 18.5639 38.23 29.0369 38.23Z"
              fill="#EEEEF4"
              stroke="#77849F"
              stroke-miterlimit="10"
              stroke-width="2"
            />

            <path
              d="M47.9261 21.6475L10 21.7037V29.1883C10 29.1883 10 29.2259 10 29.2446C10 32.1146 18.4937 34.4407 28.9631 34.4407C39.3955 34.4407 47.8707 32.1334 47.9261 29.2634V21.6475Z"
              fill="white"
              stroke="#B0B0D3"
              stroke-miterlimit="10"
              stroke-width="2"
            />

            <path
              d="M28.9631 26.4122C39.4361 26.4122 47.9261 24.0858 47.9261 21.2161C47.9261 18.3464 39.4361 16.02 28.9631 16.02C18.4901 16.02 10 18.3464 10 21.2161C10 24.0858 18.4901 26.4122 28.9631 26.4122Z"
              fill="white"
              stroke="#B0B0D3"
              stroke-miterlimit="10"
              stroke-width="2"
            />

            <path
              d="M44.0551 41.02C44.5988 41.02 45.0395 40.5723 45.0395 40.02C45.0395 39.4677 44.5988 39.02 44.0551 39.02C43.5115 39.02 43.0708 39.4677 43.0708 40.02C43.0708 40.5723 43.5115 41.02 44.0551 41.02Z"
              fill="#77849F"
            />

            <path
              d="M44.0551 53.02C44.5988 53.02 45.0395 52.5723 45.0395 52.02C45.0395 51.4677 44.5988 51.02 44.0551 51.02C43.5115 51.02 43.0708 51.4677 43.0708 52.02C43.0708 52.5723 43.5115 53.02 44.0551 53.02Z"
              fill="#B0B0D3"
            />

            <path
              d="M44.0551 29.02C44.5988 29.02 45.0395 28.5723 45.0395 28.02C45.0395 27.4677 44.5988 27.02 44.0551 27.02C43.5115 27.02 43.0708 27.4677 43.0708 28.02C43.0708 28.5723 43.5115 29.02 44.0551 29.02Z"
              fill="#B0B0D3"
            />

            <path
              d="M58 20.02C59.1046 20.02 60 19.1246 60 18.02C60 16.9155 59.1046 16.02 58 16.02C56.8954 16.02 56 16.9155 56 18.02C56 19.1246 56.8954 20.02 58 20.02Z"
              stroke="#77849F"
              stroke-linecap="round"
              stroke-miterlimit="10"
              stroke-width="2"
            />
          </svg>
        </template>

        <template
          v-if="btnDownload"
          #action
        >
          <AppButton
            v-if="btnDownload"
            kind="primary"
            size="large"
            @click="emit('download')"
          >
            <v-icon
              color="white"
              icon="$downloadcloud"
              size="24"
            />

            {{ t('button.download') + ' ' }}
          </AppButton>
        </template>
      </EmptyState>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The title and the subtitle are props here (legacy named slots), and Download emits `download` (legacy `download-logs`).
  // The inline SVG is kept, not `NoDataTableLogs`.
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'

  const { t } = useTranslation()

  withDefaults(defineProps<{
    title: string
    description: string
    btnDownload?: boolean
  }>(), {
    btnDownload: false,
  })

  const emit = defineEmits<{
    download: []
  }>()
</script>

<style lang="scss" scoped>
.nodata-container {
  height: 100%;
}
</style>
