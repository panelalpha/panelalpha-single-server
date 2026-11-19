import { describe, expect, it } from 'vitest'
import { dragLeaveDepth, dropZoneClasses, filesOf } from './drop-zone'

describe('dropZoneClasses', () => {
  it('maps the state to the legacy modifier classes', () => {
    expect(dropZoneClasses({ active: false, disabled: false, reading: false, filled: false })).toEqual({
      'drop-zone--active': false,
      'drop-zone--disabled': false,
      'drop-zone--reading': false,
      'drop-zone--filled': false,
    })
    expect(dropZoneClasses({ active: true, disabled: true, reading: true, filled: false })).toEqual({
      'drop-zone--active': true,
      'drop-zone--disabled': true,
      'drop-zone--reading': true,
      'drop-zone--filled': false,
    })
  })

  it('shows --disabled only on an empty zone', () => {
    expect(dropZoneClasses({ active: false, disabled: true, reading: false, filled: true })['drop-zone--disabled']).toBe(false)
  })
})

describe('dragLeaveDepth', () => {
  it('counts down and never below zero', () => {
    expect(dragLeaveDepth(2)).toBe(1)
    expect(dragLeaveDepth(1)).toBe(0)
    expect(dragLeaveDepth(0)).toBe(0)
  })
})

describe('filesOf', () => {
  it('copies a file list into an array', () => {
    const a = new File(['x'], 'a.zip')
    const b = new File(['x'], 'b.zip')
    const list = { 0: a, 1: b, length: 2 } as ArrayLike<File>
    expect(filesOf(list)).toEqual([a, b])
    expect(filesOf(null)).toEqual([])
    expect(filesOf(undefined)).toEqual([])
  })
})
