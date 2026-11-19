<template>
  <app-dialog
    :model-value="true"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="onClose"
  >
    <basic-modal
      custom-class="fm-video-player"
      data-testid="fm-video-player"
      :title="t('heading.hosting.fileManager.videoPlayer.title')"
      @modal-close="onClose"
    >
      <template #custom>
        <FmModalFileName
          class="fm-video-player__name"
          data-testid="fm-video-player-name"
          :name="file.basename"
        />

        <div
          v-if="!ready"
          class="fm-video-player__loading"
        >
          <v-progress-circular
            color="primary"
            indeterminate
          />
        </div>

        <video-player
          v-else
          class="fm-video-player__player"
        >
          <video-skin class="fm-video-player__skin">
            <video
              ref="media"
              class="fm-video-player__media"
              data-testid="fm-video-media"
              playsinline
              preload="metadata"
              @error="onError"
            >
              <source
                v-if="url"
                :src="url"
                :type="type"
                @error="onError"
              >
            </video>
          </video-skin>
        </video-player>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
  // One video, the file is the opened one. Legacy Plyr is replaced by
  // Video.js 10 (`@videojs/html`), loaded with `import()` here so the player stays out of the File Manager chunk. The source is read through
  // `streamSource` and typed by the file extension (legacy wrote `audio/<ext>` for video). The source and the playback are in
  // `use-fm-media-player.ts`. Closing (X, overlay) asks nothing.
  import { useTranslation } from 'i18next-vue'
  import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useFmMediaPlayer } from '@/views/hosting/file-manager/use-fm-media-player'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import FmModalFileName from './FmModalFileName.vue'

  const props = defineProps<{
    file: FmFile
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()

  const media = ref<HTMLMediaElement | null>(null)
  const ready = ref(false)
  let unmounted = false

  const { url, type, open, onError, dispose, alertPlaybackError } = useFmMediaPlayer(media)

  onMounted(() => {
    void setup()
  })

  onBeforeUnmount(() => {
    unmounted = true
    dispose()
  })

  async function setup (): Promise<void> {
    try {
      await import('@videojs/html/video/player')
      await import('@videojs/html/video/skin')
    } catch {
      alertPlaybackError()
      emit('close')
      return
    }
    if (unmounted) {
      return
    }
    ready.value = true
    await nextTick()
    await open(props.file, false)
  }

  function onClose (): void {
    emit('close')
  }
</script>

<style lang="scss" scoped>
.fm-video-player {
  width: 800px;
  max-width: 100%;
}

.fm-video-player__name {
  margin-bottom: 12px;
}

.fm-video-player__loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.fm-video-player__skin {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
}

.fm-video-player__media {
  width: 100%;
  height: 100%;
}
</style>
