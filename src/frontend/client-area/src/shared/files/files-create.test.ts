import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginFilesCreate,
  cancelFilesCreate,
  endFilesCreate,
  filesCreateCancelled,
  filesCreateUploadSignal,
  setFilesCreateProject,
} from './files-create'

describe('files create cancel', () => {
  beforeEach(() => {
    endFilesCreate()
  })

  it('cancels nothing when no files sequence runs', () => {
    expect(cancelFilesCreate()).toBe(false)
    expect(cancelFilesCreate(12)).toBe(false)
    expect(filesCreateCancelled()).toBe(false)
  })

  it('cancels the sequence of this tab from the progress screen and aborts its upload', () => {
    beginFilesCreate()
    const signal = filesCreateUploadSignal()
    expect(signal?.aborted).toBe(false)
    expect(cancelFilesCreate()).toBe(true)
    expect(filesCreateCancelled()).toBe(true)
    expect(filesCreateCancelled(12)).toBe(true)
    expect(signal?.aborted).toBe(true)
    // A second click is the same cancel, not a new one.
    expect(cancelFilesCreate()).toBe(true)
  })

  it('answers the project the sequence resolved, and no other', () => {
    beginFilesCreate()
    setFilesCreateProject(12)
    expect(cancelFilesCreate(13)).toBe(false)
    expect(filesCreateCancelled()).toBe(false)
    expect(filesCreateCancelled(13)).toBe(false)
    expect(cancelFilesCreate('12')).toBe(true)
    expect(filesCreateCancelled(12)).toBe(true)
  })

  it('sends the cancel of another project to the Engine while the create has no project yet', () => {
    // A running deploy of another project is that project's, whatever a files create of this tab is doing.
    beginFilesCreate()
    const signal = filesCreateUploadSignal()

    expect(cancelFilesCreate(12)).toBe(false)
    expect(signal?.aborted).toBe(false)
    expect(filesCreateCancelled()).toBe(false)
    expect(filesCreateCancelled(12)).toBe(false)

    // The sequence resolves its own project: it still runs, and the other one stays the Engine's.
    setFilesCreateProject(11)
    expect(cancelFilesCreate(12)).toBe(false)
    expect(filesCreateCancelled()).toBe(false)
    expect(filesCreateCancelled(11)).toBe(false)
  })

  it('is an ordinary project again once the sequence ended, whatever it left', () => {
    beginFilesCreate()
    setFilesCreateProject(12)
    cancelFilesCreate()
    endFilesCreate()
    expect(filesCreateCancelled()).toBe(false)
    expect(filesCreateCancelled(12)).toBe(false)
    expect(cancelFilesCreate(12)).toBe(false)
    expect(filesCreateUploadSignal()).toBeUndefined()
  })
})
