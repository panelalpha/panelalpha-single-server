import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VDialog } from 'vuetify/components'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/shared/ui/modal/dialog-shell.fixtures'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import ConfigsTable from './ConfigsTable.vue'
import * as wordpressConfigApi from './wordpress-config.api'
import WordpressConfigView from './WordpressConfigView.vue'

vi.mock('./wordpress-config.api', () => ({
  listConfigs: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
  deleteConfig: vi.fn(),
}))

const INSTANCE_ID = 9

function makeInstance (): InstanceResource {
  return { id: INSTANCE_ID } as unknown as InstanceResource
}

async function mountConfigs () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(WordpressConfigView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

type Mounted = Awaited<ReturnType<typeof mountConfigs>>['wrapper']

/** The desktop data rows as their cell texts (name, value, type); the no-data row has one cell and the actions cell has no text. */
function rowCells (wrapper: Mounted): string[][] {
  return wrapper.findAll('tbody tr')
    .filter(row => row.findAll('td').length === 4)
    .map(row => row.findAll('td').slice(0, 3).map(cell => cell.text()))
}

/** The desktop rows as their name cell text (the first column). */
function rowNames (wrapper: Mounted): string[] {
  return rowCells(wrapper).map(cells => cells[0]!)
}

function search (wrapper: Mounted, term: string): Promise<void> {
  wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', term)
  return flushPromises()
}

/** Clicks the title-bar Create button and returns the open modal. */
async function openCreateModal (wrapper: Mounted) {
  await wrapper.get('[data-testid="wordpress-config-add"]').trigger('click')
  await flushPromises()
  return wrapper.findComponent(BasicModal)
}

function setField (wrapper: Mounted, name: string, value: unknown): void {
  const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!
  field.vm.$emit('update:modelValue', value)
}

/** The first action button of the open modal: Create or Update. */
function clickFirstButton (modal: { findAll: (selector: string) => Array<{ trigger: (event: string) => unknown }> }): void {
  modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
}

function fieldValue (wrapper: Mounted, name: string): unknown {
  return wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!.props('modelValue')
}

/** Clicks the Edit button of the desktop row whose name cell reads `name`. */
async function openEditModal (wrapper: Mounted, name: string) {
  const row = wrapper.findAll('tbody tr').find(item => item.findAll('td')[0]?.text() === name)!
  await row.get('[data-testid="wordpress-config-edit"]').trigger('click')
  await flushPromises()
  return wrapper.findComponent(BasicModal)
}

/** Clicks the Delete button of the desktop row whose name cell reads `name`, and returns the open modal. */
async function openDeleteModal (wrapper: Mounted, name: string) {
  const row = wrapper.findAll('tbody tr').find(item => item.findAll('td')[0]?.text() === name)!
  await row.get('[data-testid="wordpress-config-delete"]').trigger('click')
  await flushPromises()
  return wrapper.findComponent(BasicModal)
}

function fillValidCreateForm (wrapper: Mounted): void {
  setField(wrapper, 'name', 'gamma')
  setField(wrapper, 'value', 'two')
  setField(wrapper, 'type', 'constant')
}

const SAMPLE = [
  { name: 'alpha', value: 'one', type: 'constant' },
  { name: '', value: '', type: 'variable' },
  { name: 'beta', value: 'hunter2', type: 'secret' },
]

describe('WordpressConfigView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
    vi.resetAllMocks()
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue([])
  })

  afterEach(() => {
    window.innerWidth = width
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  // (a) The title bar: title, filter controls and the Create button with its i18n keys; the list is requested on mount.
  it('renders the title, the search controls and the Create button, and loads the configs on mount', async () => {
    const { wrapper } = await mountConfigs()

    expect(wrapper.find('.page-title__title').text()).toBe('heading.instance.advanced.wordpressConfig.title')
    expect(wrapper.findComponent(DataIteratorFilterControls).exists()).toBe(true)
    expect(wrapper.findComponent(DataIteratorFilterControls).props('showSearchTerm')).toBe(true)
    expect(wrapper.get('[data-testid="wordpress-config-add"]').text()).toContain('button.config.create')
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledWith(INSTANCE_ID)
    wrapper.unmount()
  })

  // (b) A failed list request shows no alert, ends the loading state and says why the list is empty.
  it('shows why the list is empty when the list request fails, and a Retry reloads it', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockRejectedValue({
      response: { status: 422, data: { message: 'Error: No matching entries found in \'wp-config.php\'.' } },
    })
    const { wrapper, alerts } = await mountConfigs()

    expect(alerts.activeAlerts).toEqual([])
    expect((wrapper.vm as unknown as { itemsLoading: boolean }).itemsLoading).toBe(false)
    const error = wrapper.get('[data-testid="wordpress-config-load-error"]')
    expect(error.text()).toContain('Error: No matching entries found in \'wp-config.php\'.')
    expect(wrapper.text()).not.toContain('$vuetify.noDataText')

    // Load the table again from the message once wp-config.php reads: the rows replace it.
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    await error.get('[data-testid="error-card-retry"]').trigger('click')
    await flushPromises()

    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="wordpress-config-load-error"]').exists()).toBe(false)
    expect(rowNames(wrapper)).toEqual(['beta', 'alpha', '---'])
    wrapper.unmount()
  })

  // A list the Engine cannot read keeps a way out: Remove by name sends the DELETE the broken rows cannot.
  it('offers Remove by name only while the list read fails, and removes the named config through it', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockRejectedValue({ response: { status: 422, data: { message: 'The wp-config read failed' } } })
    vi.mocked(wordpressConfigApi.deleteConfig).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountConfigs()

    expect(wrapper.find('[data-testid="wordpress-config-remove-by-name"]').text()).toContain('button.config.removeByName')
    // Nothing to search in an empty broken list, and the third control would not fit the title row.
    expect(wrapper.findComponent(DataIteratorFilterControls).props('showSearchTerm')).toBe(false)

    await wrapper.get('[data-testid="wordpress-config-remove-by-name"]').trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)
    expect(modal.props('title')).toBe('heading.instance.advanced.wordpressConfig.modal.remove.title')
    expect(modal.props('confirmRequired')).toBe(true)
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeDefined()

    setField(wrapper, 'name', 'FX_BIG')
    setField(wrapper, 'type', 'constant')
    setField(wrapper, 'confirm', true)
    await flushPromises()
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeUndefined()

    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue([])
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.deleteConfig).toHaveBeenCalledWith(INSTANCE_ID, 'FX_BIG', 'constant')
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.wordpressConfig.delete.success' }])
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    expect(wrapper.find('[data-testid="wordpress-config-remove-by-name"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the by-name dialog open with the message under the name when the removal is refused', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockRejectedValue({ response: { status: 422, data: { message: 'Broken' } } })
    vi.mocked(wordpressConfigApi.deleteConfig).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Refused', errors: { name: ['The name field is invalid.'] } } },
    })
    const { wrapper } = await mountConfigs()

    await wrapper.get('[data-testid="wordpress-config-remove-by-name"]').trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)
    setField(wrapper, 'name', 'FX_BIG')
    setField(wrapper, 'type', 'constant')
    setField(wrapper, 'confirm', true)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    const name = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === 'name')!
    expect(name.props('field').errorMessages).toEqual(['The name field is invalid.'])
    wrapper.unmount()
  })

  // A value over the Engine's read limit never reaches the server, so the page cannot break itself.
  it('does not create a config from a value longer than 4094 bytes', async () => {
    // 4095 plain characters and 2048 `ą` (4096 bytes) are both over the limit; 2047 `ą` is exactly 4094 bytes.
    for (const value of ['v'.repeat(4095), 'ą'.repeat(2048)]) {
      const { wrapper } = await mountConfigs()
      const modal = await openCreateModal(wrapper)

      setField(wrapper, 'name', 'FX_BIG')
      setField(wrapper, 'value', value)
      setField(wrapper, 'type', 'constant')
      await flushPromises()
      clickFirstButton(modal)
      await flushPromises()

      expect(wordpressConfigApi.createConfig).not.toHaveBeenCalled()
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
      wrapper.unmount()
    }
  })

  // 2047 `ą` is 4094 bytes: the same length the ASCII row is accepted at.
  it('creates a config from 2047 two-byte characters', async () => {
    const value = 'ą'.repeat(2047)
    const { wrapper } = await mountConfigs()
    const modal = await openCreateModal(wrapper)

    setField(wrapper, 'name', 'FX_BIG')
    setField(wrapper, 'value', value)
    setField(wrapper, 'type', 'constant')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.createConfig).toHaveBeenCalledWith(INSTANCE_ID, { name: 'FX_BIG', value, type: 'constant' })
    wrapper.unmount()
  })

  // (c) The rows sorted by name descending as text; `---` for an empty name and value; a secret value is masked.
  it('lists the configs sorted by name descending, with --- for an empty name or value and a masked secret', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    const { wrapper } = await mountConfigs()

    expect(rowCells(wrapper)).toEqual([
      ['beta', '•'.repeat(8), 'secret'],
      ['alpha', 'one', 'constant'],
      ['---', '---', 'variable'],
    ])
    wrapper.unmount()
  })

  // (d) Search matches name and value case-insensitively, not type; a null value does not break it; no-results and clear; an empty list.
  it('searches name and value case-insensitively and not type', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    const { wrapper } = await mountConfigs()

    await search(wrapper, 'ALP')
    expect(rowNames(wrapper)).toEqual(['alpha'])

    await search(wrapper, 'HUNTER')
    expect(rowNames(wrapper)).toEqual(['beta'])

    await search(wrapper, 'variable')
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not break the search on a row with a null value', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue([...SAMPLE, { name: 'gamma', value: null, type: 'constant' }])
    const { wrapper } = await mountConfigs()

    await search(wrapper, 'gam')
    expect(rowNames(wrapper)).toEqual(['gamma'])

    await search(wrapper, 'one')
    expect(rowNames(wrapper)).toEqual(['alpha'])
    wrapper.unmount()
  })

  it('shows no-results for a search without matches, and Clear filter restores the list', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    const { wrapper } = await mountConfigs()

    await search(wrapper, 'nobody-has-this')
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    expect(rowNames(wrapper)).toEqual([])

    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')
    await flushPromises()

    expect(wrapper.findComponent(DataIteratorFilterControls).props('searchTerm')).toBe('')
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(false)
    expect(rowNames(wrapper)).toEqual(['beta', 'alpha', '---'])
    wrapper.unmount()
  })

  it('shows neither no-results nor a message for an empty list without a search', async () => {
    const { wrapper } = await mountConfigs()

    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(false)
    expect(wrapper.findComponent(ConfigsTable).exists()).toBe(true)
    expect(rowNames(wrapper)).toEqual([])
    wrapper.unmount()
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the card of a config with the legacy markup', async () => {
    window.innerWidth = 1200
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    const { wrapper } = await mountConfigs()

    const cards = wrapper.findAll('tbody tr')
    expect(normalizeHtml(cards[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.name</div><div class="mobile-table-item__value"><span class="bold p-3">beta</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.value</div><div class="mobile-table-item__value"><span class="bold p-3">••••••••</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.type</div><div class="mobile-table-item__value"><span class="bold p-3">secret</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  // (e) Below 1400 px the rows are cards: a click on the Value label sorts by value; an empty name has no fallback.
  it('shows cards below 1400 px, sorts by value from the Value label, and shows the name without a fallback', async () => {
    window.innerWidth = 1200
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    const { wrapper } = await mountConfigs()

    const cards = wrapper.findAll('tbody tr')
    expect(cards).toHaveLength(3)
    // Name descending: beta, alpha, then the row with the empty name, which shows no `---` fallback on the card.
    expect(cards[2]!.find('.mobile-table-item__row span').text()).toBe('')
    expect(cards[2]!.findAll('.mobile-table-item__value span')[1]!.text()).toBe('---')

    const valueLabel = cards[0]!.findAll('.mobile-table-item__header').find(label => label.text() === 'table.header.value')!
    await valueLabel.trigger('click')

    const emitted = wrapper.findComponent(ConfigsTable).emitted('update:sort-by')
    expect(emitted).toHaveLength(1)
    expect(emitted![0]![0]).toMatchObject({ value: 'value' })
    wrapper.unmount()
  })

  // (b2) A failed reload after a successful Create: the alert of the Create stays alone, no skeleton, the previous rows stay.
  it('keeps the rows and shows no skeleton or extra alert when the reload after a Create fails', async () => {
    vi.mocked(wordpressConfigApi.listConfigs)
      .mockResolvedValueOnce([SAMPLE[0]!])
      .mockRejectedValueOnce({ response: { data: { message: 'Configs unavailable' } } })
    vi.mocked(wordpressConfigApi.createConfig).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountConfigs()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.wordpressConfig.create.success' }])
    expect(wrapper.findComponent(ConfigsTable).props('itemsLoading')).toBe(false)
    expect(rowNames(wrapper)).toEqual(['alpha'])
    wrapper.unmount()
  })

  // (f) An invalid form does not reach the API; a valid one creates the config, alerts, reloads and closes.
  it('creates the config only from a valid form, then reloads the list and closes', async () => {
    vi.mocked(wordpressConfigApi.createConfig).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountConfigs()
    const modal = await openCreateModal(wrapper)

    expect(modal.props('title')).toBe('heading.instance.advanced.wordpressConfig.modal.create.title')
    setField(wrapper, 'name', 'gamma')
    setField(wrapper, 'type', 'constant')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()
    expect(wordpressConfigApi.createConfig).not.toHaveBeenCalled()

    setField(wrapper, 'value', 'two')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.createConfig).toHaveBeenCalledWith(INSTANCE_ID, { name: 'gamma', value: 'two', type: 'constant' })
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.wordpressConfig.create.success' }])
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (f2) A name the Engine's wp/config route cannot carry does not reach the API (it answered a routing 502 before).
  it('does not create a config from a name that is not a PHP constant or variable name', async () => {
    const { wrapper } = await mountConfigs()
    const modal = await openCreateModal(wrapper)

    setField(wrapper, 'name', 'BAD NAME!')
    setField(wrapper, 'value', 'two')
    setField(wrapper, 'type', 'constant')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.createConfig).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // A name over the server's 255 characters is refused by the form, not by a 422 after the modal closed.
  it('does not create a config from a name longer than 255 characters', async () => {
    const { wrapper } = await mountConfigs()
    const modal = await openCreateModal(wrapper)

    setField(wrapper, 'name', 'A'.repeat(256))
    setField(wrapper, 'value', 'two')
    setField(wrapper, 'type', 'constant')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.createConfig).not.toHaveBeenCalled()
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  // (g) A refused create keeps the modal open with the server's message in it, so the typed values are not lost.
  it('keeps the modal open with the error in it when the create request is refused', async () => {
    vi.mocked(wordpressConfigApi.createConfig).mockRejectedValue({ response: { data: { message: 'The name field must not be greater than 255 characters.' } } })
    const { wrapper, alerts } = await mountConfigs()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(document.querySelector('[data-testid="wordpress-config-modal-error"]')?.textContent)
      .toBe('The name field must not be greater than 255 characters.')
    expect(fieldValue(wrapper, 'name')).toBe('gamma')
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(alerts.activeAlerts).toEqual([])
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // A 422 names the field it refused: that message belongs under the field, not above the fields.
  it('shows a refused value under the value field, keeps the values, and clears the message on an edit', async () => {
    vi.mocked(wordpressConfigApi.createConfig).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          message: 'The value field must not be greater than 8192 characters.',
          errors: { value: ['The value field must not be greater than 8192 characters.'] },
        },
      },
    })
    const { wrapper, alerts } = await mountConfigs()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    const valueRow = () => document.querySelector('[data-testid="wordpress-config-modal-field-value"]')?.textContent ?? ''
    expect(valueRow()).toContain('The value field must not be greater than 8192 characters.')
    expect(document.querySelector('[data-testid="wordpress-config-modal-error"]')).toBeNull()
    expect(fieldValue(wrapper, 'name')).toBe('gamma')
    expect(fieldValue(wrapper, 'value')).toBe('two')
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(alerts.activeAlerts).toEqual([])

    setField(wrapper, 'value', 'three')
    await flushPromises()
    expect(valueRow()).not.toContain('The value field must not be greater than 8192 characters.')
    wrapper.unmount()
  })

  // A masked secret never goes back as a value: the edit form starts empty, so an edit cannot save the mask over the key.
  it('opens Edit of a masked secret with an empty value', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue([
      { name: 'DB_PASSWORD', value: '********', type: 'constant', secret: true },
    ])
    vi.mocked(wordpressConfigApi.updateConfig).mockResolvedValue(undefined)
    const { wrapper } = await mountConfigs()
    const modal = await openEditModal(wrapper, 'DB_PASSWORD')

    expect(fieldValue(wrapper, 'name')).toBe('DB_PASSWORD')
    expect(fieldValue(wrapper, 'value')).toBe('')
    expect(fieldValue(wrapper, 'type')).toBe('constant')

    setField(wrapper, 'value', 'new-db-secret')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.updateConfig).toHaveBeenCalledWith(INSTANCE_ID, 'DB_PASSWORD', { name: 'DB_PASSWORD', value: 'new-db-secret', type: 'constant' })
    wrapper.unmount()
  })

  // (h) Edit: the fields start from the row. A renamed Update addresses the row's original name and sends the whole row with the edit;
  // then the list reloads, the success alert shows and the modal closes.
  it('opens Edit with the row values, then updates the row by its original name, reloads and closes', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    vi.mocked(wordpressConfigApi.updateConfig).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountConfigs()
    const modal = await openEditModal(wrapper, 'alpha')

    expect(modal.props('title')).toBe('heading.instance.advanced.wordpressConfig.modal.edit.title')
    expect(fieldValue(wrapper, 'name')).toBe('alpha')
    expect(fieldValue(wrapper, 'value')).toBe('one')
    expect(fieldValue(wrapper, 'type')).toBe('constant')

    setField(wrapper, 'name', 'alpha-2')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.updateConfig).toHaveBeenCalledWith(INSTANCE_ID, 'alpha', { name: 'alpha-2', value: 'one', type: 'constant' })
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(2)
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.wordpressConfig.update.success' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (i) A refused update keeps the modal open with the message in it, does not reload and does not close.
  it('keeps the modal open with the error in it when the update request is refused', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    vi.mocked(wordpressConfigApi.updateConfig).mockRejectedValue({ response: { data: { message: 'Update failed' } } })
    const { wrapper, alerts } = await mountConfigs()
    const modal = await openEditModal(wrapper, 'alpha')

    clickFirstButton(modal)
    await flushPromises()

    expect(document.querySelector('[data-testid="wordpress-config-modal-error"]')?.textContent).toBe('Update failed')
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(alerts.activeAlerts).toEqual([])
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // (j) Delete stays disabled until the confirm checkbox is ticked; then it deletes by the row's name and type, alerts, reloads and closes.
  it('deletes the config only after the confirm checkbox is ticked, then alerts, reloads and closes', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    vi.mocked(wordpressConfigApi.deleteConfig).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountConfigs()
    const modal = await openDeleteModal(wrapper, 'alpha')

    expect(modal.props('title')).toBe('heading.instance.advanced.wordpressConfig.modal.delete.title')
    expect(modal.props('confirmRequired')).toBe(true)
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeDefined()

    setField(wrapper, 'confirm', true)
    await flushPromises()
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeUndefined()

    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressConfigApi.deleteConfig).toHaveBeenCalledWith(INSTANCE_ID, 'alpha', 'constant')
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.wordpressConfig.delete.success' }])
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (k) A failed delete shows the error alert, does not reload, and closes the modal (legacy `finally`).
  it('shows the error alert and closes the modal when the delete request fails', async () => {
    vi.mocked(wordpressConfigApi.listConfigs).mockResolvedValue(SAMPLE)
    vi.mocked(wordpressConfigApi.deleteConfig).mockRejectedValue({ response: { data: { message: 'Delete failed' } } })
    const { wrapper, alerts } = await mountConfigs()
    await openDeleteModal(wrapper, 'alpha')

    setField(wrapper, 'confirm', true)
    await flushPromises()
    clickFirstButton(wrapper.findComponent(BasicModal))
    await flushPromises()

    expect(wordpressConfigApi.deleteConfig).toHaveBeenCalledWith(INSTANCE_ID, 'alpha', 'constant')
    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Delete failed' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    expect(wordpressConfigApi.listConfigs).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // The dialog shell (the legacy overlay before the card, the legacy transition, a click on the overlay).
  it('opens Create after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-advanced)', async () => {
    const { wrapper } = await mountConfigs()
    await openCreateModal(wrapper)

    const overlay = expectOverlayBeforeCard('[data-testid="wordpress-config-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
    wrapper.unmount()
  })

  it('ignores an overlay click while the create request runs (kit-dialog-advanced)', async () => {
    vi.mocked(wordpressConfigApi.createConfig).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountConfigs()
    const modal = await openCreateModal(wrapper)
    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(true)
    await clickOverlay(expectOverlayBeforeCard('[data-testid="wordpress-config-modal"]'))

    expect(openDialogs(wrapper)).toBe(1)
    wrapper.unmount()
  })
})
