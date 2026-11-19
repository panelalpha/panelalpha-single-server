<template>
  <div class="fm-crop">
    <div class="fm-crop__main">
      <div class="fm-crop__block">
        <cropper-canvas
          v-if="libraryReady"
          class="fm-crop__canvas"
          data-testid="fm-crop-canvas"
        >
          <cropper-image
            ref="imageElement"
            :alt="file.basename"
            initial-fit="contain"
            :src="image"
            @transform="sync"
          />

          <cropper-shade />

          <cropper-selection
            :id="selectionId"
            ref="selectionElement"
            @change="sync"
          >
            <cropper-grid covered />
          </cropper-selection>
        </cropper-canvas>
      </div>

      <div class="fm-crop__side">
        <div class="fm-crop__preview">
          <cropper-viewer
            v-if="libraryReady"
            :selection="`#${selectionId}`"
          />
        </div>

        <v-text-field
          v-for="row in FIELD_ROWS"
          :key="row.name"
          :data-testid="`fm-crop-${row.name}`"
          density="compact"
          :disabled="!ready || saving"
          hide-details
          :label="t(row.label)"
          :model-value="texts[row.name]"
          :suffix="row.unit ? t(row.unit) : undefined"
          variant="outlined"
          @update:model-value="value => setText(row.name, value)"
        />

        <AppButton
          :aria-label="t('button.apply')"
          block
          color="primary"
          data-testid="fm-crop-apply"
          :disabled="!canApply"
          icon="$check"
          :title="t('button.apply')"
          @click="apply"
        />
      </div>
    </div>

    <div class="fm-crop__footer">
      <div class="fm-crop__tools">
        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.move')"
          data-testid="fm-crop-move-left"
          :disabled="!canUse"
          icon="$arrowleft"
          variant="tonal"
          @click="moveImage(-10, 0)"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.move')"
          data-testid="fm-crop-move-right"
          :disabled="!canUse"
          icon="$arrowright"
          variant="tonal"
          @click="moveImage(10, 0)"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.move')"
          data-testid="fm-crop-move-up"
          :disabled="!canUse"
          icon="$arrowup"
          variant="tonal"
          @click="moveImage(0, -10)"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.move')"
          data-testid="fm-crop-move-down"
          :disabled="!canUse"
          icon="$arrowdown"
          variant="tonal"
          @click="moveImage(0, 10)"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.flip')"
          data-testid="fm-crop-flip-x"
          :disabled="!canUse"
          icon="$flipHorizontal"
          variant="tonal"
          @click="flip('x')"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.flip')"
          data-testid="fm-crop-flip-y"
          :disabled="!canUse"
          icon="$flipVertical"
          variant="tonal"
          @click="flip('y')"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.rotate')"
          data-testid="fm-crop-rotate-left"
          :disabled="!canUse"
          icon="$rotateLeft"
          variant="tonal"
          @click="rotate(-45)"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.rotate')"
          data-testid="fm-crop-rotate-right"
          :disabled="!canUse"
          icon="$rotateRight"
          variant="tonal"
          @click="rotate(45)"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.zoom')"
          data-testid="fm-crop-zoom-in"
          :disabled="!canUse"
          icon="$pluscircle"
          variant="tonal"
          @click="zoom(0.1)"
        />

        <AppButton
          :aria-label="t('message.fileManager.cropper.toolbar.zoom')"
          data-testid="fm-crop-zoom-out"
          :disabled="!canUse"
          icon="$minusCircle"
          variant="tonal"
          @click="zoom(-0.1)"
        />

        <AppButton
          :aria-label="t('button.fileManager.reset')"
          data-testid="fm-crop-reset"
          :disabled="!canUse"
          icon="$repeat"
          :title="t('button.fileManager.reset')"
          variant="tonal"
          @click="reset"
        />

        <AppButton
          :aria-label="t('button.save')"
          color="error"
          data-testid="fm-crop-save"
          :disabled="!canUse"
          icon="$save"
          :title="t('button.save')"
          @click="save"
        />
      </div>

      <AppButton
        data-testid="fm-crop-back"
        :disabled="saving"
        variant="text"
        @click="emit('close')"
      >
        {{ t('button.back') }}
      </AppButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
  // The cropper with the seven fields, the toolbar and Save. cropperjs
  // is loaded with import() when the panel opens. The pixel conversion lives in `fm-crop.ts`; this file calls the cropper methods and
  // keeps the field text. Save writes the crop as the file (`store.saveFile`), then emits `saved` and `close`.
  import type { CropFields, CropGeometry } from '@/views/hosting/file-manager/fm-crop'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import {
    cropOutputWidth,
    fieldsToSelection,
    geometryFromMatrix,
    matrixFromGeometry,
    selectionToFields,
    validateCropFields,
  } from '@/views/hosting/file-manager/fm-crop'
  import { cropMimeType } from '@/views/hosting/file-manager/fm-file-type'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  /** The cropperjs 2 image methods this panel calls. */
  interface CropperImageElement extends HTMLElement {
    $ready: () => Promise<HTMLImageElement>
    $getTransform: () => number[]
    $setTransform: (matrix: number[]) => unknown
    $transform: (a: number, b: number, c: number, d: number, e: number, f: number) => unknown
    $move: (x: number, y?: number) => unknown
    $rotate: (angle: string, x?: number, y?: number) => unknown
    $zoom: (scale: number, x?: number, y?: number) => unknown
    $resetTransform: () => unknown
    $center: (size?: string) => unknown
  }

  /** The cropperjs 2 selection (the crop box, in canvas pixels) and its export. */
  interface CropperSelectionElement extends HTMLElement {
    x: number
    y: number
    width: number
    height: number
    $change: (x: number, y: number, width?: number, height?: number) => unknown
    $reset: () => unknown
    $toCanvas: (options: { width: number }) => Promise<HTMLCanvasElement>
  }

  type FieldName = keyof CropFields

  // Legacy labels and units; the labels have no translation key in legacy.
  const FIELD_ROWS: ReadonlyArray<{ name: FieldName, label: string, unit?: string }> = [
    { name: 'x', label: 'message.fileManager.cropper.x', unit: 'message.fileManager.cropper.px' },
    { name: 'y', label: 'message.fileManager.cropper.y', unit: 'message.fileManager.cropper.px' },
    { name: 'width', label: 'message.fileManager.cropper.width', unit: 'message.fileManager.cropper.px' },
    { name: 'height', label: 'message.fileManager.cropper.height', unit: 'message.fileManager.cropper.px' },
    { name: 'rotate', label: 'message.fileManager.cropper.rotate', unit: 'message.fileManager.cropper.deg' },
    { name: 'scaleX', label: 'message.fileManager.cropper.scaleX' },
    { name: 'scaleY', label: 'message.fileManager.cropper.scaleY' },
  ]

  const props = defineProps<{
    image: string
    file: FmFile
  }>()

  const emit = defineEmits<{
    close: []
    saved: []
    /** The save is running: the host keeps the dialog open until it ends. */
    saving: [active: boolean]
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  // One selection per panel: the viewer finds it by this id.
  let panelCount = 0
  const selectionId = `fm-crop-selection-${++panelCount}`

  const libraryReady = ref(false)
  const ready = ref(false)
  const saving = ref(false)
  const imageElement = ref<CropperImageElement | null>(null)
  const selectionElement = ref<CropperSelectionElement | null>(null)
  /** The field text as typed; parsed into numbers for Apply. */
  const texts = ref<Record<FieldName, string>>({ x: '0', y: '0', width: '0', height: '0', rotate: '0', scaleX: '1', scaleY: '1' })
  const geometry = shallowRef<CropGeometry | null>(null)
  let natural: { width: number, height: number } | null = null
  let disposed = false

  const fields = computed<CropFields>(() => {
    const values = {} as CropFields
    for (const row of FIELD_ROWS) {
      const text = texts.value[row.name].trim()
      values[row.name] = text === '' ? Number.NaN : Number(text)
    }
    return values
  })
  const issues = computed(() => geometry.value ? validateCropFields(fields.value, geometry.value) : [])
  const canUse = computed(() => ready.value && !saving.value)
  const canApply = computed(() => canUse.value && issues.value.length === 0)

  onMounted(() => {
    void init()
  })

  onBeforeUnmount(() => {
    disposed = true
  })

  async function init (): Promise<void> {
    try {
      await import('cropperjs')
      if (disposed) {
        return
      }
      libraryReady.value = true
      await nextTick()
      const image = imageElement.value
      if (!image) {
        return
      }
      const loaded = await image.$ready()
      if (disposed) {
        return
      }
      natural = { width: loaded.naturalWidth, height: loaded.naturalHeight }
      ready.value = true
      sync()
    } catch {
      alertFailure(t('message.fileManager.error.read'))
      emit('close')
    }
  }

  function alertFailure (message: string): void {
    useAlertsStore().addAlert({ success: false, errorMessage: message })
  }

  function setText (name: FieldName, value: unknown): void {
    texts.value = { ...texts.value, [name]: String(value ?? '') }
  }

  /** The geometry of the image as cropperjs has it now (null before it is ready). */
  function currentGeometry (): CropGeometry | null {
    const image = imageElement.value
    if (!image || !natural) {
      return null
    }
    geometry.value = geometryFromMatrix(image.$getTransform(), natural.width, natural.height)
    return geometry.value
  }

  /** The cropper state to the fields: the selection and the image transform, in native pixels. */
  function sync (): void {
    const selection = selectionElement.value
    const current = currentGeometry()
    if (!ready.value || !selection || !current) {
      return
    }
    const fromCropper = selectionToFields(
      { x: selection.x, y: selection.y, width: selection.width, height: selection.height },
      current,
    )
    texts.value = {
      x: String(fromCropper.x),
      y: String(fromCropper.y),
      width: String(fromCropper.width),
      height: String(fromCropper.height),
      rotate: String(fromCropper.rotate),
      scaleX: String(fromCropper.scaleX),
      scaleY: String(fromCropper.scaleY),
    }
  }

  /** The fields become the selection and the image transform. */
  function apply (): void {
    const current = currentGeometry()
    const image = imageElement.value
    const selection = selectionElement.value
    if (!canApply.value || !current || !image || !selection) {
      return
    }
    const { selection: box, transform } = fieldsToSelection(fields.value, current)
    image.$setTransform(matrixFromGeometry(transform, current))
    selection.$change(box.x, box.y, box.width, box.height)
    sync()
  }

  // Toolbar (`move`, `scale`, `rotate`, `zoom`, `reset`), with the cropperjs 2 methods. Flips and rotation
  // use the centre of the image, as legacy did.

  function moveImage (x: number, y: number): void {
    imageElement.value?.$move(x, y)
    sync()
  }

  /** Mirror around the image centre (its own frame is `natural` in size), so the picture stays in place. */
  function flip (axis: 'x' | 'y'): void {
    const image = imageElement.value
    if (!image || !natural || !canUse.value) {
      return
    }
    if (axis === 'x') {
      image.$transform(-1, 0, 0, 1, natural.width, 0)
    } else {
      image.$transform(1, 0, 0, -1, 0, natural.height)
    }
    sync()
  }

  function rotate (degrees: number): void {
    const image = imageElement.value
    if (!image) {
      return
    }
    const { width, height } = image.getBoundingClientRect()
    image.$rotate(`${degrees}deg`, width / 2, height / 2)
    sync()
  }

  function zoom (ratio: number): void {
    const image = imageElement.value
    if (!image) {
      return
    }
    const { width, height } = image.getBoundingClientRect()
    image.$zoom(ratio, width / 2, height / 2)
    sync()
  }

  function reset (): void {
    const image = imageElement.value
    const selection = selectionElement.value
    if (!image || !selection) {
      return
    }
    image.$resetTransform()
    image.$center('contain')
    selection.$reset()
    sync()
  }

  function canvasToBlob (canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, type))
  }

  /**
   * Saves the crop with the native width for the export (`cropOutputWidth`). A null blob is an error and nothing is written. A second
   * click while the write runs does nothing. A failed write keeps the panel open (the store shows the alert).
   */
  async function save (): Promise<void> {
    const selection = selectionElement.value
    const current = currentGeometry()
    if (!canUse.value || !selection || !current) {
      return
    }
    saving.value = true
    emit('saving', true)
    try {
      const canvas = await selection.$toCanvas({
        width: cropOutputWidth({ x: selection.x, y: selection.y, width: selection.width, height: selection.height }, current),
      })
      const blob = await canvasToBlob(canvas, cropMimeType(props.file.extension))
      if (blob === null) {
        alertFailure(t('message.fileManager.error.saveImage'))
        return
      }
      if (await store.saveFile(props.file.basename, blob)) {
        emit('saved')
        emit('close')
      }
    } catch {
      alertFailure(t('message.fileManager.error.saveImage'))
    } finally {
      saving.value = false
      emit('saving', false)
    }
  }
</script>

<style lang="scss" scoped>
.fm-crop {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.fm-crop__main {
  display: flex;
  align-items: stretch;
  gap: 16px;
  min-width: 0;
}

.fm-crop__block {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.fm-crop__canvas {
  display: block;
  width: 100%;
  height: 60vh;
  min-height: 300px;
}

.fm-crop__side {
  display: flex;
  flex: 0 0 240px;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.fm-crop__preview {
  height: 200px;
  overflow: hidden;
}

.fm-crop__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--v-gray-lighten2);
}

.fm-crop__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

@media (max-width: 767px) {
  .fm-crop__main {
    flex-direction: column;
  }

  .fm-crop__side {
    flex-basis: auto;
  }
}
</style>
