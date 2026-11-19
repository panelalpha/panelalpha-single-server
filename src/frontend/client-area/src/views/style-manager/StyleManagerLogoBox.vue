<template>
  <div
    class="upload-img"
    :class="[fileData ? 'upload-img--done' : '']"
  >
    <div class="upload-img__content">
      <!-- Legacy had `accepts="image/*"` (a typo, so any file was accepted); `accept` restricts the picker as intended. -->
      <input
        ref="fileInput"
        accept="image/*"
        class="file-input"
        :data-testid="`style-manager-logo-input-${type}`"
        type="file"
        @change="uploadFile"
      >

      <div
        v-if="!fileData"
        class="upload-img__icon"
      >
        <v-icon size="24">
          $backup
        </v-icon>
      </div>

      <div
        v-if="fileData"
        class="upload-img__text"
        :class="previewClass"
      >
        <!-- Legacy rendered SVG markup through `v-html`; every logo is an `img` here. -->
        <img
          alt=""
          class="upload-img__preview-img"
          :src="previewSrc"
        >
      </div>

      <div
        v-if="fileData"
        class="upload-img__control-btns"
      >
        <AppButton
          :aria-label="t('button.replace')"
          :data-testid="`style-manager-logo-replace-${type}`"
          kind="text"
          size="x-small"
          @click="replaceFile"
        >
          <v-icon
            class="mr-0"
            size="16"
          >
            $restore
          </v-icon>
        </AppButton>

        <AppButton
          :aria-label="t('button.remove')"
          :data-testid="`style-manager-logo-remove-${type}`"
          kind="text"
          size="x-small"
          @click="clearFile"
        >
          <v-icon
            class="mr-0"
            size="16"
          >
            $thrash
          </v-icon>
        </AppButton>
      </div>
    </div>

    <p class="mt-3 mb-0 text--darken2 font-weight-bold">
      {{ text }}
    </p>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { resolveBrandLogoSrc } from '@/shared/ui/logo/brand-logo'
  import { isImageTooLarge, readImageAsDataUrl } from './image-upload'

  const props = defineProps<{
    fileData?: string | false | null
    text?: string
    type: 'light' | 'dark'
  }>()

  const emit = defineEmits<{
    'update:file-data': [data: string | null]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const themeStore = useThemeStore()

  const fileInput = ref<HTMLInputElement | null>(null)

  const previewSrc = computed(() => resolveBrandLogoSrc({ logo: props.fileData }, false))

  // Legacy inline style: a light logo on the dark theme sits on white, a dark logo on the light theme on
  // `secondary-darken2`. The background is a class on the preview box; the colours are the `--v-white-base` and `--v-secondary-darken2` tokens.
  const previewClass = computed(() => {
    if (props.type === 'light' && themeStore.isDark) {
      return 'upload-img__text--white'
    }
    if (props.type === 'dark' && !themeStore.isDark) {
      return 'upload-img__text--dark-bg'
    }
    return ''
  })

  async function uploadFile (event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      return
    }
    if (isImageTooLarge(file)) {
      alerts.addAlert({ success: false, errorMessage: t('notification.style.image.tooLarge') })
      input.value = ''
      return
    }
    try {
      emit('update:file-data', await readImageAsDataUrl(file))
    } catch {
      // Legacy never answered an image that failed to load: nothing changes.
    }
    // Lets the same file be picked again after Remove.
    input.value = ''
  }

  function clearFile () {
    if (fileInput.value) {
      fileInput.value.value = ''
    }
    emit('update:file-data', null)
  }

  function replaceFile () {
    fileInput.value?.click()
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;
@use './upload-img';

.upload-img {
  position: relative;
  width: 100%;
  flex-grow: 1;
  min-width: 100px;

  .upload-img__content {
    cursor: pointer;
    transition: border-color 0.24s ease, color 0.24s ease;

    &:hover {
      border-color: map.get(v.$success, base);
      color: map.get(v.$success, base);

      .upload-img__icon {
        .v-icon {
          color: map.get(v.$success, base) !important;
        }
      }
    }
  }

  &.upload-img--done {
    .upload-img {
      &__content {
        border: 1px solid map.get(v.$gray, lighten3);
        max-height: unset;
        height: fit-content;
      }
    }

    .v-btn {
      min-width: unset;

      &:nth-child(2) {
        border-left: 1px solid map.get(v.$gray, lighten3);
      }

      &:hover {
        .v-icon :deep(svg) {
          color: map.get(v.$success, base) !important;
        }
      }
    }

    .upload-img {
      &__text {
        width: calc(100% - 4px);
        display: flex;
        justify-content: center;
        align-items: center;
        height: calc(100% - 4px);
        min-height: 75px;
      }

      &__control-btns {
        display: flex;
        width: 100%;
      }

      &__text--white {
        background-color: var(--v-white-base);
      }

      &__text--dark-bg {
        background-color: var(--v-secondary-darken2);
      }
    }
  }

  &__content {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 75px;
    border: 1px dashed map.get(v.$gray, lighten3);
    border-radius: 8px;
    flex-direction: column;
    position: relative;
  }

}
</style>
