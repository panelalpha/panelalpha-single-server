<template>
  <div
    @drag.prevent
    @dragleave.prevent="hovering = false"
    @dragover.prevent="hovering = true"
    @drop.prevent="onDrop"
  >
    <v-form>
      <div
        class="upload-img"
        :class="[
          faviconData ? 'upload-img--done' : '',
          hovering ? 'upload-img--hover' : '',
        ]"
      >
        <!-- Legacy accept="image/*" here (the typo `accepts` was only in the logo box). -->
        <input
          ref="fileInput"
          accept="image/*"
          class="file-input"
          data-testid="style-manager-favicon-input"
          type="file"
          @change="uploadFile"
        >

        <div class="upload-img__content">
          <div
            v-if="!faviconData"
            class="upload-img__icon"
          >
            <v-icon size="24">
              $backup
            </v-icon>
          </div>

          <div class="upload-img__text">
            <template v-if="faviconData">
              <img
                alt=""
                class="upload-img__preview-img"
                :src="faviconData"
              >
            </template>

            <template v-else>
              <p class="p-3 mb-0 font-weight-bold text--darken2">
                {{ t('form.label.image.title') }}
              </p>

              <p class="p-5 mb-0 font-weight-regular gray-darken-text">
                {{ t('form.label.image.subtitle') }}
              </p>
            </template>
          </div>
        </div>

        <div
          v-if="faviconData"
          class="upload-img__control-btns"
        >
          <AppButton
            data-testid="style-manager-favicon-remove"
            kind="text"
            size="x-small"
            @click="clearFile"
          >
            <v-icon size="16">
              $thrash
            </v-icon>{{ t('button.remove') }}
          </AppButton>

          <AppButton
            data-testid="style-manager-favicon-replace"
            kind="text"
            size="x-small"
            @click="replaceFile"
          >
            <v-icon size="16">
              $restore
            </v-icon>{{ t('button.replace') }}
          </AppButton>
        </div>
      </div>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { isImageTooLarge, readImageAsDataUrl } from './image-upload'

  defineProps<{
    faviconData?: string | false | null
  }>()

  const emit = defineEmits<{
    'update:favicon-data': [data: string | null]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const hovering = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)

  async function handleFile (file: File | undefined) {
    if (!file) {
      return
    }
    if (isImageTooLarge(file)) {
      alerts.addAlert({ success: false, errorMessage: t('notification.style.image.tooLarge') })
      if (fileInput.value) {
        fileInput.value.value = ''
      }
      return
    }
    try {
      emit('update:favicon-data', await readImageAsDataUrl(file))
    } catch {
      // Legacy never answered an image that failed to load: nothing changes.
    }
    // Lets the same file be picked again after Remove.
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }

  function uploadFile (event: Event) {
    return handleFile((event.target as HTMLInputElement).files?.[0])
  }

  // Legacy never reset `hovering` on drop, so the hover frame stayed after a dropped file.
  function onDrop (event: DragEvent) {
    hovering.value = false
    return handleFile(event.dataTransfer?.files?.[0])
  }

  function clearFile () {
    if (fileInput.value) {
      fileInput.value.value = ''
    }
    emit('update:favicon-data', null)
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
  height: 75px;
  border: 1px dashed map.get(v.$gray, lighten3);
  border-radius: 8px;
  cursor: pointer;
  transition: border 0.24s ease, color 0.24s ease;

  &.upload-img--hover,
  &:hover {
    border-color: map.get(v.$success, base);
    color: map.get(v.$success, base);

    .upload-img__content {
      .v-icon :deep(svg) {
        color: map.get(v.$success, base) !important;
      }
    }
  }

  &.upload-img--done {
    border: 1px solid map.get(v.$gray, lighten3);
    max-height: unset;
    height: fit-content;

    .v-btn {
      &:first-child {
        border-right: 1px solid map.get(v.$gray, lighten3);
      }
    }

    .upload-img {
      &__content {
        padding: 0;
        max-height: 75px;
      }

      &__text {
        width: calc(100% - 4px);
        display: flex;
        justify-content: center;
        align-items: center;
        height: calc(100% - 4px);
      }

      &__control-btns {
        display: flex;
      }
    }
  }

  &__content {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    height: 100%;
    padding: 20px;

    .v-icon :deep(svg) {
      transition: border 0.24s ease, color 0.24s ease;
    }
  }

  &__icon {
    margin-right: 14px;
  }

}

.v-application--is-rtl {
  .upload-img {
    &__icon {
      margin-right: 0;
      margin-left: 14px;
    }
  }
}
</style>
