/**
 * Custom elements of cropperjs 2 (`cropper-*`) and Video.js 10 (`media-*`, `video-player`, `video-skin`, `audio-player`, `audio-skin`).
 * Vue must treat them as native elements, or it warns about unknown components. Shared by vite.config.ts and vitest.config.ts.
 */
const VIDEOJS_ELEMENTS = new Set(['video-player', 'video-skin', 'audio-player', 'audio-skin'])

export function isMediaCustomElement (tag: string): boolean {
  return tag.startsWith('cropper-') || tag.startsWith('media-') || VIDEOJS_ELEMENTS.has(tag)
}
