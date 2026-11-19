import type { HomeResponse } from '@/shared/session/session.api'
import type { BackupRow } from '@/entities/project/instance-backups.api'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import TableCustomSort from '@/shared/ui/data-table/TableCustomSort.vue'
import Checkbox from '@/shared/ui/form/Checkbox.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { type BackupItem, buildHeaders, decorateBackup } from './backups-list'
import BackupsTable from './BackupsTable.vue'

const t = (key: string) => key

const DESKTOP_WIDTH = 1400
const MOBILE_WIDTH = 900

function setWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function row (overrides: Partial<BackupRow> = {}): BackupRow {
  return {
    id: 1,
    name: 'Nightly',
    date: 1_700_000_000,
    size: 1024,
    type: 'manual',
    mode: 'full',
    convert_from_id: null,
    version: null,
    note: 'before update',
    directory: true,
    database: false,
    async_status: null,
    items: [],
    ...overrides,
  }
}

async function mountTable (items: BackupItem[], props: Record<string, unknown> = {}, searchTerm = '') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const headers = buildHeaders(items, t)
  return mountKit(BackupsTable, {
    props: { headers, items, itemsLength: items.length, searchTerm, ...props },
    global: { plugins: [pinia] },
  })
}

describe('BackupsTable', () => {
  // jsdom starts at 1024 px, which is below the 1200 px switch: the desktop cases pin a desktop width.
  beforeEach(() => {
    setWidth(DESKTOP_WIDTH)
  })

  afterEach(() => {
    setWidth(1024)
  })

  it('renders one row per backup of the page', async () => {
    const wrapper = await mountTable([decorateBackup(row({ id: 1 })), decorateBackup(row({ id: 2 }))])

    expect(wrapper.findAll('.v-data-table__tr')).toHaveLength(2)
  })

  it('marks the table with the version column only when a row has a version', async () => {
    const without = await mountTable([decorateBackup(row({ version: null }))])
    const withVersion = await mountTable([decorateBackup(row({ version: '6.4' }))])

    expect(without.classes()).not.toContain('data-table--has-version')
    expect(withVersion.classes()).toContain('data-table--has-version')
  })

  // Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
  it('renders Convert to full, Download, Restore and Delete of the rows with their tooltips unchanged', async () => {
    const wrapper = await mountTable([decorateBackup(row({ id: 1, mode: 'incremental' })), decorateBackup(row({ id: 2, mode: 'full' }))])

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.backup.convertToFull"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.backup.convertToFull</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.backup.download"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.backup.download</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.restoreBackup"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.restoreBackup</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.deleteBackup"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.deleteBackup</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.backup.download"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.backup.download</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.restoreBackup"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.restoreBackup</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.deleteBackup"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.deleteBackup</span>",
          },
        },
      ]
    `)
  })

  it('renders no Delete icon of an automatic backup on a server with its own backup system', async () => {
    const wrapper = await mountTable([decorateBackup(row({ id: 1, type: 'automatic' }))], { usesOwnBackupSystem: true })

    expect(await iconButtonsSnapshot(wrapper.get('tbody'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.backup.download"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.backup.download</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.restoreBackup"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.restoreBackup</span>",
          },
        },
      ]
    `)
  })

  it('shows the no-results container for a search that matches nothing', async () => {
    const wrapper = await mountTable([], {}, 'abc')

    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    expect(wrapper.find('[data-testid="backups-empty"]').exists()).toBe(false)
  })

  // The header is hidden only when the list is empty and no search is set.
  it('keeps the header row for a search that matches nothing, and drops it for an empty list', async () => {
    const headers = buildHeaders([decorateBackup(row())], t)
    const searched = await mountTable([], { headers }, 'abc')
    expect(searched.findComponent(TableCustomSort).exists()).toBe(true)
    expect(searched.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)

    const empty = await mountTable([], { headers })
    expect(empty.findComponent(TableCustomSort).exists()).toBe(false)
  })

  it('writes the date in the session format in bold, then the time', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().home = { app: { default_date_format: 'DD.MM.YYYY' } } as HomeResponse
    const items = [decorateBackup(row({ date: new Date(2026, 9, 5, 9, 7).getTime() / 1000 }))]

    const wrapper = await mountKit(BackupsTable, {
      props: { headers: buildHeaders(items, t), items, itemsLength: 1 },
      global: { plugins: [pinia] },
    })

    expect(wrapper.find('.font-weight-bold').text()).toBe('05.10.2026')
    expect(wrapper.text()).toContain('05.10.2026 09:07')
  })

  it('emits the download action with the row', async () => {
    const items = [decorateBackup(row({ id: 7 }))]
    const wrapper = await mountTable(items)

    // Manual full backup: convert is hidden, so the first action button is download.
    await wrapper.findAll('.actions-row button')[0].trigger('click')

    expect(wrapper.emitted('action-button-download')?.[0]?.[0]).toMatchObject({ id: 7 })
  })

  it('hides delete for a non-manual backup on a server with its own backup system', async () => {
    const items = [decorateBackup(row({ type: 'automatic' }))]
    const wrapper = await mountTable(items, { usesOwnBackupSystem: true })

    // Download, restore only: delete is hidden.
    expect(wrapper.findAll('.actions-row button')).toHaveLength(2)
  })

  it('renders the mobile item instead of the desktop cells below 1200 px', async () => {
    setWidth(MOBILE_WIDTH)
    const items = [decorateBackup(row({ id: 1 })), decorateBackup(row({ id: 2 }))]

    const wrapper = await mountTable(items)

    expect(wrapper.findAll('[data-testid="backups-mobile-item"]')).toHaveLength(2)
    expect(wrapper.find('.actions-row').exists()).toBe(false)
  })

  it('renders the desktop cells from 1200 px', async () => {
    const wrapper = await mountTable([decorateBackup(row())])

    expect(wrapper.find('[data-testid="backups-mobile-item"]').exists()).toBe(false)
    expect(wrapper.find('.actions-row').exists()).toBe(true)
  })

  it('forwards the mobile sort header click as update:sort-by', async () => {
    setWidth(MOBILE_WIDTH)
    const wrapper = await mountTable([decorateBackup(row())])

    const size = wrapper.findAll('.mobile-table-item__header').find(header => header.text() === 'table.header.size')
    await size!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'size', sortable: true })
  })

  it('shows the pending message and a loader in place of the buttons while an action runs', async () => {
    const items = [decorateBackup(row({ id: 3, async_status: { create: 'in_progress' } }))]
    const wrapper = await mountTable(items)

    expect(wrapper.find('.actions-row button').exists()).toBe(false)
    expect(wrapper.find('.loader').exists()).toBe(true)
    expect(wrapper.find('.actions-row').text()).toContain('message.status.backup.create.pending')
    expect(wrapper.find('.try-again').exists()).toBe(false)
  })

  it('shows the failed message and the try link, which emits the repeat action with the row', async () => {
    const items = [decorateBackup(row({ id: 4, async_status: { create: 'failed' } }))]
    const wrapper = await mountTable(items)

    expect(wrapper.find('.actions-row').text()).toContain('message.status.backup.create.failed')
    await wrapper.get('.try-again').trigger('click')

    expect(wrapper.emitted('action-button-repeat')?.[0]?.[0]).toMatchObject({ id: 4 })
  })

  it('keeps the buttons for a row with a finished or null async status', async () => {
    const items = [decorateBackup(row({ id: 5, async_status: null }))]
    const wrapper = await mountTable(items)

    expect(wrapper.findAll('.actions-row button').length).toBeGreaterThan(0)
    expect(wrapper.find('.try-again').exists()).toBe(false)
  })

  it('shows the convert to full button only for an incremental backup', async () => {
    const incremental = await mountTable([decorateBackup(row({ mode: 'incremental' }))])
    const full = await mountTable([decorateBackup(row({ mode: 'full' }))])

    // Convert, download, restore, delete for the incremental row; download, restore, delete for the full one.
    expect(incremental.findAll('.actions-row button')).toHaveLength(4)
    expect(full.findAll('.actions-row button')).toHaveLength(3)
  })

  it('emits convert to full with the row', async () => {
    const wrapper = await mountTable([decorateBackup(row({ id: 8, mode: 'incremental' }))])

    await wrapper.findAll('.actions-row button')[0].trigger('click')

    expect(wrapper.emitted('action-button-convert-to-full')?.[0]?.[0]).toMatchObject({ id: 8 })
  })
})

describe('tabela (kit-data-table-advanced)', () => {
  const items: BackupItem[] = [decorateBackup(row({ id: 1, name: 'A' })), decorateBackup(row({ id: 2, name: 'B' }))]

  afterEach(() => {
    setWidth(DESKTOP_WIDTH)
  })

  it('zaznacz wszystko emituje select-all', async () => {
    setWidth(1600)
    const wrapper = await mountTable(items)

    wrapper.findAllComponents(Checkbox)[0]!.vm.$emit('update:model-value', true)

    expect(wrapper.emitted('select-all')?.[0]?.[0]).toBe(true)
    wrapper.unmount()
  })

  it('zaznaczenie wiersza na desktopie i na karcie', async () => {
    setWidth(1600)
    let wrapper = await mountTable(items, { canBeSelected: true })
    wrapper.findAllComponents(Checkbox)[1]!.vm.$emit('update:model-value', true)
    expect((wrapper.emitted('update:checked-items')?.[0]?.[0] as BackupItem).id).toBe(items[0]!.id)
    wrapper.unmount()

    setWidth(1100)
    wrapper = await mountTable(items, { canBeSelected: true })
    wrapper.findAll('[data-testid="backups-mobile-item"]')[0]!.findComponent(Checkbox).vm.$emit('update:model-value', true)
    expect((wrapper.emitted('update:checked-items')?.[0]?.[0] as BackupItem).id).toBe(items[0]!.id)
    wrapper.unmount()
  })

  it('akcje karty wywołują download, restore i delete', async () => {
    setWidth(1100)
    const wrapper = await mountTable(items)
    const card = wrapper.findAll('[data-testid="backups-mobile-item"]')[0]!

    await card.find('[data-testid="backups-mobile-download"]').trigger('click')
    await card.find('[data-testid="backups-mobile-restore"]').trigger('click')
    await card.find('[data-testid="backups-mobile-delete"]').trigger('click')

    expect(wrapper.emitted('action-button-download')?.[0]?.[0]).toMatchObject({ id: items[0]!.id })
    expect(wrapper.emitted('action-button-restore')?.[0]?.[0]).toMatchObject({ id: items[0]!.id })
    expect(wrapper.emitted('action-button-delete')?.[0]?.[0]).toMatchObject({ id: items[0]!.id })
    wrapper.unmount()
  })

  it('karta ma trzy akcje także dla kopii automatycznej przy własnym systemie backupów', async () => {
    setWidth(1100)
    const auto = [decorateBackup(row({ id: 3, type: 'Automatic' }))]
    const wrapper = await mountTable(auto, { usesOwnBackupSystem: true })

    expect(wrapper.findAll('[data-testid="backups-mobile-item"]')[0]!.findAll('[data-testid^="backups-mobile-"]')).toHaveLength(3)
    wrapper.unmount()
  })

  it('pusty stan z przyciskiem Add', async () => {
    setWidth(1600)
    const wrapper = await mountTable([])

    await wrapper.find('[data-testid="backups-empty-add"]').trigger('click')

    expect(wrapper.emitted('add-new')).toHaveLength(1)
    wrapper.unmount()
  })

  it('przekazuje zmianę strony ze stopki', async () => {
    setWidth(1600)
    const wrapper = await mountTable(items)

    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:page', 2)

    expect(wrapper.emitted('update:page')).toEqual([[2]])
    wrapper.unmount()
  })

  describe('custom project', () => {
    const parts = (overrides: Record<string, unknown> = {}) => ({ files: true, volumes: ['vol-a', 'vol-b'], databases: ['db1'], ...overrides })

    async function mountCustom (backup: BackupRow) {
      const items = [decorateBackup(backup)]
      return mountTable(items, { headers: buildHeaders(items, t, true), custom: true })
    }

    it('titles the columns Code and Data', async () => {
      const wrapper = await mountCustom(row({ parts: parts() }))

      expect(wrapper.text()).toContain('table.header.data')
      expect(wrapper.text()).toContain('table.header.code')
      expect(wrapper.text()).not.toContain('table.header.database')
    })

    it('shows the Data check with a tooltip, role img and aria-label with the names', async () => {
      const wrapper = await mountCustom(row({ parts: parts() }))

      const check = wrapper.find('[data-testid="backup-data-check"]')
      expect(check.attributes('role')).toBe('img')
      expect(check.attributes('tabindex')).toBe('0')
      expect(check.attributes('aria-label')).toBe('Volumes: vol-a, vol-b Databases: db1')
    })

    it('lists only the non-empty kind of name', async () => {
      const wrapper = await mountCustom(row({ parts: parts({ databases: [] }) }))

      expect(wrapper.find('[data-testid="backup-data-check"]').attributes('aria-label')).toBe('Volumes: vol-a, vol-b')
    })

    it('hides the Data check when volumes and databases are empty, and keeps the Code check', async () => {
      const wrapper = await mountCustom(row({ parts: parts({ volumes: [], databases: [] }) }))

      expect(wrapper.find('[data-testid="backup-data-check"]').exists()).toBe(false)
      expect(wrapper.findAll('.v-data-table__td .v-icon[class*="mdi"], .v-data-table__td i.v-icon').length).toBeGreaterThan(0)
    })

    it('shows a plain Data check without names when the row has no parts (flag fallback)', async () => {
      const wrapper = await mountCustom(row({ database: true, directory: false }))

      const check = wrapper.find('[data-testid="backup-data-check"]')
      expect(check.exists()).toBe(true)
      expect(check.attributes('role')).toBeUndefined()
      expect(check.attributes('tabindex')).toBeUndefined()
    })

    it('hides the Code check when parts has no files', async () => {
      const without = await mountCustom(row({ parts: parts({ files: false, volumes: [], databases: [] }) }))
      const withFiles = await mountCustom(row({ parts: parts({ files: true, volumes: [], databases: [] }) }))

      expect(without.findAll('i.v-icon')).toHaveLength(withFiles.findAll('i.v-icon').length - 1)
    })

    it('shows the same checks in the mobile card', async () => {
      setWidth(MOBILE_WIDTH)
      const wrapper = await mountCustom(row({ parts: parts() }))

      expect(wrapper.find('[data-testid="backup-data-check"]').attributes('aria-label')).toBe('Volumes: vol-a, vol-b Databases: db1')
    })
  })

  it('keeps the WordPress columns and flags without the custom flag', async () => {
    const wrapper = await mountTable([decorateBackup(row({ directory: true, database: false, parts: { files: false, volumes: ['v'], databases: [] } }))])

    expect(wrapper.text()).toContain('table.header.database')
    expect(wrapper.text()).toContain('table.header.directory')
    expect(wrapper.find('[data-testid="backup-data-check"]').exists()).toBe(false)
  })
})
