import { describe, expect, it } from 'vitest'
import { clipboardRows, clipboardTypeInfo } from './fm-clipboard'

describe('clipboardRows', () => {
  it('is empty without a clipboard', () => {
    expect(clipboardRows(null)).toEqual([])
  })

  it('lists folders first, then files, with the last segment of the path as the name', () => {
    const rows = clipboardRows({ type: 'copy', directories: ['docs/a'], files: ['docs/a.png', 'notes.txt', 'backup.zip'] })

    expect(rows).toEqual([
      { type: 'directories', path: 'docs/a', name: 'a', icon: '$folder' },
      { type: 'files', path: 'docs/a.png', name: 'a.png', icon: '$image' },
      { type: 'files', path: 'notes.txt', name: 'notes.txt', icon: '$filetext' },
      { type: 'files', path: 'backup.zip', name: 'backup.zip', icon: '$archive' },
    ])
  })

  it('gives a file without an extension the generic icon', () => {
    expect(clipboardRows({ type: 'cut', directories: [], files: ['Makefile'] })[0]?.icon).toBe('$fileLine')
  })
})

describe('clipboardTypeInfo', () => {
  it('maps copy and cut to their icons and labels', () => {
    expect(clipboardTypeInfo('copy')).toEqual({ icon: '$copy', label: 'button.copy' })
    expect(clipboardTypeInfo('cut')).toEqual({ icon: '$cut', label: 'button.fileManager.cut' })
  })
})
