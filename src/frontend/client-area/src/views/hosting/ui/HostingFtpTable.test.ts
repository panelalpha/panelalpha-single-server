import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import { openTooltip } from '@/test/tooltip'
import HostingFtpTable from './HostingFtpTable.vue'

// Headers and row fields as the FTP page passes them, written out here so the shared
// component does not import the feature.
const headers = [
  { text: 'user', value: 'user', sortable: true },
  { text: 'directory', value: 'directory', sortable: true },
  { text: 'usageQuota', value: 'usage_quota', sortable: true },
  { text: 'updated', value: 'updated_at', sortable: true },
  { text: 'actions', value: 'actions' },
]

function row (overrides: Record<string, unknown> = {}) {
  return {
    user: 'shop@example.com',
    directory: '/home/example/shop',
    diskused: 120,
    diskquota: 1024,
    updated_at: '2026-09-20T10:00:00.000Z',
    usage_quota: 'form.value.sizeMB(120) / form.value.sizeMB(1024)',
    updated_at_text: '2 days ago',
    infoButtonLoading: false,
    ...overrides,
  }
}

const items = [
  row({ user: 'shop@example.com', updated_at_text: '2 days ago' }),
  row({ user: 'mail@example.com', diskquota: 'unlimited', usage_quota: 'form.value.sizeMB(42) / form.value.unlimited', diskused: 42 }),
]

const base = { headers, items, itemsLoading: false, itemsPerPage: 8, page: 1, possibleItemsPerPage: [[8, 16, 24]], searchTerm: '', sortBy: false, sortDesc: true, usageSupported: true, type: 'ftp' }

const slots = {
  'no-data': '<p class="host-empty">empty</p>',
}

describe('HostingFtpTable', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  it('renders the legacy card and the custom sort header with the five column keys', async () => {
    // TableCustomSort in the header slot.
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: base, slots })

    expectLegacyClasses(wrapper.element, ['v-card', 'data-table'])
    expect(wrapper.classes()).not.toContain('data-table--loading')
    expect(wrapper.findAll('tr.custom-sort td')).toHaveLength(5)
    const text = wrapper.get('tr.custom-sort').text()
    for (const key of ['table.header.user', 'table.header.directory', 'table.header.usageQuota', 'table.header.updated', 'table.header.actions']) {
      expect(text).toContain(key)
    }
    wrapper.unmount()
  })

  it('shows the row values: the bold user, the usage text and one chart per row', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: base, slots })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.get('b').text()).toBe('shop@example.com')
    expect(rows[0]!.get('.usage-quota').text()).toBe('form.value.sizeMB / form.value.sizeMB')
    expect(rows[0]!.find('.v-progress-linear').exists()).toBe(true)
    expect(rows[1]!.get('.usage-quota').text()).toContain('unlimited')
    wrapper.unmount()
  })

  it('shows the not-supported icon instead of the usage bar when usage is not supported', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, usageSupported: false }, slots })

    expect(wrapper.find('.usage-quota').exists()).toBe(false)
    expect(wrapper.find('.ps-7').exists()).toBe(true)
    wrapper.unmount()
  })

  it('offers the edit action only for rows that list edit_password, on the FTP page too', async () => {
    window.innerWidth = 1600
    const withEdit = [row({ actions: ['edit_password'] })]

    const ftp = await mountKit(HostingFtpTable, { props: { ...base, items: withEdit, type: 'ftp' }, slots })
    expect(ftp.get('.actions-row').findAll('.v-btn')).toHaveLength(3)
    expect(ftp.get('.actions-row').findAll('.v-btn')[1]!.attributes('aria-label')).toBe('button.ftp.edit')
    ftp.unmount()

    const ftpWithout = await mountKit(HostingFtpTable, { props: { ...base, items: [row({ actions: [] })], type: 'ftp' }, slots })
    expect(ftpWithout.get('.actions-row').findAll('.v-btn')).toHaveLength(2)
    ftpWithout.unmount()

    const sftpWithout = await mountKit(HostingFtpTable, { props: { ...base, items: [row({ actions: [] })], type: 'sftp' }, slots })
    expect(sftpWithout.get('.actions-row').findAll('.v-btn')).toHaveLength(2)
    sftpWithout.unmount()

    const sftp = await mountKit(HostingFtpTable, { props: { ...base, items: withEdit, type: 'sftp' }, slots })
    expect(sftp.get('.actions-row').findAll('.v-btn')).toHaveLength(3)
    sftp.unmount()
  })

  it('emits the row when the info button is clicked', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: base, slots })

    await wrapper.get('.actions-row .v-btn').trigger('click')

    const emitted = wrapper.emitted('action-button-info')
    expect(emitted).toHaveLength(1)
    expect(emitted![0]![0]).toMatchObject({ user: 'shop@example.com' })
    wrapper.unmount()
  })

  it('shows the skeletons and the loading class while the list loads', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, itemsLoading: true }, slots })

    expect(wrapper.classes()).toContain('data-table--loading')
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the no-data slot when the list is empty', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, items: [] }, slots })

    expect(wrapper.find('.host-empty').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the no-results container for a search that matches nothing, and asks to clear the filters', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, searchTerm: 'zzz-no-match' }, slots })

    expect(wrapper.find('.host-empty').exists()).toBe(false)
    expect(wrapper.text()).toContain('message.emptyTable.instances.filter.title')
    await wrapper.get('.no-results-container button').trigger('click')
    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('filters the rows by the values of the columns, usage text included', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, searchTerm: 'unlimited' }, slots })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.get('b').text()).toBe('mail@example.com')
    wrapper.unmount()
  })

  it('shows four labelled mobile rows with the chart even where usage is not supported', async () => {
    // User, directory, usage quota and actions, each row with its label.
    window.innerWidth = 500
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, usageSupported: false }, slots })

    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const labels = rows[0]!.findAll('.mobile-table-item__header')
    expect(labels.map(label => label.text())).toEqual(['table.header.user', 'table.header.directory', 'table.header.usageQuota', 'table.header.actions'])
    expect(rows[0]!.get('.mobile-table-item__value .bold').text()).toBe('shop@example.com')
    expect(rows[0]!.find('.v-progress-linear').exists()).toBe(true)
    expect(rows[0]!.findAll('.mobile-table-item__value .v-btn')).toHaveLength(2)
    wrapper.unmount()
  })

  it('sorts the mobile labels by their header, and the Actions label by the directory header (legacy quirk)', async () => {
    // `Actions` sorts by `headers[1]`, not by its own column.
    window.innerWidth = 500
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, usageSupported: false }, slots })

    const labels = wrapper.get('tbody tr').findAll('.mobile-table-item__header')
    await labels[0]!.trigger('click')
    await labels[3]!.trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[headers[0]], [headers[1]]])
    wrapper.unmount()
  })

  it('shows the dash instead of the chart in the mobile usage row when the row has no usage_quota (SFTP)', async () => {
    // `"---"` for `!item.usage_quota`, the chart otherwise.
    window.innerWidth = 500
    const sftpRow = row({ usage_quota: undefined, directory: undefined, diskused: undefined, diskquota: undefined, actions: ['edit_password'] })
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, items: [sftpRow, row()], type: 'sftp', usageSupported: false }, slots })

    const rows = wrapper.findAll('tbody tr')
    const usage = rows[0]!.findAll('.mobile-table-item__value')[2]!
    expect(usage.text()).toBe('"---"')
    expect(usage.find('.v-progress-linear').exists()).toBe(false)
    expect(rows[1]!.findAll('.mobile-table-item__value')[2]!.find('.v-progress-linear').exists()).toBe(true)
    wrapper.unmount()
  })
  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile cards of an FTP row (chart) and of an SFTP row (dash, Edit) with the legacy markup', async () => {
    window.innerWidth = 500
    const ftp = await mountKit(HostingFtpTable, { props: base, slots })
    expect(normalizeHtml(ftp.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.user</div><div class="mobile-table-item__value"><span class="bold p-3">shop@example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.directory</div><div class="mobile-table-item__value"><span class="bold p-3">/home/example/shop</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.usageQuota</div><div class="mobile-table-item__value"><div class="d-flex align-center"><div class="v-progress-linear v-theme--light v-locale--is-ltr usage-progress" style="top: 0px; height: 4px; --v-progress-linear-height: 4px; --v-progress-reveal-duration: 900ms; --v-progress-chunk-gap: 4px;" role="progressbar" aria-hidden="false" aria-valuemin="0" aria-valuemax="100" aria-valuenow="12"><div class="v-progress-linear__background" style="background-color: var(--v-chart-progress-track);"></div><div class="v-progress-linear__buffer" style="background-color: var(--v-chart-progress-track); width: 100%;"></div><transition-stub name="slide-x-transition" appear="false" persisted="false" css="true"><div class="v-progress-linear__determinate" style="background-color: var(--v-chart-pie-1); width: 12%;"></div></transition-stub></div><span class="ml-2">form.value.sizeMB(120) / form.value.sizeMB(1024)</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.ftp.show"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.ftp.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    ftp.unmount()

    const sftpRow = row({ usage_quota: undefined, directory: undefined, diskused: undefined, diskquota: undefined, actions: ['edit_password'] })
    const sftp = await mountKit(HostingFtpTable, { props: { ...base, items: [sftpRow], type: 'sftp', usageSupported: false }, slots })
    expect(normalizeHtml(sftp.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.user</div><div class="mobile-table-item__value"><span class="bold p-3">shop@example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.directory</div><div class="mobile-table-item__value"><span class="bold p-3"></span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.usageQuota</div><div class="mobile-table-item__value"><span class="p-3">"---"</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.sftp.show"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.sftp.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.sftp.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    sftp.unmount()
  })

  it('names the row icon buttons with the tooltip keys of the account the page lists (Info, Edit, Delete), desktop and mobile', async () => {
    // Legacy has no aria-label on these icon buttons; the names reuse the tooltip keys.
    const ftpNames = ['button.ftp.show', 'button.ftp.delete']
    const sftpNames = ['button.sftp.show', 'button.sftp.edit', 'button.sftp.delete']
    const sftpRow = row({ actions: ['edit_password'] })
    const labels = (wrapper: Awaited<ReturnType<typeof mountKit>>, selector: string) => wrapper.get(selector).findAll('.v-btn').map(button => button.attributes('aria-label'))

    window.innerWidth = 1600
    const ftp = await mountKit(HostingFtpTable, { props: base, slots })
    expect(labels(ftp, '.actions-row')).toEqual(ftpNames)
    ftp.unmount()

    const desktop = await mountKit(HostingFtpTable, { props: { ...base, items: [sftpRow], type: 'sftp' }, slots })
    expect(labels(desktop, '.actions-row')).toEqual(sftpNames)
    desktop.unmount()

    window.innerWidth = 500
    const ftpMobile = await mountKit(HostingFtpTable, { props: base, slots })
    expect(labels(ftpMobile, 'tbody tr')).toEqual(ftpNames)
    ftpMobile.unmount()

    const mobile = await mountKit(HostingFtpTable, { props: { ...base, items: [sftpRow], type: 'sftp', usageSupported: false }, slots })
    expect(labels(mobile, 'tbody tr')).toEqual(sftpNames)
    mobile.unmount()
  })

  // Characterization of the row buttons: the DOM of the actions and of the usage activator stays as written by hand.
  it('renders the desktop action buttons of an SFTP row and the usage activator of an FTP row unchanged', async () => {
    window.innerWidth = 1600
    const sftp = await mountKit(HostingFtpTable, { props: { ...base, items: [row({ actions: ['edit_password'] })], type: 'sftp' }, slots })
    expect(normalizeHtml(sftp.get('.actions-row').html())).toMatchInlineSnapshot(`"<div class="d-flex actions-row"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.sftp.show"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.sftp.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.sftp.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div>"`)
    sftp.unmount()

    const ftp = await mountKit(HostingFtpTable, { props: { ...base, usageSupported: false }, slots })
    expect(normalizeHtml(ftp.get('.ps-7').html()).replace(/ aria-owns="[^"]*"/, '')).toMatchInlineSnapshot(`"<div class="ps-7"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-x-small v-btn--variant-text ml-1 d-flex align-center" aria-label="heading.hosting.usage.title" aria-haspopup="menu" aria-expanded="false"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light text-black" style="font-size: 20px; height: 20px; width: 20px;" aria-hidden="true"><svg></svg></i></span></button></div>"`)
    ftp.unmount()
  })

  it('renders a loading Info button of an FTP row unchanged', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, items: [row({ infoButtonLoading: true })] }, slots })
    expect(normalizeHtml(wrapper.get('.actions-row .v-btn').html())).toMatchInlineSnapshot(`"<button type="button" class="v-btn v-btn--icon v-btn--loading v-theme--light v-btn--density-default v-btn--loading v-btn--size-small v-btn--variant-text" aria-busy="true" tabindex="-1" aria-label="button.ftp.show"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span><span class="v-btn__loader"><div class="v-progress-circular v-progress-circular--indeterminate v-theme--light v-progress-circular--size-default" style="--v-progress-reveal-duration: 900ms;" role="progressbar" aria-valuemin="0" aria-valuemax="100"><svg></svg></div></span></button>"`)
    wrapper.unmount()
  })

  it('opens the tooltip of every row button on hover, with the key as text and aria-describedby on the button', async () => {
    const keys = ['button.sftp.show', 'button.sftp.edit', 'button.sftp.delete']
    const sftpRow = row({ actions: ['edit_password'] })

    window.innerWidth = 1600
    const desktop = await mountKit(HostingFtpTable, { props: { ...base, items: [sftpRow], type: 'sftp' }, slots })
    for (const [index, button] of desktop.get('.actions-row').findAll('.v-btn').entries()) {
      const content = await openTooltip(button)
      expect(normalizeHtml(content.innerHTML)).toBe(`<span>${keys[index]}</span>`)
    }
    desktop.unmount()

    window.innerWidth = 500
    const mobile = await mountKit(HostingFtpTable, { props: { ...base, items: [sftpRow], type: 'sftp', usageSupported: false }, slots })
    for (const [index, button] of mobile.get('tbody tr').findAll('.v-btn').entries()) {
      const content = await openTooltip(button)
      expect(normalizeHtml(content.innerHTML)).toBe(`<span>${keys[index]}</span>`)
    }
    mobile.unmount()
  })

  it('opens the usage menu on hover of the not-supported icon', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, usageSupported: false }, slots })

    const activator = wrapper.get('.ps-7 .v-btn')
    await activator.trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()
    const menu = document.body.querySelector('.hosting-ftp-usage-menu')!
    expect(menu.textContent).toContain('tooltip.hosting.ftp.usageNotSupported')
    wrapper.unmount()
  })
})

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  const many = Array.from({ length: 9 }, (_, index) => row({ user: `user${index + 1}@example.com` }))

  it('emits the clicked header, and the flipped direction for the sorted one', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, sortBy: headers[0] }, slots })

    await wrapper.get('tr.custom-sort .item--directory .custom-sort__item').trigger('click')
    await wrapper.get('tr.custom-sort .item--user .custom-sort__item').trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[headers[1]]])
    expect(wrapper.emitted('update:sort-desc')).toEqual([[false]])
    wrapper.unmount()
  })

  it('pages by itemsPerPage and re-emits the page and the per-page choice from the footer', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, items: many }, slots })

    expect(wrapper.findAll('tbody tr')).toHaveLength(8)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
    await wrapper.findAll('.data-iterator-page-number button')[1]!.trigger('click')
    expect(wrapper.emitted('update:items-per-page')?.[0]).toEqual([16])
    wrapper.unmount()
  })

  it('has no footer for a search that matches nothing (default size, kit-data-table-footer) and shows no rows', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, searchTerm: 'zzz-no-match' }, slots })

    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    expect(wrapper.find('b').exists()).toBe(false)
    wrapper.unmount()
  })

  it('has no footer and no header for an empty list', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, items: [] }, slots })

    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits the row of the clicked Delete button, on desktop and in the mobile card', async () => {
    window.innerWidth = 1600
    const desktop = await mountKit(HostingFtpTable, { props: base, slots })
    await desktop.findAll('tbody tr')[1]!.findAll('.v-btn')[1]!.trigger('click')
    expect(desktop.emitted('action-button-delete')![0]![0]).toMatchObject({ user: 'mail@example.com' })
    desktop.unmount()

    window.innerWidth = 500
    const mobile = await mountKit(HostingFtpTable, { props: base, slots })
    await mobile.findAll('tbody tr')[1]!.findAll('.mobile-table-item__value .v-btn')[1]!.trigger('click')
    expect(mobile.emitted('action-button-delete')![0]![0]).toMatchObject({ user: 'mail@example.com' })
    mobile.unmount()
  })

  it('shows five mobile skeleton items while loading below the lg breakpoint', async () => {
    window.innerWidth = 500
    const wrapper = await mountKit(HostingFtpTable, { props: { ...base, itemsLoading: true }, slots })

    expect(wrapper.findAll('.mobile-item')).toHaveLength(5)
    expect(wrapper.find('tbody b').exists()).toBe(false)
    wrapper.unmount()
  })
})
