import type { FmClipboard, FmConfig, FmDirectory, FmFile } from './file-manager.types'
import { describe, expect, it } from 'vitest'
import { canPaste, menuItems } from './fm-context-menu'

const config: FmConfig = { uploadMaxFilesize: 1024, unsupportedActions: [] }

const folder: FmDirectory = { type: 'dir', path: 'docs', basename: 'docs', dirname: '', timestamp: 0 }
const photo: FmFile = { type: 'file', path: 'a.png', basename: 'a.png', dirname: '', filename: 'a', extension: 'png', size: 1, timestamp: 0 }
const notes: FmFile = { type: 'file', path: 'b.txt', basename: 'b.txt', dirname: '', filename: 'b', extension: 'txt', size: 1, timestamp: 0 }
const archive: FmFile = { type: 'file', path: 'c.ZIP', basename: 'c.ZIP', dirname: '', filename: 'c', extension: 'ZIP', size: 1, timestamp: 0 }
const song: FmFile = { type: 'file', path: 'd.mp3', basename: 'd.mp3', dirname: '', filename: 'd', extension: 'mp3', size: 1, timestamp: 0 }
const ogg: FmFile = { type: 'file', path: 'e.ogg', basename: 'e.ogg', dirname: '', filename: 'e', extension: 'ogg', size: 1, timestamp: 0 }
const clip: FmFile = { type: 'file', path: 'f.mp4', basename: 'f.mp4', dirname: '', filename: 'f', extension: 'mp4', size: 1, timestamp: 0 }

const full: FmClipboard = { type: 'copy', directories: ['x'], files: [] }

/** The action names of all groups, flattened, in order. */
function names (groups: ReturnType<typeof menuItems>): string[] {
  return groups.flat().map(item => item.name)
}

describe('menuItems', () => {
  it('shows a single file with the view, download and unzip rules of legacy', () => {
    expect(names(menuItems(photo, [photo], null, config))).toEqual(['view', 'download', 'copy', 'cut', 'rename', 'zip', 'delete', 'properties'])
  })

  it('shows open, but no view, download or unzip, for a single folder', () => {
    expect(names(menuItems(folder, [folder], null, config))).toEqual(['open', 'copy', 'cut', 'rename', 'zip', 'delete', 'properties'])
  })

  it('shows unzip for a zip archive, whatever the case of its extension', () => {
    expect(names(menuItems(archive, [archive], null, config))).toContain('unzip')
    expect(names(menuItems(notes, [notes], null, config))).not.toContain('unzip')
  })

  it('shows only the actions that work on several items', () => {
    expect(names(menuItems(photo, [folder, photo], null, config))).toEqual(['copy', 'cut', 'zip', 'delete'])
  })

  it('offers only paste on the empty area, and nothing when the clipboard is empty', () => {
    expect(names(menuItems(null, [], full, config))).toEqual(['paste'])
    expect(menuItems(null, [], null, config)).toEqual([])
    expect(menuItems(null, [], { type: 'cut', directories: [], files: [] }, config)).toEqual([])
  })

  it('adds paste to the item menu only when the clipboard has items', () => {
    expect(names(menuItems(notes, [notes], null, config))).not.toContain('paste')
    expect(names(menuItems(notes, [notes], full, config))).toContain('paste')
  })

  it('hides zip when the account does not support it', () => {
    const noZip: FmConfig = { uploadMaxFilesize: 1024, unsupportedActions: ['zip'] }

    expect(names(menuItems(photo, [photo], null, noZip))).not.toContain('zip')
  })

  it('shows edit for one text file, between view and download (legacy editRule)', () => {
    expect(names(menuItems(notes, [notes], null, config))).toEqual(['edit', 'download', 'copy', 'cut', 'rename', 'zip', 'delete', 'properties'])
    expect(names(menuItems(photo, [photo], null, config))).not.toContain('edit')
    expect(names(menuItems(archive, [archive], null, config))).not.toContain('edit')
    expect(names(menuItems(folder, [folder], null, config))).not.toContain('edit')
  })

  it('shows edit only for a single text file, not for several items', () => {
    expect(names(menuItems(notes, [folder, notes], null, config))).not.toContain('edit')
    expect(names(menuItems(notes, [notes, photo], null, config))).not.toContain('edit')
  })

  it('never shows select', () => {
    for (const entry of [notes, song, photo, clip]) {
      expect(names(menuItems(entry, [entry], full, config))).not.toContain('select')
    }
  })

  it('shows audioPlay for one audio file, first in the first group, without view or edit', () => {
    expect(names(menuItems(song, [song], null, config))).toEqual(['audioPlay', 'download', 'copy', 'cut', 'rename', 'zip', 'delete', 'properties'])
    expect(names(menuItems(song, [song], null, config))).not.toContain('videoPlay')
  })

  it('shows audioPlay for several items only when every one of them is an audio file (the playlist)', () => {
    expect(names(menuItems(song, [song, ogg], null, config))).toEqual(['audioPlay', 'copy', 'cut', 'zip', 'delete'])
    expect(names(menuItems(song, [folder, song], null, config))).not.toContain('audioPlay')
    expect(names(menuItems(song, [notes, song], null, config))).not.toContain('audioPlay')
    expect(names(menuItems(clip, [song, clip], null, config))).not.toContain('audioPlay')
  })

  it('shows videoPlay for one video file only', () => {
    expect(names(menuItems(clip, [clip], null, config))).toContain('videoPlay')
    expect(names(menuItems(clip, [clip], null, config))).not.toContain('audioPlay')
    expect(names(menuItems(clip, [clip, notes], null, config))).not.toContain('videoPlay')
    expect(names(menuItems(clip, [clip, song], null, config))).not.toContain('videoPlay')
  })

  it('hides view for audio and video, which play instead', () => {
    expect(names(menuItems(clip, [clip], null, config))).not.toContain('view')
    expect(names(menuItems(song, [song], null, config))).not.toContain('view')
  })

  it('groups the items as legacy, leaving out empty groups', () => {
    const groups = menuItems(folder, [folder], null, config)

    expect(groups.map(group => group.map(item => item.name))).toEqual([
      ['open'],
      ['copy', 'cut', 'rename', 'zip'],
      ['delete'],
      ['properties'],
    ])
    expect(groups.at(-2)?.[0]?.danger).toBe(true)
  })
})

describe('canPaste', () => {
  it('is false for no clipboard and for an empty one', () => {
    expect(canPaste(null)).toBe(false)
    expect(canPaste({ type: 'cut', directories: [], files: [] })).toBe(false)
    expect(canPaste(full)).toBe(true)
  })
})
