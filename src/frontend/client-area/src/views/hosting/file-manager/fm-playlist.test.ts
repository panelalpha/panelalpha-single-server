import type { FmDirectory, FmFile } from './file-manager.types'
import { describe, expect, it } from 'vitest'
import { audioItems, createPlaylist } from './fm-playlist'

function file (name: string): FmFile {
  const dot = name.lastIndexOf('.')
  return {
    type: 'file',
    path: `docs/${name}`,
    basename: name,
    dirname: 'docs',
    filename: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1) : '',
    size: 1,
    timestamp: 0,
  }
}

const folder: FmDirectory = { type: 'dir', path: 'docs/a', basename: 'a', dirname: 'docs', timestamp: 0 }

describe('audioItems', () => {
  it('keeps the audio files of a selection in its order, leaving out folders and other files', () => {
    const items = [folder, file('two.ogg'), file('photo.png'), file('one.mp3'), file('clip.mp4')]

    expect(audioItems(items).map(item => item.basename)).toEqual(['two.ogg', 'one.mp3'])
  })

  it('returns an empty list when nothing is audio', () => {
    expect(audioItems([folder, file('notes.txt')])).toEqual([])
  })
})

describe('createPlaylist', () => {
  it('starts at the first track', () => {
    const playlist = createPlaylist([file('a.mp3'), file('b.mp3')])

    expect(playlist.index).toBe(0)
    expect(playlist.current?.basename).toBe('a.mp3')
    expect(playlist.hasNext).toBe(true)
  })

  it('moves to the next track on next and returns it', () => {
    const playlist = createPlaylist([file('a.mp3'), file('b.mp3'), file('c.mp3')])

    expect(playlist.next()?.basename).toBe('b.mp3')
    expect(playlist.index).toBe(1)
    expect(playlist.current?.basename).toBe('b.mp3')
    expect(playlist.hasNext).toBe(true)
  })

  it('does not wrap around at the end: next returns null and the last track stays current', () => {
    const playlist = createPlaylist([file('a.mp3'), file('b.mp3')])
    playlist.next()

    expect(playlist.hasNext).toBe(false)
    expect(playlist.next()).toBeNull()
    expect(playlist.index).toBe(1)
    expect(playlist.current?.basename).toBe('b.mp3')
  })

  it('jumps to a track picked in the list', () => {
    const playlist = createPlaylist([file('a.mp3'), file('b.mp3'), file('c.mp3')])

    expect(playlist.select(2)?.basename).toBe('c.mp3')
    expect(playlist.index).toBe(2)
    expect(playlist.hasNext).toBe(false)
  })

  it('ignores an index outside the list and keeps the current track', () => {
    const playlist = createPlaylist([file('a.mp3'), file('b.mp3')])
    playlist.select(1)

    expect(playlist.select(5)).toBeNull()
    expect(playlist.select(-1)).toBeNull()
    expect(playlist.select(0.5)).toBeNull()
    expect(playlist.index).toBe(1)
  })

  it('has no current track and no next for an empty list', () => {
    const playlist = createPlaylist([])

    expect(playlist.current).toBeNull()
    expect(playlist.hasNext).toBe(false)
    expect(playlist.next()).toBeNull()
    expect(playlist.index).toBe(0)
  })
})
