// File kind by extension, with the extension lists of the legacy File Manager.
// Icons are application aliases (`$name`).

export type FmKind = 'dir' | 'image' | 'text' | 'audio' | 'video' | 'pdf' | 'archive' | 'other'

export interface FmTypeInfo {
  kind: FmKind
  icon: string
  /** Opens in the image preview. */
  previewable: boolean
  /** Opens as a PDF in a new window. */
  pdf: boolean
  /** Audio or video. */
  media: boolean
  /** Text file. */
  text: boolean
  /** Zip archive: unzip and zip rules. */
  archive: boolean
  /** Opens in the cropper (case-insensitive). */
  croppable: boolean
}

export const IMAGE_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'gif', 'webp']
export const AUDIO_EXTENSIONS: readonly string[] = ['ogg', 'mp3', 'aac', 'wav']
export const VIDEO_EXTENSIONS: readonly string[] = ['webm', 'mp4']
/** Image extensions for cropping (GIF is not croppable). */
export const CROP_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp']
export const TEXT_EXTENSIONS: readonly string[] = [
  'sh', 'css', 'less', 'sass', 'scss', 'html', 'js', 'ts', 'vue',
  'htaccess', 'env', 'txt', 'log', 'ini', 'xml', 'md',
  'java', 'c', 'cpp', 'cs', 'scl', 'php',
  'sql', 'pl', 'py', 'lua', 'swift', 'rb', 'go', 'yaml', 'json',
]

const ICONS: Readonly<Record<FmKind, string>> = {
  dir: '$folder',
  image: '$image',
  text: '$filetext',
  audio: '$fileAudio',
  video: '$fileVideo',
  pdf: '$filePdf',
  archive: '$archive',
  other: '$fileLine',
}

export function fileKind (entry: { type: 'dir' | 'file', extension?: string }): FmKind {
  if (entry.type === 'dir') {
    return 'dir'
  }
  const extension = (entry.extension ?? '').toLowerCase()
  if (extension === '') {
    return 'other'
  }
  if (IMAGE_EXTENSIONS.includes(extension)) {
    return 'image'
  }
  if (TEXT_EXTENSIONS.includes(extension)) {
    return 'text'
  }
  if (AUDIO_EXTENSIONS.includes(extension)) {
    return 'audio'
  }
  if (VIDEO_EXTENSIONS.includes(extension)) {
    return 'video'
  }
  if (extension === 'pdf') {
    return 'pdf'
  }
  if (extension === 'zip') {
    return 'archive'
  }
  return 'other'
}

export function fileTypeInfo (entry: { type: 'dir' | 'file', extension?: string }): FmTypeInfo {
  const kind = fileKind(entry)
  return {
    kind,
    icon: ICONS[kind],
    previewable: kind === 'image',
    pdf: kind === 'pdf',
    media: kind === 'audio' || kind === 'video',
    text: kind === 'text',
    archive: kind === 'archive',
    croppable: entry.type === 'file' && CROP_EXTENSIONS.includes((entry.extension ?? '').toLowerCase()),
  }
}

/** MIME type used when saving a cropped image (`jpg` becomes `image/jpeg`). */
export function cropMimeType (extension: string): string {
  const normalized = extension.toLowerCase()
  return normalized === 'jpg' ? 'image/jpeg' : `image/${normalized}`
}
