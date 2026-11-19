import type { HomeResponse } from '@/shared/session/session.api'
import type { BackupRow } from '@/entities/project/instance-backups.api'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import { type BackupItem, buildHeaders, decorateBackup } from './backups-list'
import BackupsTableResponsiveItem from './BackupsTableResponsiveItem.vue'

const t = (key: string) => key

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

async function mountItem (item: BackupItem) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mountKit(BackupsTableResponsiveItem, {
    props: { headers: buildHeaders([item], t), item },
    global: { plugins: [pinia] },
  })
}

describe('BackupsTableResponsiveItem', () => {
  it('shows download, restore and delete, and no other action', async () => {
    const wrapper = await mountItem(decorateBackup(row()))

    expect(wrapper.findAll('.mobile-table-item__actions button')).toHaveLength(3)
    expect(wrapper.find('.actions-row').exists()).toBe(false)
  })

  // Characterization of the row actions: the markup stays as written by hand (no tooltips on the card).
  it('renders the download, restore and delete icons of the card unchanged', async () => {
    const wrapper = await mountItem(decorateBackup(row()))

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.backup.download" data-testid="backups-mobile-download"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.restoreBackup" data-testid="backups-mobile-restore"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.deleteBackup" data-testid="backups-mobile-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
      ]
    `)
  })

  it('emits the row with the download, restore and delete actions', async () => {
    const wrapper = await mountItem(decorateBackup(row({ id: 9 })))

    const [download, restore, remove] = wrapper.findAll('.mobile-table-item__actions button')
    await download!.trigger('click')
    await restore!.trigger('click')
    await remove!.trigger('click')

    expect(wrapper.emitted('action-button-download')?.[0]?.[0]).toMatchObject({ id: 9 })
    expect(wrapper.emitted('action-button-restore')?.[0]?.[0]).toMatchObject({ id: 9 })
    expect(wrapper.emitted('action-button-delete')?.[0]?.[0]).toMatchObject({ id: 9 })
  })

  it('colours an Automatic backup primary, unlike the desktop success', async () => {
    const wrapper = await mountItem(decorateBackup(row({ type: 'automatic' })))

    expect(wrapper.findComponent(StatusLabel).props('status')).toBe('primary')
  })

  it('colours a Manual backup purple', async () => {
    const wrapper = await mountItem(decorateBackup(row({ type: 'manual' })))

    expect(wrapper.findComponent(StatusLabel).props('status')).toBe('purple')
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the card with the legacy markup', async () => {
    const manual = await mountItem(decorateBackup(row({ date: new Date(2026, 9, 5, 9, 7).getTime() / 1000, version: '6.8', database: true })))
    expect(normalizeHtml(manual.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item" data-testid="backups-mobile-item"><div class="mobile-table-item__select"><div class="checkbox"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-checkbox"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default v-checkbox-btn"><div class="v-selection-control__wrapper"><div class="v-selection-control__input"><i class="mdi-checkbox-blank-outline mdi v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"></i><input id="checkbox-v-0" aria-disabled="false" type="checkbox" value="true"></div></div><label class="v-label v-label--clickable" for="checkbox-v-0"><span></span></label></div></div></div></div></div><div class="mobile-table-item__values"><div class="mobile-table-item__group"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.date</div><div class="mobile-table-item__value"><div class="p-3"><span class="font-weight-bold">2026-10-05</span> 09:07</div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.database</div><div class="mobile-table-item__value"><i class="v-icon notranslate v-theme--light text-primary ms-4" style="font-size: 20px; height: 20px; width: 20px;" aria-hidden="true"><svg></svg></i></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.directory</div><div class="mobile-table-item__value"><i class="v-icon notranslate v-theme--light text-primary ms-4" style="font-size: 20px; height: 20px; width: 20px;" aria-hidden="true"><svg></svg></i></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.size</div><div class="mobile-table-item__value"><span class="p-3">1 KB</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.type</div><div class="mobile-table-item__value"><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--purple" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">Manual</span></div></span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.version</div><div class="mobile-table-item__value"><span class="p-3">6.8</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.note</div><div class="mobile-table-item__value"><span class="p-3">before update</span></div></div></div><div class="mobile-table-item__group"><div class="mobile-table-item__actions"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.backup.download" data-testid="backups-mobile-download"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.restoreBackup" data-testid="backups-mobile-restore"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.deleteBackup" data-testid="backups-mobile-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    const automatic = await mountItem(decorateBackup(row({ date: new Date(2026, 9, 5, 9, 7).getTime() / 1000, type: 'automatic', note: null })))
    expect(normalizeHtml(automatic.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item" data-testid="backups-mobile-item"><div class="mobile-table-item__select"><div class="checkbox"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-checkbox"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default v-checkbox-btn"><div class="v-selection-control__wrapper"><div class="v-selection-control__input"><i class="mdi-checkbox-blank-outline mdi v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"></i><input id="checkbox-v-0" aria-disabled="false" type="checkbox" value="true"></div></div><label class="v-label v-label--clickable" for="checkbox-v-0"><span></span></label></div></div></div></div></div><div class="mobile-table-item__values"><div class="mobile-table-item__group"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.date</div><div class="mobile-table-item__value"><div class="p-3"><span class="font-weight-bold">2026-10-05</span> 09:07</div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.database</div><div class="mobile-table-item__value"></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.directory</div><div class="mobile-table-item__value"><i class="v-icon notranslate v-theme--light text-primary ms-4" style="font-size: 20px; height: 20px; width: 20px;" aria-hidden="true"><svg></svg></i></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.size</div><div class="mobile-table-item__value"><span class="p-3">1 KB</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.type</div><div class="mobile-table-item__value"><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--primary" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">Automatic</span></div></span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.note</div><div class="mobile-table-item__value"><span class="p-3">---</span></div></div></div><div class="mobile-table-item__group"><div class="mobile-table-item__actions"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.backup.download" data-testid="backups-mobile-download"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.restoreBackup" data-testid="backups-mobile-restore"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.deleteBackup" data-testid="backups-mobile-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
  })

  it('emits update:sort-by only for a sortable header', async () => {
    const wrapper = await mountItem(decorateBackup(row()))

    const headers = wrapper.findAll('.mobile-table-item__header')
    await headers.find(header => header.text() === 'table.header.database')!.trigger('click')
    expect(wrapper.emitted('update:sort-by')).toBeUndefined()

    await headers.find(header => header.text() === 'table.header.size')!.trigger('click')
    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'size' })
  })

  it('writes the date in the session format in bold, then the time', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().home = { app: { default_date_format: 'DD.MM.YYYY' } } as HomeResponse
    const item = decorateBackup(row({ date: new Date(2026, 9, 5, 9, 7).getTime() / 1000 }))

    const wrapper = await mountKit(BackupsTableResponsiveItem, {
      props: { headers: buildHeaders([item], t), item },
      global: { plugins: [pinia] },
    })

    expect(wrapper.find('.font-weight-bold').text()).toBe('05.10.2026')
    expect(wrapper.text()).toContain('05.10.2026 09:07')
  })

  it('shows the dash for an empty note', async () => {
    const wrapper = await mountItem(decorateBackup(row({ note: null })))

    expect(wrapper.text()).toContain('---')
  })
})
