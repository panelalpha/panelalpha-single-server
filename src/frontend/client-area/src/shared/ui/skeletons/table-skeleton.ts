// Variants of the table skeleton pattern (`TableSkeletonSort`, `TableSkeletonRow`, `TableSkeletonMobile`).
// A variant fixes the count and the kind of the bones; widths, paddings and colours live in the scoped SCSS of the pattern component,
// one block per variant. Every value is the one the preset of that name rendered before the pattern.

export type TableSkeletonSortVariant = 'logs' | 'config' | 'theme' | 'plugin' | 'backups' | 'invoice' | 'devices' | 'services'
export type TableSkeletonRowVariant = 'logs' | 'config' | 'plugin' | 'backups' | 'invoice' | 'devices' | 'services'
export type TableSkeletonMobileVariant = 'logs' | 'config' | 'backups' | 'invoice' | 'devices' | 'services'

/** Header skeleton: `bones` cells with one text bone each (`boneClass` on every bone loader), optionally an empty `th` before and after them. */
export interface SortVariant {
  bones: number
  boneClass?: string
  leadingEmpty?: boolean
  trailingEmpty?: boolean
}

/** Last cell of a row: one loader of this type (and `class`), after the `bones` text cells. */
export interface RowTrailing {
  type: string
  class?: string
}

/** Rows skeleton: `rows` rows of `bones` cells with one text bone each (`boneClass` on every bone loader), optionally an empty `td` before them, then the optional `trailing` cell. */
export interface RowVariant {
  rows: number
  bones: number
  leadingEmpty?: boolean
  boneClass?: string
  trailing?: RowTrailing
}

/** One value line of the mobile card: the loader `width` and the loader `type` (default `text`). */
export interface MobileValue {
  width: string
  type?: string
}

/** Mobile card: one group per value, each with a label bone (`MOBILE_LABEL_WIDTH`) above the value bone; `actions` adds the avatar row; `boneClass` goes on every loader. */
export interface MobileVariant {
  values: MobileValue[]
  boneClass?: string
  actions?: boolean
}

export const MOBILE_LABEL_WIDTH = '25%'

export const SORT_VARIANTS: Record<TableSkeletonSortVariant, SortVariant> = {
  logs: { bones: 4 },
  config: { bones: 3, trailingEmpty: true },
  theme: { bones: 3, leadingEmpty: true, trailingEmpty: true },
  plugin: { bones: 3, leadingEmpty: true, trailingEmpty: true },
  backups: { bones: 6, boneClass: 'bg-text', leadingEmpty: true, trailingEmpty: true },
  invoice: { bones: 5, trailingEmpty: true },
  devices: { bones: 6, leadingEmpty: true, trailingEmpty: true },
  services: { bones: 4, boneClass: 'bg-text' },
}

export const ROW_VARIANTS: Record<TableSkeletonRowVariant, RowVariant> = {
  logs: { rows: 5, bones: 4, boneClass: 'bg-text' },
  config: { rows: 5, bones: 3, boneClass: 'bg-text', trailing: { type: 'avatar', class: 'avatar' } },
  // legacy `plugin` bones carry the V2 palette class `text` as it is (the V4 palette class is `bg-text`)
  plugin: { rows: 5, bones: 3, leadingEmpty: true, boneClass: 'text', trailing: { type: 'avatar', class: 'avatar' } },
  backups: { rows: 5, bones: 6, leadingEmpty: true, boneClass: 'bg-text', trailing: { type: 'avatar', class: 'bg-text avatar' } },
  invoice: { rows: 5, bones: 5, boneClass: 'bg-text', trailing: { type: 'button' } },
  devices: { rows: 5, bones: 6, leadingEmpty: true, boneClass: 'bg-text' },
  // the Services list shows three rows, not five
  services: { rows: 3, bones: 3, boneClass: 'bg-text', trailing: { type: 'button' } },
}

export const MOBILE_VARIANTS: Record<TableSkeletonMobileVariant, MobileVariant> = {
  logs: {
    values: [
      { width: '30%' },
      { width: '40%' },
      { width: '80%', type: 'text@2' },
      { width: '15%' },
    ],
  },
  config: {
    values: [
      { width: '30%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
    ],
    actions: true,
  },
  backups: {
    values: [
      { width: '50%' },
      { width: '30%' },
      { width: '10%' },
      { width: '15%' },
    ],
    boneClass: 'bg-text',
    actions: true,
  },
  invoice: {
    values: [
      { width: '30%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
    ],
    actions: true,
  },
  devices: {
    values: [
      { width: '50%' },
      { width: '30%' },
      { width: '10%' },
      { width: '15%' },
    ],
    actions: true,
  },
  services: {
    values: [
      { width: '30%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
      { width: '60%' },
    ],
    boneClass: 'bg-text',
    actions: true,
  },
}
