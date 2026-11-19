import { describe, expect, it } from 'vitest'
import { MOBILE_LABEL_WIDTH, MOBILE_VARIANTS, ROW_VARIANTS, SORT_VARIANTS } from './table-skeleton'

// Values of the `logs` variant (legacy LogsTableSortSkeleton, LogsTableSkeletonItem, LogsTableItemSkeletonMobile).
describe('table skeleton variants', () => {
  it('logs header has four bones', () => {
    expect(SORT_VARIANTS.logs).toEqual({ bones: 4 })
  })

  it('logs rows are 5 rows of 4 bones with the bg-text class', () => {
    expect(ROW_VARIANTS.logs).toEqual({ rows: 5, bones: 4, boneClass: 'bg-text' })
  })

  it('config header has three bones and an empty cell after them', () => {
    expect(SORT_VARIANTS.config).toEqual({ bones: 3, trailingEmpty: true })
  })

  it('theme header has three bones between two empty cells', () => {
    expect(SORT_VARIANTS.theme).toEqual({ bones: 3, leadingEmpty: true, trailingEmpty: true })
  })

  it('config rows are 5 rows of 3 bg-text bones and an avatar cell', () => {
    expect(ROW_VARIANTS.config).toEqual({ rows: 5, bones: 3, boneClass: 'bg-text', trailing: { type: 'avatar', class: 'avatar' } })
  })

  it('config card has six values and the actions row', () => {
    expect(MOBILE_VARIANTS.config).toEqual({
      values: [
        { width: '30%' },
        { width: '60%' },
        { width: '60%' },
        { width: '60%' },
        { width: '60%' },
        { width: '60%' },
      ],
      actions: true,
    })
  })

  it('plugin header has three bones between two empty cells', () => {
    expect(SORT_VARIANTS.plugin).toEqual({ bones: 3, leadingEmpty: true, trailingEmpty: true })
  })

  it('backups header has six bg-text bones between two empty cells', () => {
    expect(SORT_VARIANTS.backups).toEqual({ bones: 6, boneClass: 'bg-text', leadingEmpty: true, trailingEmpty: true })
  })

  it('plugin rows keep the V2 palette class text on their bones', () => {
    expect(ROW_VARIANTS.plugin).toEqual({ rows: 5, bones: 3, leadingEmpty: true, boneClass: 'text', trailing: { type: 'avatar', class: 'avatar' } })
  })

  it('backups rows have an empty cell, six bg-text bones and a bg-text avatar', () => {
    expect(ROW_VARIANTS.backups).toEqual({ rows: 5, bones: 6, leadingEmpty: true, boneClass: 'bg-text', trailing: { type: 'avatar', class: 'bg-text avatar' } })
  })

  it('backups card has four bg-text values and the actions row', () => {
    expect(MOBILE_VARIANTS.backups).toEqual({
      values: [{ width: '50%' }, { width: '30%' }, { width: '10%' }, { width: '15%' }],
      boneClass: 'bg-text',
      actions: true,
    })
  })

  it('invoice header has five bones and an empty cell after them', () => {
    expect(SORT_VARIANTS.invoice).toEqual({ bones: 5, trailingEmpty: true })
  })

  it('devices header has six bones between two empty cells', () => {
    expect(SORT_VARIANTS.devices).toEqual({ bones: 6, leadingEmpty: true, trailingEmpty: true })
  })

  it('services header has four bg-text bones', () => {
    expect(SORT_VARIANTS.services).toEqual({ bones: 4, boneClass: 'bg-text' })
  })

  it('invoice rows are 5 rows of five bg-text bones and a button cell', () => {
    expect(ROW_VARIANTS.invoice).toEqual({ rows: 5, bones: 5, boneClass: 'bg-text', trailing: { type: 'button' } })
  })

  it('devices rows have an empty cell and six bg-text bones', () => {
    expect(ROW_VARIANTS.devices).toEqual({ rows: 5, bones: 6, leadingEmpty: true, boneClass: 'bg-text' })
  })

  it('services rows are 3 rows of three bg-text bones and a button cell', () => {
    expect(ROW_VARIANTS.services).toEqual({ rows: 3, bones: 3, boneClass: 'bg-text', trailing: { type: 'button' } })
  })

  it('invoice and services cards have six values and the actions row; services bones are bg-text', () => {
    const values = [{ width: '30%' }, { width: '60%' }, { width: '60%' }, { width: '60%' }, { width: '60%' }, { width: '60%' }]
    expect(MOBILE_VARIANTS.invoice).toEqual({ values, actions: true })
    expect(MOBILE_VARIANTS.services).toEqual({ values, boneClass: 'bg-text', actions: true })
  })

  it('devices card has four values and the actions row', () => {
    expect(MOBILE_VARIANTS.devices).toEqual({
      values: [{ width: '50%' }, { width: '30%' }, { width: '10%' }, { width: '15%' }],
      actions: true,
    })
  })

  it('logs card has four values under a 25% label', () => {
    expect(MOBILE_LABEL_WIDTH).toBe('25%')
    expect(MOBILE_VARIANTS.logs).toEqual({
      values: [
        { width: '30%' },
        { width: '40%' },
        { width: '80%', type: 'text@2' },
        { width: '15%' },
      ],
    })
  })
})
