// The MIME type of an audio or video file by its extension, for the `type` of the player's `<source>`. Legacy wrote `audio/<ext>`
// for every file, video included; the browser then picks the wrong decoder for `.mp4` and `.webm`. An extension outside the list has no
// type, so the browser sniffs the file itself.

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

export function mediaMimeType (extension: string): string | undefined {
  return MEDIA_TYPES[extension.toLowerCase()]
}
