import { describe, expect, it } from 'vitest'
import { editorLanguageFor } from './fm-editor-language'
import { TEXT_EXTENSIONS } from './fm-file-type'

const PLAIN = ['htaccess', 'env', 'txt', 'log']

describe('fm-editor-language', () => {
  it('covers every one of the 31 text extensions', () => {
    expect(TEXT_EXTENSIONS).toHaveLength(31)
    for (const extension of TEXT_EXTENSIONS) {
      const loader = editorLanguageFor(extension)
      expect(loader === null || typeof loader === 'function').toBe(true)
    }
  })

  it('has no language only for the four plain extensions', () => {
    const plain = TEXT_EXTENSIONS.filter(extension => editorLanguageFor(extension) === null)
    expect(plain).toEqual(PLAIN)
  })

  it.each(TEXT_EXTENSIONS.filter(extension => !PLAIN.includes(extension)))('loads a language package for %s', async extension => {
    const loader = editorLanguageFor(extension)
    expect(loader).not.toBeNull()
    await expect(loader!()).resolves.toBeTruthy()
  })

  it('ignores the case of the extension', () => {
    expect(editorLanguageFor('TS')).toBe(editorLanguageFor('ts'))
    expect(editorLanguageFor('Json')).not.toBeNull()
  })

  it('returns null for extensions outside the legacy list', () => {
    expect(editorLanguageFor('exe')).toBeNull()
    expect(editorLanguageFor('')).toBeNull()
    expect(editorLanguageFor('constructor')).toBeNull()
  })
})
