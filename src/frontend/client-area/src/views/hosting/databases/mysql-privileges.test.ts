import { describe, expect, it } from 'vitest'
import {
  allCheckboxValues,
  checkboxValues,
  determinePreset,
  MYSQL_PRIVILEGES,
  presetPrivileges,
  PRIVILEGE_PRESETS,
  privilegesFromForm,
  privilegesRequest,
} from './mysql-privileges'

describe('mysql-privileges', () => {
  it('lists the 18 privileges of legacy privileges(), in its order, without ALL PRIVILEGES', () => {
    expect(MYSQL_PRIVILEGES).toHaveLength(18)
    expect(MYSQL_PRIVILEGES[0]).toBe('ALTER')
    expect(MYSQL_PRIVILEGES[17]).toBe('UPDATE')
    expect(MYSQL_PRIVILEGES).not.toContain('ALL PRIVILEGES')
  })

  it('keeps the named presets in legacy order with their lists', () => {
    expect(PRIVILEGE_PRESETS.map(preset => [preset.value, preset.labelKey, preset.privileges])).toEqual([
      ['none', 'form.option.none', []],
      ['read', 'form.option.read', ['SELECT']],
      ['read_write', 'form.option.readWrite', ['SELECT', 'DELETE', 'INSERT', 'UPDATE']],
      ['all', 'form.option.full', ['ALL PRIVILEGES']],
    ])
  })

  it('gives the list of a named preset and none for custom or an unknown name', () => {
    expect(presetPrivileges('read')).toEqual(['SELECT'])
    expect(presetPrivileges('custom')).toEqual([])
    expect(presetPrivileges('nope')).toEqual([])
  })

  it('finds the preset of a list whatever the order, and custom when no preset matches', () => {
    expect(determinePreset([])).toBe('none')
    expect(determinePreset(['SELECT'])).toBe('read')
    expect(determinePreset(['UPDATE', 'SELECT', 'INSERT', 'DELETE'])).toBe('read_write')
    expect(determinePreset(['ALL PRIVILEGES'])).toBe('all')
    expect(determinePreset(['SELECT', 'INSERT'])).toBe('custom')
    expect(determinePreset(['SELECT', 'SELECT'])).toBe('custom')
  })

  it('sets the 18 checkboxes from a list and leaves ALL PRIVILEGES out', () => {
    const values = checkboxValues(['SELECT', 'INSERT'])
    expect(values.SELECT).toBe(true)
    expect(values.INSERT).toBe(true)
    expect(values.DELETE).toBe(false)
    expect(Object.keys(values)).toHaveLength(18)
    expect(values).not.toHaveProperty('ALL PRIVILEGES')
  })

  it('checks or clears every checkbox, ALL PRIVILEGES included', () => {
    const checked = allCheckboxValues(true)
    expect(Object.values(checked).every(Boolean)).toBe(true)
    expect(checked['ALL PRIVILEGES']).toBe(true)
    expect(Object.keys(checked)).toHaveLength(19)
    expect(Object.values(allCheckboxValues(false)).some(Boolean)).toBe(false)
  })

  it('grants the preset list for a named preset and ignores the boxes', () => {
    expect(privilegesFromForm({ privileges_preset: 'read_write', SELECT: false })).toEqual(['SELECT', 'DELETE', 'INSERT', 'UPDATE'])
    expect(privilegesFromForm({ privileges_preset: 'none' })).toEqual([])
  })

  it('grants ALL PRIVILEGES alone for custom with the ALL box, otherwise the checked boxes in legacy order', () => {
    expect(privilegesFromForm({ 'privileges_preset': 'custom', 'ALL PRIVILEGES': true, 'SELECT': true })).toEqual(['ALL PRIVILEGES'])
    expect(privilegesFromForm({ privileges_preset: 'custom', UPDATE: true, SELECT: true, ALTER: false })).toEqual(['SELECT', 'UPDATE'])
    expect(privilegesFromForm({ privileges_preset: 'custom' })).toEqual([])
  })

  it('sends a PUT with the comma-joined list, or a DELETE for an empty list', () => {
    expect(privilegesRequest(['SELECT', 'INSERT'])).toEqual({ method: 'PUT', body: { privileges: 'SELECT,INSERT' } })
    expect(privilegesRequest([])).toEqual({ method: 'DELETE' })
  })
})
