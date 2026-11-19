import { describe, expect, it } from 'vitest'
import { baseName, isInvalidItemName, joinPath, normalizePath, parentPath, pathSegments, validateItemName } from './fm-path'

describe('fm-path', () => {
  it('normalizes to a relative path without leading or trailing slashes', () => {
    expect(normalizePath('/a//b/')).toBe('a/b')
    expect(normalizePath('')).toBe('')
  })

  it('joins a name to a folder, the home folder has no prefix', () => {
    expect(joinPath('', 'docs')).toBe('docs')
    expect(joinPath('docs', 'a.txt')).toBe('docs/a.txt')
  })

  it('gives the parent folder and the base name', () => {
    expect(parentPath('a/b/c')).toBe('a/b')
    expect(parentPath('a')).toBe('')
    expect(parentPath('')).toBe('')
    expect(baseName('a/b/c.txt')).toBe('c.txt')
    expect(baseName('')).toBe('')
  })

  it('builds breadcrumb segments without the root', () => {
    expect(pathSegments('a/b')).toEqual([
      { name: 'a', path: 'a' },
      { name: 'b', path: 'a/b' },
    ])
    expect(pathSegments('')).toEqual([])
  })

  it('rejects an empty name and a name that is taken in the folder, as the legacy modals do', () => {
    expect(validateItemName('', ['x'])).toBe('empty')
    expect(validateItemName('x', ['x', 'y'])).toBe('exists')
    expect(validateItemName('z', ['x', 'y'])).toBeNull()
  })

  it('rejects a name that is not one path segment: a separator or a NUL', () => {
    expect(validateItemName('sub/victim.txt', [])).toBe('invalid')
    expect(validateItemName(String.raw`sub\victim.txt`, [])).toBe('invalid')
    expect(validateItemName('a\0b', [])).toBe('invalid')
    expect(validateItemName('sub-victim.txt', [])).toBeNull()
    expect(isInvalidItemName(String.raw`sub\victim.txt`)).toBe(true)
    expect(isInvalidItemName('upl/oad.txt')).toBe(true)
    expect(isInvalidItemName('my file.txt')).toBe(false)
  })
})
