import type { FmDirectory, FmFile } from './file-manager.types'
import { describe, expect, it } from 'vitest'
import { isAdditiveClick, isItemSelected } from './fm-selection'

const folder: FmDirectory = { type: 'dir', path: 'docs', basename: 'docs', dirname: '', timestamp: 0 }
const file: FmFile = { type: 'file', path: 'docs/a.txt', basename: 'a.txt', dirname: 'docs', filename: 'a', extension: 'txt', size: 1, timestamp: 0 }

describe('isAdditiveClick', () => {
  it('treats Ctrl and Cmd (meta) as additive, a plain click as replacing', () => {
    expect(isAdditiveClick({ ctrlKey: true, metaKey: false })).toBe(true)
    expect(isAdditiveClick({ ctrlKey: false, metaKey: true })).toBe(true)
    expect(isAdditiveClick({ ctrlKey: false, metaKey: false })).toBe(false)
  })
})

describe('isItemSelected', () => {
  it('looks a folder up in the directories and a file in the files', () => {
    const selection = { directories: ['docs'], files: ['docs/a.txt'] }

    expect(isItemSelected(selection, folder)).toBe(true)
    expect(isItemSelected(selection, file)).toBe(true)
    expect(isItemSelected({ directories: ['docs/a.txt'], files: [] }, file)).toBe(false)
  })
})
