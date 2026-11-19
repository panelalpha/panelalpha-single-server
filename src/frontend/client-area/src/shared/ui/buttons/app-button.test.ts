import { describe, expect, it } from 'vitest'
import { appButtonBindings, type AppButtonKind, appButtonTooltip } from './app-button'

describe('appButtonBindings', () => {
  it('default adds nothing to v-btn', () => {
    expect(appButtonBindings('default')).toEqual({})
  })

  it('close is the x-small text icon button of a modal title', () => {
    expect(appButtonBindings('close')).toEqual({ icon: true, size: 'x-small', variant: 'text', class: 'modal-close-button' })
  })

  it('icon is the x-small text icon button', () => {
    expect(appButtonBindings('icon')).toEqual({ icon: true, size: 'x-small', variant: 'text' })
  })

  it('icon-labeled is the vertical text button, flat when filled', () => {
    expect(appButtonBindings('icon-labeled')).toEqual({ class: 'v-btn--vertical', elevation: '0', height: 'auto', variant: 'text' })
    expect(appButtonBindings('icon-labeled', { filled: false })).toEqual({ class: 'v-btn--vertical', elevation: '0', height: 'auto', variant: 'text' })
    expect(appButtonBindings('icon-labeled', { filled: true })).toEqual({ class: 'v-btn--vertical', elevation: '0', height: 'auto', variant: 'flat' })
  })

  it('page-add is the flat primary Add button of a page title', () => {
    expect(appButtonBindings('page-add')).toEqual({ class: 'p-2 add-new-button page-title__add-button', color: 'primary', elevation: '0' })
  })

  it('row-action is the small text icon button of a table row', () => {
    expect(appButtonBindings('row-action')).toEqual({ icon: true, size: 'small', variant: 'text' })
  })

  it('icon-toggle is the outlined primary icon button when active, the text one otherwise', () => {
    expect(appButtonBindings('icon-toggle', { active: true })).toEqual({ icon: true, variant: 'outlined', color: 'primary' })
    expect(appButtonBindings('icon-toggle', { active: false })).toEqual({ icon: true, variant: 'text' })
    expect(appButtonBindings('icon-toggle')).toEqual({ icon: true, variant: 'text' })
  })

  it('toolbar is the text icon button of a toolbar, primary when active', () => {
    expect(appButtonBindings('toolbar')).toEqual({ icon: true, variant: 'text', class: 'app-button--toolbar' })
    expect(appButtonBindings('toolbar', { active: false })).toEqual({ icon: true, variant: 'text', class: 'app-button--toolbar' })
    expect(appButtonBindings('toolbar', { active: true })).toEqual({ icon: true, variant: 'text', color: 'primary', class: 'app-button--toolbar' })
  })

  it('primary is the filled submit without shadow, cancel the gray text button', () => {
    expect(appButtonBindings('primary')).toEqual({ color: 'primary', elevation: '0', variant: 'elevated' })
    expect(appButtonBindings('cancel')).toEqual({ color: 'gray', elevation: '0', variant: 'text' })
  })

  it('setting-action is the white bordered action of a setting card', () => {
    expect(appButtonBindings('setting-action')).toEqual({ class: 'mt-0 pt-0 font-weight-bold v-btn--default', elevation: '0' })
  })

  it('danger, field, secondary, link and text are the filled error, outlined primary, outlined gray, text primary and plain text buttons', () => {
    expect(appButtonBindings('danger')).toEqual({ color: 'error', elevation: '0', variant: 'elevated' })
    expect(appButtonBindings('field')).toEqual({ color: 'primary', elevation: '0', variant: 'outlined' })
    expect(appButtonBindings('secondary')).toEqual({ color: 'gray', elevation: '0', variant: 'outlined' })
    expect(appButtonBindings('link')).toEqual({ color: 'primary', elevation: '0', variant: 'text' })
    expect(appButtonBindings('text')).toEqual({ elevation: '0', variant: 'text' })
  })

  it('surface is the V2 gray default button: no shadow, the fill comes from the class (#40)', () => {
    expect(appButtonBindings('surface')).toEqual({ class: 'app-button--surface', elevation: '0' })
  })

  it('never sets a key to undefined in the kinds of kit-button-rest', () => {
    for (const kind of ['danger', 'field', 'secondary', 'link', 'text', 'surface'] as AppButtonKind[]) {
      expect(Object.values(appButtonBindings(kind)).every(value => value !== undefined)).toBe(true)
    }
  })

  it('ignores filled outside icon-labeled and active outside icon-toggle', () => {
    expect(appButtonBindings('close', { filled: true })).toEqual(appButtonBindings('close'))
    expect(appButtonBindings('row-action', { active: true })).toEqual(appButtonBindings('row-action'))
  })

  it('never sets a key to undefined', () => {
    const kinds: AppButtonKind[] = ['default', 'close', 'icon', 'icon-labeled', 'page-add', 'row-action', 'icon-toggle', 'primary', 'cancel', 'setting-action']
    for (const kind of kinds) {
      for (const value of Object.values(appButtonBindings(kind))) {
        expect(value).not.toBeUndefined()
      }
    }
    expect(Object.values(appButtonBindings('icon-toggle', { active: true })).every(value => value !== undefined)).toBe(true)
  })
})

describe('appButtonTooltip', () => {
  const base = { location: 'bottom', openDelay: '150', transition: 'custom-tooltip', zIndex: 99 }

  it('has the literals of the row tooltips and no offset or class without options', () => {
    expect(appButtonTooltip({})).toEqual(base)
    expect(Object.keys(appButtonTooltip({})).toSorted()).toEqual(['location', 'openDelay', 'transition', 'zIndex'])
    expect(appButtonTooltip()).toEqual(base)
  })

  it('adds the offset and the content class only when given', () => {
    expect(appButtonTooltip({ offset: 4 })).toEqual({ ...base, offset: 4 })
    expect(appButtonTooltip({ contentClass: 'users-row-tooltip' })).toEqual({ ...base, contentClass: 'users-row-tooltip' })
    expect(appButtonTooltip({ offset: 14, contentClass: 'env-vars-tooltip' })).toEqual({ ...base, offset: 14, contentClass: 'env-vars-tooltip' })
  })
})
