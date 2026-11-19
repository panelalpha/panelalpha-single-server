// Test double of cropperjs 2 for jsdom: jsdom never loads the image, so `$ready` and `$toCanvas` of the real library never settle. The
// stub registers the same tags with the methods the file manager calls, each one a `vi.fn` on its instance. Used from a `vi.mock('cropperjs')`
// factory, so the dialog's dynamic import() gets the stub. Test-only: nothing in the app imports it.
import { vi } from 'vitest'

export const CROPPER_STUB_IMAGE = { naturalWidth: 400, naturalHeight: 200 }

class CropperImageStub extends HTMLElement {
  $ready = vi.fn(async () => CROPPER_STUB_IMAGE as unknown as HTMLImageElement)
  $getTransform = vi.fn((): number[] => [1, 0, 0, 1, 0, 0])
  $setTransform = vi.fn()
  $transform = vi.fn()
  $move = vi.fn()
  $rotate = vi.fn()
  $zoom = vi.fn()
  $resetTransform = vi.fn()
  $center = vi.fn()
}

class CropperSelectionStub extends HTMLElement {
  x = 50
  y = 25
  width = 100
  height = 50
  $change = vi.fn()
  $reset = vi.fn()
  $toCanvas = vi.fn(async () => ({ toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })) }) as unknown as HTMLCanvasElement)
}

/** Registers the stub elements once (a second call is a no-op). */
export function defineCropperStub (): void {
  if (!customElements.get('cropper-image')) {
    customElements.define('cropper-image', CropperImageStub)
  }
  if (!customElements.get('cropper-selection')) {
    customElements.define('cropper-selection', CropperSelectionStub)
  }
}
