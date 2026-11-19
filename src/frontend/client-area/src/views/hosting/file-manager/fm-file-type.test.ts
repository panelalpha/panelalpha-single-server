import { describe, expect, it } from 'vitest'
import { cropMimeType, fileKind, fileTypeInfo } from './fm-file-type'

describe('fm-file-type', () => {
  it('detects the kind by extension, case-insensitively', () => {
    expect(fileKind({ type: 'file', extension: 'PNG' })).toBe('image')
    expect(fileKind({ type: 'file', extension: 'json' })).toBe('text')
    expect(fileKind({ type: 'file', extension: 'mp3' })).toBe('audio')
    expect(fileKind({ type: 'file', extension: 'mp4' })).toBe('video')
    expect(fileKind({ type: 'file', extension: 'pdf' })).toBe('pdf')
    expect(fileKind({ type: 'file', extension: 'zip' })).toBe('archive')
    expect(fileKind({ type: 'file', extension: 'exe' })).toBe('other')
    expect(fileKind({ type: 'file', extension: '' })).toBe('other')
  })

  it('treats a folder as a folder whatever its name is', () => {
    expect(fileKind({ type: 'dir', extension: 'png' })).toBe('dir')
  })

  it('sets the flags used by the preview, the PDF, media and text features', () => {
    expect(fileTypeInfo({ type: 'file', extension: 'jpg' })).toMatchObject({ kind: 'image', previewable: true, pdf: false, media: false, text: false })
    expect(fileTypeInfo({ type: 'file', extension: 'pdf' })).toMatchObject({ pdf: true, previewable: false })
    expect(fileTypeInfo({ type: 'file', extension: 'wav' })).toMatchObject({ media: true })
    expect(fileTypeInfo({ type: 'file', extension: 'webm' })).toMatchObject({ kind: 'video', media: true })
    expect(fileTypeInfo({ type: 'file', extension: 'md' })).toMatchObject({ text: true })
    expect(fileTypeInfo({ type: 'file', extension: 'zip' })).toMatchObject({ archive: true })
  })

  it('marks png, jpg, jpeg and webp as croppable, whatever the case, and not gif', () => {
    expect(fileTypeInfo({ type: 'file', extension: 'PNG' }).croppable).toBe(true)
    expect(fileTypeInfo({ type: 'file', extension: 'JPG' }).croppable).toBe(true)
    expect(fileTypeInfo({ type: 'file', extension: 'jpeg' }).croppable).toBe(true)
    expect(fileTypeInfo({ type: 'file', extension: 'webp' }).croppable).toBe(true)
    expect(fileTypeInfo({ type: 'file', extension: 'gif' }).croppable).toBe(false)
    expect(fileTypeInfo({ type: 'file', extension: 'txt' }).croppable).toBe(false)
    expect(fileTypeInfo({ type: 'dir', extension: 'png' }).croppable).toBe(false)
  })

  it('maps the extension to the MIME type used when saving a crop', () => {
    expect(cropMimeType('png')).toBe('image/png')
    expect(cropMimeType('PNG')).toBe('image/png')
    expect(cropMimeType('jpg')).toBe('image/jpeg')
    expect(cropMimeType('JPG')).toBe('image/jpeg')
    expect(cropMimeType('jpeg')).toBe('image/jpeg')
    expect(cropMimeType('WebP')).toBe('image/webp')
  })

  it('gives an alias icon for every kind', () => {
    expect(fileTypeInfo({ type: 'dir' }).icon).toBe('$folder')
    expect(fileTypeInfo({ type: 'file', extension: 'bin' }).icon).toBe('$fileLine')
    expect(fileTypeInfo({ type: 'file', extension: 'gif' }).icon).toBe('$image')
  })
})
