import { describe, expect, it } from 'vitest'
import {
  dataTransferHasFiles,
  DROP_ERROR_KEYS,
  flattenSelections,
  getFileExtension,
  getUploadContentType,
  getUploadFilename,
  isAllowedStandaloneFile,
  MAX_FILE_SELECTIONS,
  normalizePayloadFiles,
  selectionsFromDataTransfer,
  selectionsFromEntries,
  selectionsFromFileList,
} from './drop-files'

function file (name: string, relativePath?: string): File {
  const created = new File(['x'], name)
  if (relativePath) {
    Object.defineProperty(created, 'webkitRelativePath', { value: relativePath })
  }
  return created
}

function fileEntry (name: string): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (value: File) => void) => resolve(file(name)),
  } as unknown as FileSystemEntry
}

function directoryEntry (name: string, children: FileSystemEntry[]): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      // two batches, then an empty one (the legacy reader loops until it gets an empty batch)
      const batches = [children.slice(0, 1), children.slice(1), []]
      return { readEntries: (callback: (batch: FileSystemEntry[]) => void) => callback(batches.shift() ?? []) }
    },
  } as unknown as FileSystemEntry
}

function dataTransfer (entries: FileSystemEntry[] | null, files: File[] = [], types: string[] = ['Files']): DataTransfer {
  return {
    types,
    files,
    items: entries === null ? [] : entries.map(entry => ({ webkitGetAsEntry: () => entry })),
  } as unknown as DataTransfer
}

describe('getFileExtension / isAllowedStandaloneFile', () => {
  it('knows the extensions, compound ones first, case-insensitive', () => {
    expect(getFileExtension('Site.ZIP')).toBe('zip')
    expect(getFileExtension('a.tar.gz')).toBe('tar.gz')
    expect(getFileExtension('readme.txt')).toBeNull()
    expect(getFileExtension('')).toBeNull()
    expect(getFileExtension(undefined)).toBeNull()
  })

  it('allows only .zip and .tar.gz as standalone files', () => {
    for (const name of ['a.zip', 'A.TAR.GZ']) {
      expect(isAllowedStandaloneFile({ name })).toBe(true)
    }
    for (const name of ['a.sql', 'a.sql.gz', 'a.sqlite', 'a.db', 'a.gz', 'a.rar']) {
      expect(isAllowedStandaloneFile({ name })).toBe(false)
    }
  })
})

describe('selectionsFromFileList', () => {
  it('turns one archive into one selection', () => {
    const result = selectionsFromFileList([file('a.zip')], 0)
    expect(result.errorKey).toBeNull()
    expect(result.selections.map(selection => [selection.kind, selection.label])).toEqual([['file', 'a.zip']])
    expect(flattenSelections(result.selections).map(item => item.name)).toEqual(['a.zip'])
  })

  it('rejects a disallowed type, a database file and more than one archive', () => {
    expect(selectionsFromFileList([file('b.rar')], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.invalidType })
    expect(selectionsFromFileList([file('b.sql')], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.invalidType })
    expect(MAX_FILE_SELECTIONS).toBe(1)
    expect(selectionsFromFileList([file('a.zip'), file('b.zip')], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.maxSelections })
    expect(selectionsFromFileList([file('a.zip')], 1).errorKey).toBe(DROP_ERROR_KEYS.maxSelections)
  })

  it('rejects files with relative paths (a folder), whatever their type', () => {
    const result = selectionsFromFileList([file('a.zip', 'site/a.zip')], 0)
    expect(result).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.invalidType })
  })

  it('rejects an archive over the panel upload limit, naming the limit, and takes one at it', () => {
    const sized = (name: string, size: number) => {
      const created = file(name)
      Object.defineProperty(created, 'size', { value: size })
      return created
    }
    expect(selectionsFromFileList([sized('big.zip', 5_242_881)], 0, 5_242_880)).toEqual({
      selections: [],
      errorKey: DROP_ERROR_KEYS.tooLarge,
      errorParams: { size: '5 MB' },
    })
    expect(selectionsFromFileList([sized('ok.zip', 5_242_880)], 0, 5_242_880).errorKey).toBeNull()
    // No limit given: the rule stays out of the way (the flow checks it too).
    expect(selectionsFromFileList([sized('big.zip', 5_242_881)], 0).errorKey).toBeNull()
  })

  it('answers an empty list without an error (the zone reports file.empty)', () => {
    expect(selectionsFromFileList([], 0)).toEqual({ selections: [], errorKey: null })
  })
})

describe('selectionsFromEntries', () => {
  it('rejects a dropped folder without reading it', async () => {
    const tree = directoryEntry('site', [fileEntry('index.php')])
    expect(await selectionsFromEntries([tree], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.invalidType })
    expect(await selectionsFromEntries([tree, fileEntry('a.zip')], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.invalidType })
  })

  it('rejects a file of a disallowed type and more than one entry', async () => {
    expect(await selectionsFromEntries([fileEntry('notes.txt')], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.invalidType })
    expect(await selectionsFromEntries([fileEntry('dump.sql')], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.invalidType })
    expect(await selectionsFromEntries([fileEntry('a.zip'), fileEntry('b.zip')], 0)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.maxSelections })
  })

  it('takes one archive', async () => {
    const result = await selectionsFromEntries([fileEntry('a.tar.gz')], 0)
    expect(result.errorKey).toBeNull()
    expect(result.selections.map(selection => selection.label)).toEqual(['a.tar.gz'])
  })
})

describe('selectionsFromDataTransfer', () => {
  it('uses the entries when the browser gives them, the plain file list otherwise', async () => {
    const withEntries = await selectionsFromDataTransfer(dataTransfer([fileEntry('a.zip')]))
    expect(withEntries.selections.map(selection => selection.label)).toEqual(['a.zip'])

    const plain = await selectionsFromDataTransfer(dataTransfer(null, [file('b.zip')]))
    expect(plain.selections.map(selection => selection.label)).toEqual(['b.zip'])
  })

  it('answers readFailed when reading throws', async () => {
    const broken = { items: [{ webkitGetAsEntry: () => {
      throw new Error('boom')
    } }], files: [], types: ['Files'] } as unknown as DataTransfer
    expect(await selectionsFromDataTransfer(broken)).toEqual({ selections: [], errorKey: DROP_ERROR_KEYS.readFailed })
  })
})

describe('helpers', () => {
  it('dataTransferHasFiles looks for the Files type', () => {
    expect(dataTransferHasFiles(dataTransfer([], [], ['Files']))).toBe(true)
    expect(dataTransferHasFiles(dataTransfer([], [], ['text/plain']))).toBe(false)
    expect(dataTransferHasFiles(null)).toBe(false)
  })
})

describe('getUploadContentType / getUploadFilename / normalizePayloadFiles (legacy upload helpers)', () => {
  it('keeps the browser type of the file when it has one', () => {
    expect(getUploadContentType('zip', { type: 'application/x-zip-compressed' })).toBe('application/x-zip-compressed')
  })

  it('falls back to the type of the extension, with octet-stream for the rest', () => {
    expect(getUploadContentType('zip', { type: '' })).toBe('application/zip')
    expect(getUploadContentType('tar.gz', { type: '' })).toBe('application/gzip')
    expect(getUploadContentType(null, { type: '' })).toBe('application/octet-stream')
  })

  it('names an upload by its folder path when it has one, else by its file name', () => {
    expect(getUploadFilename(file('index.html', 'site/index.html'))).toBe('site/index.html')
    expect(getUploadFilename(file('dump.sql'))).toBe('dump.sql')
  })

  it('takes the first payload list that has files: uploadItems, files, file, then nothing', () => {
    const a = file('a.zip')
    const b = file('b.zip')
    const c = file('c.zip')

    expect(normalizePayloadFiles({ uploadItems: [a], files: [b], file: c })).toEqual([a])
    expect(normalizePayloadFiles({ uploadItems: [], files: [b] })).toEqual([b])
    expect(normalizePayloadFiles({ file: c })).toEqual([c])
    expect(normalizePayloadFiles({ uploadItems: [] })).toEqual([])
    expect(normalizePayloadFiles(null)).toEqual([])
  })
})
