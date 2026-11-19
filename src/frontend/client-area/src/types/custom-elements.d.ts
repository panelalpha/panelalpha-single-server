// Custom elements of cropperjs 2 and Video.js 10, used by the file manager dialogs.
// Vue treats them as native elements (see build/vue-custom-elements.ts), so TypeScript needs their tag names here.
// Only tags are declared; the libraries are loaded with dynamic import() inside the dialogs.
export {}

declare global {
  interface HTMLElementTagNameMap {
    'cropper-canvas': HTMLElement
    'cropper-image': HTMLElement
    'cropper-selection': HTMLElement
    'cropper-shade': HTMLElement
    'cropper-handle': HTMLElement
    'cropper-grid': HTMLElement
    'cropper-viewer': HTMLElement
    'video-player': HTMLElement
    'video-skin': HTMLElement
    'audio-player': HTMLElement
    'audio-skin': HTMLElement
  }
}
