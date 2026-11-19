<template>
  <v-dialog
    v-model="opened"
    transition="custom-dialog-transition"
  >
    <div
      class="card-overlay"
      @click="opened = false"
    />

    <v-card
      class="basic-modal card-width-560"
      data-testid="preview-site-modal"
      elevation="4"
    >
      <v-card-title class="d-flex align-center">
        <v-icon
          class="mr-4"
          icon="$modalIcon"
          size="24"
        />

        <h3 class="font-weight-light">
          {{ t('heading.instance.modal.previewSite.title') }}
        </h3>

        <modal-close-button @click="opened = false" />
      </v-card-title>

      <v-card-text>
        <p class="p-2 mb-0">
          {{ t('heading.instance.modal.previewSite.message') }}
        </p>

        <template v-if="previewSite">
          <div class="box d-flex justify-space-between align-center">
            <div class="d-flex align-center w-100">
              <span class="p-2">{{ t('heading.instance.modal.previewSite.field') }}</span>

              <v-tooltip
                close-delay="0"
                location="bottom"
                max-width="none"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: activatorProps }">
                  <div
                    class="temporary-url-wrapper"
                    v-bind="activatorProps"
                  >
                    <span class="p-2 text-info font-weight-600 ml-2 mr-2 temporary-url">{{ temporaryUrl }}</span>
                  </div>
                </template>

                <span class="p-2">{{ temporaryUrl }}</span>
              </v-tooltip>

              <copy-text-custom-button
                class="copy-button"
                :text="temporaryUrlComputed"
              >
                <AppButton
                  class="ml-auto success-lighten-button"
                  elevation="0"
                  variant="flat"
                >
                  {{ t('button.copyUrl') }}
                </AppButton>
              </copy-text-custom-button>
            </div>
          </div>

          <AppButton
            class="w-100 mb-8"
            :href="temporaryUrlComputed"
            kind="primary"
            size="large"
            target="_blank"
          >
            {{ t('button.visitSite') }}
          </AppButton>
        </template>
      </v-card-text>

      <v-card-actions
        v-if="!temporaryUrl"
        class="d-flex flex-column px-8 pt-8"
      >
        <AppButton
          block
          kind="primary"
          :loading="submitting"
          size="large"
          @click="getPreviewSite"
        >
          <template #loader>
            <loader color="white" no-margins :size="20" />
          </template>

          {{ t('button.temporaryUrl.get') }}
        </AppButton>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  // Owned by `PreviewSiteButton` (list) and
  // `DnsSslIndicator` (Fix DNS dialog); the top bar takes it from here too. The parent passes the instance and `v-model`s the
  // open state. The Visit site button and the copy button sit in the box, as legacy.
  import type { PreviewSite, PreviewSiteInstance } from '@/entities/project/instance-preview.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { createPreviewSite } from '@/entities/project/instance-preview.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import CopyTextCustomButton from '@/shared/ui/buttons/CopyTextCustomButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { useMobileScrollLock } from '@/shared/ui/modal/mobile-scroll-lock'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import { previewSiteHref, unixNow, validPreviewSite } from './preview-site'

  const props = defineProps<{
    instance: InstanceResource
    /** Create the preview as the window opens, when no valid stored one is left (`Generate URL`). */
    autoGenerate?: boolean
  }>()

  const opened = defineModel<boolean>({ default: false })
  useMobileScrollLock(opened)

  const emit = defineEmits<{
    // Legacy emits the whole instance from the answer (`response.data.data`), not only its `preview_site`.
    'preview-site-generated': [instance: PreviewSiteInstance]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const previewSite = ref<PreviewSite | null>(null)
  const submitting = ref(false)

  const temporaryUrl = computed(() => previewSite.value?.url ?? null)
  const temporaryUrlComputed = computed(() => previewSiteHref(previewSite.value?.url ?? ''))

  // A valid stored site (`instance.preview_site`) replaces the shown one, on open and on close alike.
  watch(opened, () => {
    const stored = validPreviewSite(props.instance.preview_site, unixNow())
    if (stored) {
      previewSite.value = stored
      return
    }
    if (opened.value && props.autoGenerate && !submitting.value) {
      void getPreviewSite()
    }
  })

  async function getPreviewSite (): Promise<void> {
    submitting.value = true
    try {
      const generated = await createPreviewSite(props.instance.id)
      previewSite.value = generated.preview_site
      emit('preview-site-generated', generated)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 vendor `.v-card__title { flex-wrap: wrap }`: on a narrow screen the X drops under the title instead of squeezing it.
.v-card-title {
  flex-wrap: wrap;
}

.box {
  width: 100%;
  background: var(--v-gray-lighten6);
  color: var(--v-gray-darken1);
  border: 1px solid var(--v-preview-box-border);
  padding: 16px;
  text-align: center;
  border-radius: 8px;
  margin-block: 32px;

  > div {
    display: flex;
    align-items: center;
    width: 100%;
  }
}

.temporary-url-wrapper {
  flex: 1;
  min-width: 0; // Legacy: this is what makes the text-overflow work.
}

.temporary-url {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-button {
  flex-shrink: 0;
}

// V2 colour classes set the background and the text colour together. `!important` 1:1 (it beats the
// button's own variant colour).
.success-lighten-button {
  background-color: var(--v-success-lighten5) !important;
  border-color: var(--v-success-lighten5);
  color: var(--v-success-base) !important;
}

// V2 `elevation="0"` / flat buttons painted three zero-size shadows (`.2`, `.14`, `.12`); V4 flat paints two.
.v-card-actions .v-btn,
.v-btn.w-100 {
  box-shadow: v.$box-shadow-v2-list-flat;
}
</style>
