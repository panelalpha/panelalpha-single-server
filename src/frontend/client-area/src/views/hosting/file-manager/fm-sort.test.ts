import type { FmDirectory, FmFile } from './file-manager.types'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT, nextSort, sortEntries } from './fm-sort'

function dir (basename: string, timestamp = 0): FmDirectory {
  return { type: 'dir', path: basename, basename, dirname: '', timestamp }
}

function file (basename: string, size: number, extension: string, timestamp = 0): FmFile {
  return { type: 'file', path: basename, basename, dirname: '', filename: basename, extension, size, timestamp }
}

const directories = [dir('beta', 5), dir('alpha', 9)]
const files = [file('b.txt', 30, 'txt', 1), file('a.zip', 10, 'zip', 3), file('c.md', 20, 'md', 2)]

describe('fm-sort', () => {
  it('sorts folders before files and by name ascending by default', () => {
    const sorted = sortEntries(directories, files, DEFAULT_SORT)
    expect(sorted.directories.map(item => item.basename)).toEqual(['alpha', 'beta'])
    expect(sorted.files.map(item => item.basename)).toEqual(['a.zip', 'b.txt', 'c.md'])
  })

  it('reverses name order going down, folders too', () => {
    const sorted = sortEntries(directories, files, { field: 'name', direction: 'down' })
    expect(sorted.directories.map(item => item.basename)).toEqual(['beta', 'alpha'])
    expect(sorted.files.map(item => item.basename)).toEqual(['c.md', 'b.txt', 'a.zip'])
  })

  it('sorts files by size and keeps folders by name', () => {
    const sorted = sortEntries(directories, files, { field: 'size', direction: 'down' })
    expect(sorted.files.map(item => item.size)).toEqual([30, 20, 10])
    expect(sorted.directories.map(item => item.basename)).toEqual(['alpha', 'beta'])
  })

  it('sorts files by extension for the type column', () => {
    const sorted = sortEntries(directories, files, { field: 'type', direction: 'up' })
    expect(sorted.files.map(item => item.extension)).toEqual(['md', 'txt', 'zip'])
  })

  it('sorts folders and files by date, folders included', () => {
    const sorted = sortEntries(directories, files, { field: 'date', direction: 'up' })
    expect(sorted.directories.map(item => item.basename)).toEqual(['beta', 'alpha'])
    expect(sorted.files.map(item => item.basename)).toEqual(['b.txt', 'c.md', 'a.zip'])
  })

  it('does not change the input arrays', () => {
    const copy = [...files]
    sortEntries(directories, files, { field: 'size', direction: 'down' })
    expect(files).toEqual(copy)
  })

  it('flips the direction on the active field and starts ascending on a new field', () => {
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ field: 'name', direction: 'down' })
    expect(nextSort({ field: 'name', direction: 'down' }, 'name')).toEqual({ field: 'name', direction: 'up' })
    expect(nextSort({ field: 'name', direction: 'down' }, 'size')).toEqual({ field: 'size', direction: 'up' })
  })
})
