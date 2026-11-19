<template>
  <div
    ref="root"
    class="fm-thumbnail"
  >
    <img
      v-if="src"
      :alt="file.basename"
      class="fm-thumbnail__image"
      :src="src"
    >

    <v-icon
      v-else
      class="fm-thumbnail__placeholder fm-icon-fill"
      icon="$image"
      size="40"
    />
  </div>
</template>

<script lang="ts" setup>
  // The image is requested when the tile is at least half visible (IntersectionObserver),
  // and at once where the browser has no IntersectionObserver, as legacy. A new timestamp of the file requests it again.
  import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { loadThumbnail } from '@/views/hosting/file-manager/fm-thumbnail-cache'

  const props = defineProps<{
    accountId: number
    file: FmFile
  }>()

  const root = ref<HTMLElement | null>(null)
  const src = ref<string | null>(null)

  let observer: IntersectionObserver | null = null
  let requested = false
  /** A response of an older request (another timestamp) is dropped. */
  let generation = 0

  async function load (): Promise<void> {
    requested = true
    generation += 1
    const token = generation
    const image = await loadThumbnail(props.accountId, props.file)
    if (token === generation && image !== null) {
      src.value = image
    }
  }

  watch(() => props.file.timestamp, () => {
    if (requested) {
      void load()
    }
  })

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      void load()
      return
    }
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer?.disconnect()
        observer = null
        void load()
      }
    }, { threshold: 0.5 })
    if (root.value) {
      observer.observe(root.value)
    }
  })

  onBeforeUnmount(() => observer?.disconnect())
</script>

<style lang="scss" scoped>
.fm-thumbnail {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 88px;
}

.fm-thumbnail__image {
  width: 88px;
  height: 88px;
}

.fm-thumbnail__placeholder.v-icon {
  color: var(--v-gray-darken1);
}
</style>
