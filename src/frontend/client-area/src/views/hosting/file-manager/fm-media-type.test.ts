import { describe, expect, it } from 'vitest'
import { mediaMimeType } from './fm-media-type'

describe('mediaMimeType', () => {
  it('gives the video type for a video file, not an audio one', () => {
    expect(mediaMimeType('mp4')).toBe('video/mp4')
    expect(mediaMimeType('webm')).toBe('video/webm')
  })

  it('gives the audio type for an audio file, including the mp3 type that is not audio/mp3', () => {
    expect(mediaMimeType('mp3')).toBe('audio/mpeg')
    expect(mediaMimeType('ogg')).toBe('audio/ogg')
    expect(mediaMimeType('aac')).toBe('audio/aac')
    expect(mediaMimeType('wav')).toBe('audio/wav')
  })

  it('ignores the case of the extension', () => {
    expect(mediaMimeType('MP4')).toBe('video/mp4')
  })

  it('gives no type for an extension outside the list', () => {
    expect(mediaMimeType('flac')).toBeUndefined()
  })
})
