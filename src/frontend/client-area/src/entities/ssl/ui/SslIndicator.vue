<template>
  <div class="ssl-indicator d-flex align-start">
    <loader
      v-if="fetching"
      color="primary"
      no-margins
      :size="16"
    />

    <template v-else-if="isIcon">
      <v-tooltip
        location="bottom"
        :offset="12"
        open-delay="150"
        transition="custom-tooltip"
        :z-index="99"
      >
        <template #activator="{ props: activatorProps }">
          <v-icon
            v-bind="activatorProps"
            :color="iconState.color"
            :icon="iconState.icon"
            :size="small ? '12' : '16'"
          />

          <span
            v-if="text"
            v-bind="activatorProps"
            :class="textClass"
          >
            {{ text }}
          </span>
        </template>

        <span>{{ t(tooltipKey, sslKeyOptions(tooltipKey)) }}</span>
      </v-tooltip>
    </template>

    <template v-else>
      <span
        v-if="ssl?.certificate_installed"
        class="p-5 font-weight-600 line-16 d-flex align-center"
      >
        <v-icon
          :color="textState.color"
          :icon="textState.icon"
          size="16"
        />

        <span class="heading--text p-3 ml-2 line-16">
          {{ textLabel }}
        </span>
      </span>

      <span
        v-else
        class="text-error font-weight-bold d-flex align-center"
      >
        <v-icon
          color="error"
          icon="$unlock"
          size="16"
        />

        <span class="p-3 ml-2 line-16">{{ t('message.status.disabled') }}</span>
      </span>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { sslKeyOptions } from '@/entities/ssl/ssl-order-status'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { sslIconState, type SslInfo, sslTextState, sslTooltipKey } from './ssl-status'

  const props = withDefaults(defineProps<{
    textClass?: string
    fetching?: boolean
    small?: boolean
    ssl?: SslInfo | null
    text?: string
    isIcon?: boolean
  }>(), {
    textClass: undefined,
    fetching: false,
    small: false,
    ssl: undefined,
    text: '',
    isIcon: true,
  })

  const { t } = useTranslation()

  const iconState = computed(() => sslIconState(props.ssl))
  const textState = computed(() => sslTextState(props.ssl))
  const tooltipKey = computed(() => sslTooltipKey(props.ssl))
  const textLabel = computed(() => {
    const { text } = textState.value
    return text.kind === 'key' ? t(text.value) : text.value
  })
</script>
