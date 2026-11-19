import { describe, expect, it } from 'vitest'
import { canSubmitUpload, invalidUploadNames, isUploadLimitExceeded, uploadTotalSize } from './fm-upload'

describe('fm-upload', () => {
  const files = [{ size: 400 }, { size: 300 }]

  it('sums the sizes of the selected files', () => {
    expect(uploadTotalSize(files)).toBe(700)
    expect(uploadTotalSize([])).toBe(0)
  })

  it('compares the sum, not each file, with the limit', () => {
    expect(isUploadLimitExceeded(files, 699)).toBe(true)
    expect(isUploadLimitExceeded(files, 700)).toBe(false)
    expect(isUploadLimitExceeded([{ size: 300 }, { size: 300 }], 500)).toBe(true)
  })

  it('blocks the submit without files and above the limit', () => {
    expect(canSubmitUpload([], 1024)).toBe(false)
    expect(canSubmitUpload(files, 699)).toBe(false)
    expect(canSubmitUpload(files, 1024)).toBe(true)
  })

  it('blocks the submit while a picked file name cannot be stored', () => {
    expect(invalidUploadNames([{ size: 10, name: String.raw`upl\oad.txt` }])).toEqual([String.raw`upl\oad.txt`])
    expect(invalidUploadNames([{ size: 10, name: 'sub/oad.txt' }])).toEqual(['sub/oad.txt'])
    expect(invalidUploadNames([{ size: 10, name: 'oad.txt' }, { size: 10 }])).toEqual([])
    expect(canSubmitUpload([{ size: 10, name: String.raw`upl\oad.txt` }], 1024)).toBe(false)
    expect(canSubmitUpload([{ size: 10, name: 'oad.txt' }], 1024)).toBe(true)
  })
})
