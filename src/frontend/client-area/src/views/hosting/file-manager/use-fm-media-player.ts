import type { FmFile } from './file-manager.types'
import type { Ref } from 'vue'
import { useTranslation } from 'i18next-vue'
import { nextTick, ref } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { streamSource } from './file-manager.api'
import { useFileManagerStore } from './file-manager.store'
import { mediaMimeType } from './fm-media-type'

// The source and the playback of the audio and video dialogs. The address comes only from `streamSource`, and the `<source>`
// of the media carries its MIME type. Changing the source needs an explicit `load()`: a changed `src` on a `<source>` alone does not reload
// the media. A playback failure is one alert per opened file, and a failure of an earlier file is dropped. `dispose` stops the media and
// frees the source (legacy destroyed Plyr without this).

const noop = (): void => undefined

function isAbortError (error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useFmMediaPlayer (media: Ref<HTMLMediaElement | null>) {
  const { t } = useTranslation()
  const store = useFileManagerStore()

  /** The address of the `<source>`; null until the first file is loaded. */
  const url = ref<string | null>(null)
  /** The MIME type of the `<source>` of the current file. */
  const type = ref<string | undefined>(undefined)

  let disposed = false
  /** Counts the opened files: a response or an error of an earlier file is dropped. */
  let generation = 0
  /** The generation whose failure is already shown. */
  let alertedGeneration = 0
  let releaseSource: () => void = noop

  function alertPlaybackError (): void {
    useAlertsStore().addAlert({ success: false, errorMessage: t('message.fileManager.error.playback') })
  }

  function fail (token: number): void {
    if (disposed || token !== generation || alertedGeneration === token) {
      return
    }
    alertedGeneration = token
    alertPlaybackError()
  }

  function play (token: number): void {
    media.value?.play().catch((error: unknown) => {
      if (!isAbortError(error)) {
        fail(token)
      }
    })
  }

  /** Opens a file: its source is read, the media loads it, and it plays when `autoplay` (a track picked or reached by `ended`). */
  async function open (file: FmFile, autoplay: boolean): Promise<void> {
    generation += 1
    const token = generation
    media.value?.pause()
    releaseSource()
    releaseSource = noop

    const accountId = store.accountId
    if (accountId === null) {
      fail(token)
      return
    }
    const source = await streamSource(accountId, file)
    if (token !== generation) {
      if (source.ok) {
        source.release()
      }
      return
    }
    if (!source.ok) {
      fail(token)
      return
    }

    releaseSource = source.release
    url.value = source.url
    type.value = mediaMimeType(file.extension)
    await nextTick()
    media.value?.load()
    if (autoplay) {
      play(token)
    }
  }

  /** A media or `<source>` error of the current file. */
  function onError (): void {
    fail(generation)
  }

  /** Stops the media and frees the source; a response that arrives later is dropped. */
  function dispose (): void {
    disposed = true
    generation += 1
    media.value?.pause()
    releaseSource()
    releaseSource = noop
  }

  return { url, type, open, onError, dispose, alertPlaybackError }
}
