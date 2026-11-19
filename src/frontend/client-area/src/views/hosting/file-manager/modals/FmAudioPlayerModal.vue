<template>
  <app-dialog
    :model-value="true"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="onClose"
  >
    <basic-modal
      custom-class="fm-audio-player"
      data-testid="fm-audio-player"
      :title="t('heading.hosting.fileManager.audioPlayer.title')"
      @modal-close="onClose"
    >
      <template #custom>
        <div
          v-if="!ready"
          class="fm-audio-player__loading"
        >
          <v-progress-circular
            color="primary"
            indeterminate
          />
        </div>

        <audio-player
          v-else
          class="fm-audio-player__player"
        >
          <audio-skin class="fm-audio-player__skin">
            <audio
              ref="media"
              data-testid="fm-audio-media"
              preload="metadata"
              @ended="onEnded"
              @error="onError"
              @loadedmetadata="applyRate"
              @pause="playing = false"
              @play="playing = true"
            >
              <source
                v-if="url"
                :src="url"
                :type="type"
                @error="onError"
              >
            </audio>
          </audio-skin>
        </audio-player>

        <div class="fm-audio-player__speed">
          <v-btn-toggle
            v-model="rate"
            class="fm-audio-player__speed-toggle"
            data-testid="fm-audio-speed"
            density="compact"
            divided
            mandatory
          >
            <AppButton
              v-for="speed in SPEEDS"
              :key="speed"
              :data-testid="`fm-audio-speed-${speed}`"
              size="small"
              :value="speed"
            >
              {{ speed }}x
            </AppButton>
          </v-btn-toggle>
        </div>

        <v-list
          class="fm-audio-player__list"
          data-testid="fm-audio-playlist"
          density="compact"
        >
          <v-list-item
            v-for="(track, position) in items"
            :key="track.path"
            :active="position === index"
            data-testid="fm-audio-track"
            @click="select(position)"
          >
            <v-list-item-title
              class="fm-audio-player__track"
              :title="track.basename"
            >
              <span class="fm-audio-player__number">{{ position }}.</span>
              {{ track.basename }}
            </v-list-item-title>

            <template #append>
              <v-icon
                :data-testid="position === index ? 'fm-audio-track-toggle' : undefined"
                :icon="trackIcon(position)"
                size="small"
                @click.stop="position === index ? togglePlay() : select(position)"
              />
            </template>
          </v-list-item>
        </v-list>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
  // The playlist is the selection, the next track starts on `ended`, and
  // the list does not wrap around. Legacy Plyr is replaced by Video.js 10 (`@videojs/html`), loaded with `import()` here so the audio
  // player stays out of the File Manager chunk. Speeds 0.5 / 1 / 1.5 as legacy. The dialog owns the playlist state; the source and the
  // playback are in `use-fm-media-player.ts`. Closing (X, overlay) asks nothing.
  import { useTranslation } from 'i18next-vue'
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { createPlaylist } from '@/views/hosting/file-manager/fm-playlist'
  import { useFmMediaPlayer } from '@/views/hosting/file-manager/use-fm-media-player'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const props = defineProps<{
    items: FmFile[]
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()

  const SPEEDS = [0.5, 1, 1.5]
  const rate = ref(1)

  const media = ref<HTMLMediaElement | null>(null)
  const ready = ref(false)
  const playing = ref(false)
  let unmounted = false

  const playlist = createPlaylist(props.items)
  /** The position of the playing track in the list (highlighted). */
  const index = ref(playlist.index)

  const { url, type, open, onError, dispose, alertPlaybackError } = useFmMediaPlayer(media)

  function applyRate (): void {
    if (media.value) {
      media.value.playbackRate = rate.value
    }
  }

  watch(rate, applyRate)

  onMounted(() => {
    void setup()
  })

  onBeforeUnmount(() => {
    unmounted = true
    dispose()
  })

  /** Loads the player and opens the first track (no autoplay). */
  async function setup (): Promise<void> {
    const first = playlist.current
    if (!first) {
      emit('close')
      return
    }
    try {
      await import('@videojs/html/audio/player')
      await import('@videojs/html/audio/skin')
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
    await open(first, false)
  }

  /** Legacy markup: the playing row shows `play-fill` while playing and `pause-fill` otherwise, the other rows `play-fill`. */
  function trackIcon (position: number): string {
    return position === index.value && !playing.value ? '$pauseLine' : '$play'
  }

  function togglePlay (): void {
    if (!media.value) {
      return
    }
    if (media.value.paused) {
      void media.value.play().catch(() => undefined)
    } else {
      media.value.pause()
    }
  }

  function select (position: number): void {
    const track = playlist.select(position)
    if (track) {
      index.value = playlist.index
      void open(track, true)
    }
  }

  /** Plays the next track; at the end of the list nothing happens (legacy does not wrap around). */
  function onEnded (): void {
    const next = playlist.next()
    if (next) {
      index.value = playlist.index
      void open(next, true)
    }
  }

  function onClose (): void {
    emit('close')
  }
</script>

<style lang="scss" scoped>
.fm-audio-player {
  width: 500px;
  max-width: 100%;
}

.fm-audio-player__loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.fm-audio-player__skin {
  display: block;
  width: 100%;
}

.fm-audio-player__speed {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}

.fm-audio-player__number {
  opacity: 0.6;
  padding-right: 8px;
}

.fm-audio-player__list {
  max-height: 240px;
  overflow-y: auto;
}

// The playing track is marked by a background as in legacy (`bg-light` on the row). Vuetify's own active overlay is transparent in this
// variant, so the row takes the file manager row hover token (light: the legacy colour).
.fm-audio-player__list .v-list-item--active {
  background: var(--v-row-hover);
}
</style>
