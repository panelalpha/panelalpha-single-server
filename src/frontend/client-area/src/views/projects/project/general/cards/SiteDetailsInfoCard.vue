<template>
  <info-card class="site-details-card">
    <v-img
      v-if="instance.screenshot_url"
      contain
      position="top center"
      :src="instance.screenshot_url"
    />

    <InstanceCardImgNotAvailable
      v-else
      class="no-preview-image"
      :instance="instance"
    />

    <div class="actions d-flex flex-column">
      <AppButton
        class="action-button visit-button"
        kind="secondary"
        size="small"
        @click.prevent="openProject"
      >
        <span class="font-weight-bold base--text">{{ t('button.openProject') }}</span>
      </AppButton>

      <AppButton
        v-if="instance.hasRefreshThumbnailPrivilege() && speedEnabled"
        class="action-button mt-4 refresh-button"
        kind="secondary"
        :loading="thumbnailLoading"
        size="small"
        @click="refreshThumbnail"
      >
        <span class="font-weight-bold base--text">{{ t('button.refresh.thumbnail') }}</span>
      </AppButton>

      <div
        v-if="!instance.screenshot_url"
        class="p-4 mt-4"
      >
        {{ t('message.notPreview.title') }}

        <v-tooltip
          location="bottom"
          offset-overflow
          open-delay="150"
          transition="custom-tooltip"
          z-index="99"
        >
          <template #activator="{ props: activatorProps }">
            <a
              class="why-link"
              href="#"
              v-bind="activatorProps"
            >{{ t('message.notPreview.suffix') }}</a>
          </template>

          <span v-if="instance.isNew()">
            {{ t('message.notPreview.info.new') }}
          </span>

          <span v-else>
            {{ t('message.notPreview.info.other') }}
          </span>
        </v-tooltip>
      </div>
    </div>

    <PreviewSiteModal
      v-model="previewOpen"
      :instance="instance"
    />
  </info-card>
</template>

<script lang="ts" setup>
  // The app-lite overlay is used: "Open project" opens a PanelAlpha-hosted site
  // directly and any other site through the preview modal; the app "Visit website" link is not used here.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { speedCardsEnabled } from '@/views/projects/project/general/general-cards'
  import InfoCard from '@/views/projects/project/general/ui/InfoCard.vue'
  import { refreshInstanceThumbnail } from '@/entities/project/instance-thumbnail.api'
  import { isPanelAlphaOnlineHost, openProjectHref } from '@/entities/project/open-project'
  import InstanceCardImgNotAvailable from '@/entities/project/ui/InstanceCardImgNotAvailable.vue'
  import PreviewSiteModal from '@/entities/project/ui/PreviewSiteModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const alerts = useAlertsStore()

  const previewOpen = ref(false)
  const thumbnailLoading = ref(false)

  const speedEnabled = computed(() => speedCardsEnabled(session.home))

  function openProject (): void {
    const url = props.instance.url || props.instance.domain
    if (isPanelAlphaOnlineHost(url)) {
      if (props.instance.url) {
        window.open(openProjectHref(props.instance.url), '_blank', 'noopener,noreferrer')
      }
      return
    }
    previewOpen.value = true
  }

  async function refreshThumbnail (): Promise<void> {
    thumbnailLoading.value = true
    try {
      await refreshInstanceThumbnail(props.instance.id)
      props.instance.refreshScreenshot()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      thumbnailLoading.value = false
    }
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.site-details-card {
  // The card is rendered by `InfoCard` (this class reaches it as an attribute); V4 `.v-card` is already `position: relative` with
  // `overflow: hidden`, and the nested rules end on this template's own elements, so they keep this scope id.
  .actions {
    position: absolute;
    background: transparent;
    width: 100%;
    height: 100%;
    backdrop-filter: blur(8px);
    opacity: 0;
    transition: opacity 0.24s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &:hover .actions {
    opacity: 1;
  }
}

// The doubled class beats the `.v-btn` sizing and the `z-index` of the component root (legacy used an inline `style`).
.no-preview-image.no-preview-image {
  z-index: 0;
}

.action-button.action-button {
  min-width: 184px;
  max-width: 184px;
}

// Doubled class instead of `!important` for `background-color`; `border-color` keeps `!important` because the global outlined
// button layer (`_buttons.scss`, `.v-btn--variant-outlined { border-color: … !important }`) wins otherwise.
.visit-button {
  background-color: var(--v-white-base);

  &.visit-button:hover {
    background-color: var(--v-white-base);
    border-color: var(--v-gray-lighten5) !important;
  }
}

// Top-level `.v-theme--dark .x`, never `:global(.v-theme--dark) .x` (that compiles to a bare `.v-theme--dark{}`).
.v-theme--dark .visit-button {
  background-color: var(--v-black-base);

  &.visit-button:hover {
    background-color: var(--v-gray-base);
    border-color: var(--v-gray-base) !important;
  }
}

.refresh-button {
  background: white;
}

// V2 `.v-application a { color: var(--v-anchor-base) }` (primary); V4 leaves the user-agent blue. Brand primary, as the "Why?" of
// `InstanceItemActions.vue` (`text-primary`).
.why-link {
  color: var(--v-primary-base);
}
</style>
