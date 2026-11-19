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
import { registeredText } from './wordpress-users-table'
import * as wordpressUsersApi from './wordpress-users.api'
import WordpressUsersTable from './WordpressUsersTable.vue'
import WordpressUsersView from './WordpressUsersView.vue'

vi.mock('./wordpress-users.api', () => ({
  listWordpressUsers: vi.fn(),
  createWordpressUser: vi.fn(),
  updateWordpressUser: vi.fn(),
  resetWordpressUserPassword: vi.fn(),
  deleteWordpressUser: vi.fn(),
}))

const INSTANCE_ID = 9
const REGISTERED = '2026-01-01T00:00:00Z'
const NOW = '2026-11-01T00:00:00Z'

const USERS = [
  { id: 9, username: 'nine', display_name: 'Nine', email: 'nine@example.com', role: 'editor', user_registered: REGISTERED },
  { id: 10, username: 'ten', display_name: 'Ten', email: 'ten@example.com', role: 'author', user_registered: REGISTERED },
  { id: 1, username: 'admin', display_name: 'Admin', email: 'admin@example.com', role: 'administrator', user_registered: REGISTERED },
]

function makeInstance (): InstanceResource {
  return { id: INSTANCE_ID } as unknown as InstanceResource
}

async function mountUsers () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(WordpressUsersView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

/** The mailto links of the rows on screen, in row order. */
function rowEmails (wrapper: Awaited<ReturnType<typeof mountUsers>>['wrapper']): string[] {
  return wrapper.findAll('a[href^="mailto:"]').map(link => link.attributes('href') ?? '')
}

type Mounted = Awaited<ReturnType<typeof mountUsers>>['wrapper']

/** Clicks the title-bar Create button and returns the open modal. */
async function openCreateModal (wrapper: Mounted) {
  await wrapper.get('[data-testid="wordpress-users-add"]').trigger('click')
  await flushPromises()
  return wrapper.findComponent(BasicModal)
}

/** The current value of a modal field, as the field component receives it. */
function fieldValue (wrapper: Mounted, name: string): unknown {
  return wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!.props('modelValue')
}

function setField (wrapper: Mounted, name: string, value: unknown): void {
  const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!
  field.vm.$emit('update:modelValue', value)
}

/** The first action button of the open modal: Create. */
function clickFirstButton (modal: { findAll: (selector: string) => Array<{ trigger: (event: string) => unknown }> }): void {
  modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
}

function fillValidCreateForm (wrapper: Mounted): void {
  setField(wrapper, 'username', 'writer')
  setField(wrapper, 'email', 'writer@example.com')
  setField(wrapper, 'display_name', 'Writer')
  setField(wrapper, 'password', 'Longenough1!')
  setField(wrapper, 'role', 'editor')
  setField(wrapper, 'send_email', true)
}

describe('WordpressUsersView', () => {
  const width = window.innerWidth
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    // The snapshots hold "10 months ago" for REGISTERED, so the clock is fixed; only Date is faked to keep awaits working.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) })
    window.innerWidth = 1600
    vi.resetAllMocks()
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    window.innerWidth = width
    Reflect.deleteProperty(navigator, 'clipboard')
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  // (a) The title bar: the title with its legacy key, the search controls and the Create button; the list is requested on mount.
  it('renders the title, the search controls and the Create button, and loads the users on mount', async () => {
    const { wrapper } = await mountUsers()

    expect(wrapper.find('.page-title__title').text()).toBe('heading.instance.advanced.users.title')
    expect(wrapper.findComponent(DataIteratorFilterControls).exists()).toBe(true)
    expect(wrapper.get('[data-testid="wordpress-users-add"]').text()).toContain('button.user.create')
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledWith(INSTANCE_ID)
    wrapper.unmount()
  })

  // (b) A failed list request shows the error alert, ends the loading state and leaves the list empty.
  it('shows the error alert, ends the loading state and leaves the list empty when the list request fails', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockRejectedValue({ response: { data: { message: 'Users unavailable' } } })
    const { wrapper, alerts } = await mountUsers()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Users unavailable' }])
    expect((wrapper.vm as unknown as { itemsLoading: boolean }).itemsLoading).toBe(false)
    expect((wrapper.vm as unknown as { items: unknown[] }).items).toEqual([])
    wrapper.unmount()
  })

  // (c) Desktop list: default sort `id` descending as text ("9" before "10"), role chip, mailto link, registration text,
  // and Delete is disabled for the user with id 1 only.
  it('lists the users on desktop: default id sort as text, role chip, mailto link, registration text and the protected Delete', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountUsers()

    expect(rowEmails(wrapper)).toEqual(['mailto:nine@example.com', 'mailto:ten@example.com', 'mailto:admin@example.com'])
    expect(wrapper.find('.user-role-label').exists()).toBe(true)
    expect(wrapper.text()).toContain(registeredText(REGISTERED))

    const deleteButtons = wrapper.findAll('[data-testid="wordpress-users-delete"]')
    expect(deleteButtons).toHaveLength(3)
    expect(deleteButtons[0]!.attributes('disabled')).toBeUndefined()
    expect(deleteButtons[1]!.attributes('disabled')).toBeUndefined()
    expect(deleteButtons[2]!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  // (d) Search: matches email and role regardless of case, not the registration date; no results and clear filter; empty list.
  it('searches email and role case-insensitively, not the registration date, and clears the filter from the no-results message', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountUsers()
    const filter = wrapper.findComponent(DataIteratorFilterControls)

    filter.vm.$emit('update:search-term', 'NINE@')
    await flushPromises()
    expect(rowEmails(wrapper)).toEqual(['mailto:nine@example.com'])

    filter.vm.$emit('update:search-term', 'Editor')
    await flushPromises()
    expect(rowEmails(wrapper)).toEqual(['mailto:nine@example.com'])

    filter.vm.$emit('update:search-term', '2026')
    await flushPromises()
    expect(rowEmails(wrapper)).toEqual([])
    const noResults = wrapper.findComponent(DataIteratorNoResultsContainer)
    expect(noResults.exists()).toBe(true)

    noResults.vm.$emit('clear-all-filters')
    await flushPromises()
    expect(rowEmails(wrapper)).toEqual(['mailto:nine@example.com', 'mailto:ten@example.com', 'mailto:admin@example.com'])
    wrapper.unmount()
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the card of a user with the legacy markup', async () => {
    window.innerWidth = 1200
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountUsers()

    const cards = wrapper.findAll('tbody tr')
    expect(normalizeHtml(cards[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.id</div><div class="mobile-table-item__value"><span class="bold p-3">9</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.login</div><div class="mobile-table-item__value"><span class="bold p-3">nine</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.displayName</div><div class="mobile-table-item__value"><span class="bold p-3">Nine</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.email</div><div class="mobile-table-item__value"><span class="bold p-3">nine@example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.role</div><div class="mobile-table-item__value"><span class="bold p-3">editor</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.registered</div><div class="mobile-table-item__value"><span class="bold p-3">10 months ago</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.edit" data-testid="wordpress-users-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword" data-testid="wordpress-users-reset-password"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="wordpress-users-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    expect(normalizeHtml(cards[2]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.id</div><div class="mobile-table-item__value"><span class="bold p-3">1</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.login</div><div class="mobile-table-item__value"><span class="bold p-3">admin</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.displayName</div><div class="mobile-table-item__value"><span class="bold p-3">Admin</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.email</div><div class="mobile-table-item__value"><span class="bold p-3">admin@example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.role</div><div class="mobile-table-item__value"><span class="bold p-3">administrator</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.registered</div><div class="mobile-table-item__value"><span class="bold p-3">10 months ago</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.edit" data-testid="wordpress-users-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword" data-testid="wordpress-users-reset-password"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="button.user.delete" data-testid="wordpress-users-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  // (e) Below 1400 px the rows are cards: a click on the Email label sorts by email; Delete is blocked for the user with id 1.
  it('shows cards below 1400 px, sorts by email from the Email label, and blocks Delete for the user with id 1', async () => {
    window.innerWidth = 1200
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    const { wrapper } = await mountUsers()

    const cards = wrapper.findAll('tbody tr')
    expect(cards).toHaveLength(3)
    expect(cards[0]!.find('.mobile-table-item__value span').text()).toBe('9')
    expect(cards[0]!.findAll('.mobile-table-item__value span')[4]!.text()).toBe('editor')
    expect(wrapper.find('.user-role-label').exists()).toBe(false)
    expect(wrapper.text()).toContain(registeredText(REGISTERED))

    const emailLabel = cards[0]!.findAll('.mobile-table-item__header').find(label => label.text() === 'table.header.email')!
    await emailLabel.trigger('click')

    const emitted = wrapper.findComponent(WordpressUsersTable).emitted('update:sort-by')
    expect(emitted).toHaveLength(1)
    expect(emitted![0]![0]).toMatchObject({ value: 'email' })

    const deleteButtons = wrapper.findAll('[data-testid="wordpress-users-delete"]')
    expect(deleteButtons).toHaveLength(3)
    expect(deleteButtons[0]!.attributes('disabled')).toBeUndefined()
    expect(deleteButtons[2]!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  // (f) Create: an invalid form sends no request; a valid one sends the legacy body, shows the success alert, reloads the list and closes.
  it('creates the user only from a valid form, then alerts, reloads the list and closes', async () => {
    vi.mocked(wordpressUsersApi.createWordpressUser).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountUsers()
    const modal = await openCreateModal(wrapper)

    expect(modal.props('title')).toBe('heading.instance.advanced.users.modal.create.title')
    setField(wrapper, 'username', 'writer')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()
    expect(wordpressUsersApi.createWordpressUser).not.toHaveBeenCalled()

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressUsersApi.createWordpressUser).toHaveBeenCalledWith(INSTANCE_ID, {
      username: 'writer',
      email: 'writer@example.com',
      display_name: 'Writer',
      password: 'Longenough1!',
      role: 'editor',
      send_email: true,
    })
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.user.create.success' }])
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (g) A refused create stays in the dialog: the server's message here names no field, so it goes above the fields and the values stay.
  it('keeps the dialog open with the failure above the fields when the create request fails', async () => {
    vi.mocked(wordpressUsersApi.createWordpressUser).mockRejectedValue({ response: { data: { message: 'Create failed' } } })
    const { wrapper, alerts } = await mountUsers()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(alerts.activeAlerts).toEqual([])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(document.querySelector('[data-testid="wordpress-users-modal-error"]')?.textContent).toContain('Create failed')
    expect(fieldValue(wrapper, 'username')).toBe('writer')
    expect(fieldValue(wrapper, 'password')).toBe('Longenough1!')
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // A 422 names the field it refused (the WordPress password policy): that message belongs under the field, not above the fields.
  it('shows a refused password under the field, keeps every value, and clears the message on an edit', async () => {
    vi.mocked(wordpressUsersApi.createWordpressUser).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          message: 'The password field must contain at least one symbol.',
          errors: { password: ['The password field must contain at least one symbol.'] },
        },
      },
    })
    const { wrapper, alerts } = await mountUsers()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    const passwordRow = () => document.querySelector('[data-testid="wordpress-users-modal-field-password"]')?.textContent ?? ''
    expect(passwordRow()).toContain('The password field must contain at least one symbol.')
    expect(document.querySelector('[data-testid="wordpress-users-modal-error"]')).toBeNull()
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(document.querySelector('[data-testid="wordpress-users-modal"]')?.textContent).toContain('button.create')
    expect(fieldValue(wrapper, 'username')).toBe('writer')
    expect(fieldValue(wrapper, 'email')).toBe('writer@example.com')
    expect(fieldValue(wrapper, 'display_name')).toBe('Writer')
    expect(fieldValue(wrapper, 'password')).toBe('Longenough1!')
    expect(fieldValue(wrapper, 'role')).toBe('editor')
    expect(alerts.activeAlerts).toEqual([])
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(1)

    setField(wrapper, 'password', 'Longenough2!')
    await flushPromises()
    expect(passwordRow()).not.toContain('The password field must contain at least one symbol.')
    wrapper.unmount()
  })

  // The client applies the full panel password policy before any request: a weak password stays in the dialog under its field.
  it('refuses a weak password under the field before sending the create request', async () => {
    const { wrapper, alerts } = await mountUsers()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    setField(wrapper, 'password', 'longenough')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressUsersApi.createWordpressUser).not.toHaveBeenCalled()
    expect(alerts.activeAlerts).toEqual([])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(document.querySelector('[data-testid="wordpress-users-modal-field-password"]')?.textContent)
      .toContain('form.validation.passwordCharacters')
    wrapper.unmount()
  })

  // The Create password field lists the rules under it, before the user types.
  it('shows the password rules under the Create password field', async () => {
    const { wrapper } = await mountUsers()
    await openCreateModal(wrapper)

    expect(document.querySelector('[data-testid="wordpress-users-modal-field-password"]')?.textContent).toContain(
      'To ensure that your password is strong, use at least: 8 characters, 1 uppercase character, 1 lowercase character, 1 number, 1 symbol',
    )
    wrapper.unmount()
  })

  // A 422 that names the role select (which cannot show a message of its own) goes above the fields, with the dialog still open.
  it('shows a refusal that names the role select above the fields', async () => {
    vi.mocked(wordpressUsersApi.createWordpressUser).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'The selected role is invalid.', errors: { role: ['The selected role is invalid.'] } } },
    })
    const { wrapper, alerts } = await mountUsers()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(document.querySelector('[data-testid="wordpress-users-modal-error"]')?.textContent).toContain('The selected role is invalid.')
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(alerts.activeAlerts).toEqual([])
    wrapper.unmount()
  })

  // (h) Edit: the fields hold the row and the password is empty; Update sends the whole row with `password: null`, then reloads, alerts and closes.
  it('opens Edit on the row values and sends the whole row with a null password, then reloads, alerts and closes', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    vi.mocked(wordpressUsersApi.updateWordpressUser).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountUsers()

    await wrapper.findAll('[data-testid="wordpress-users-edit"]')[0]!.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)

    expect(modal.props('title')).toBe('heading.instance.advanced.users.modal.update.title')
    expect(fieldValue(wrapper, 'username')).toBe('nine')
    expect(fieldValue(wrapper, 'email')).toBe('nine@example.com')
    expect(fieldValue(wrapper, 'display_name')).toBe('Nine')
    expect(fieldValue(wrapper, 'role')).toBe('editor')
    expect(fieldValue(wrapper, 'password')).toBeNull()
    expect(wrapper.findAllComponents(BasicModalField).some(field => field.props('field').name === 'send_email')).toBe(false)

    setField(wrapper, 'display_name', 'Nine renamed')
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressUsersApi.updateWordpressUser).toHaveBeenCalledWith(INSTANCE_ID, 9, {
      ...USERS[0],
      user_registered_text: registeredText(REGISTERED),
      display_name: 'Nine renamed',
      password: null,
    })
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.user.update.success' }])
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (i) A refused update stays in the dialog too, with the message under the field it names, and no reload.
  it('keeps the edit dialog open with a refused password under the field and does not reload', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    vi.mocked(wordpressUsersApi.updateWordpressUser).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          message: 'The password field must not be greater than 255 characters.',
          errors: { password: ['The password field must not be greater than 255 characters.'] },
        },
      },
    })
    const { wrapper, alerts } = await mountUsers()

    await wrapper.findAll('[data-testid="wordpress-users-edit"]')[0]!.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)
    setField(wrapper, 'password', 'x'.repeat(256))
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(document.querySelector('[data-testid="wordpress-users-modal-field-password"]')?.textContent)
      .toContain('The password field must not be greater than 255 characters.')
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(fieldValue(wrapper, 'display_name')).toBe('Nine')
    expect(alerts.activeAlerts).toEqual([])
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps the edit dialog open with a failure that names no field above the fields', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    vi.mocked(wordpressUsersApi.updateWordpressUser).mockRejectedValue({ response: { data: { message: 'Update failed' } } })
    const { wrapper, alerts } = await mountUsers()

    await wrapper.findAll('[data-testid="wordpress-users-edit"]')[0]!.trigger('click')
    await flushPromises()
    clickFirstButton(wrapper.findComponent(BasicModal))
    await flushPromises()

    expect(alerts.activeAlerts).toEqual([])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(document.querySelector('[data-testid="wordpress-users-modal-error"]')?.textContent).toContain('Update failed')
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // (j) Delete: the row opens the modal; Delete stays disabled until the confirm checkbox is ticked; then it deletes by the row email, alerts,
  // reloads and closes.
  it('deletes the user only after the confirm checkbox is ticked, then alerts, reloads and closes', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    vi.mocked(wordpressUsersApi.deleteWordpressUser).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountUsers()

    await wrapper.findAll('[data-testid="wordpress-users-delete"]')[0]!.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)

    expect(modal.props('title')).toBe('heading.instance.advanced.users.modal.delete.title')
    expect(modal.props('confirmRequired')).toBe(true)
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeDefined()

    setField(wrapper, 'confirm', true)
    await flushPromises()
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeUndefined()

    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressUsersApi.deleteWordpressUser).toHaveBeenCalledWith(INSTANCE_ID, 'nine@example.com')
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.user.delete.success' }])
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (k) A failed delete shows the error alert, does not reload, and closes the modal (legacy `finally`).
  it('shows the error alert and closes the modal when the delete request fails', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    vi.mocked(wordpressUsersApi.deleteWordpressUser).mockRejectedValue({ response: { data: { message: 'Delete failed' } } })
    const { wrapper, alerts } = await mountUsers()

    await wrapper.findAll('[data-testid="wordpress-users-delete"]')[0]!.trigger('click')
    await flushPromises()
    setField(wrapper, 'confirm', true)
    await flushPromises()
    clickFirstButton(wrapper.findComponent(BasicModal))
    await flushPromises()

    expect(wordpressUsersApi.deleteWordpressUser).toHaveBeenCalledWith(INSTANCE_ID, 'nine@example.com')
    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Delete failed' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // (l) Reset: the row opens the warning with the email; Reset sends the whole row, alerts, and the same modal stays open with an empty
  // message and the new password in a readonly field behind Copy and Close. The password on screen is the one the reset just set, so the
  // done state must not send another reset.
  it('resets from the warning, then shows the new password behind Copy and Close without resetting again', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    vi.mocked(wordpressUsersApi.resetWordpressUserPassword).mockResolvedValue('Generated-1234')
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { wrapper, alerts } = await mountUsers()

    await wrapper.findAll('[data-testid="wordpress-users-reset-password"]')[0]!.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)

    expect(modal.props('title')).toBe('heading.instance.advanced.users.modal.resetPassword.title')
    expect(modal.props('message')).toBe('heading.instance.advanced.users.modal.resetPassword.message')
    expect(modal.props('color')).toBe('warning')
    expect(wrapper.findAllComponents(BasicModalField)).toHaveLength(0)

    clickFirstButton(modal)
    await flushPromises()

    expect(wordpressUsersApi.resetWordpressUserPassword).toHaveBeenCalledWith(INSTANCE_ID, {
      ...USERS[0],
      user_registered_text: registeredText(REGISTERED),
    })
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.user.resetPassword.success' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)

    const doneModal = wrapper.findComponent(BasicModal)
    expect(doneModal.props('message')).toBe('')
    expect(doneModal.props('title')).toBe('heading.instance.advanced.users.modal.resetPassword.title')
    expect(fieldValue(wrapper, 'new_password')).toBe('Generated-1234')
    expect(wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === 'new_password')!.props('field')).toMatchObject({
      type: 'text',
      readonly: true,
    })
    expect(doneModal.props('buttons')).toEqual([
      { id: 'copy', label: 'button.copy', color: 'normal' },
      { id: 'close', label: 'button.close', color: 'primary' },
    ])
    expect(doneModal.findAll('.v-card-actions .v-btn')).toHaveLength(2)

    await doneModal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('Generated-1234')
    expect(wordpressUsersApi.resetWordpressUserPassword).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)

    await doneModal.findAll('.v-card-actions .v-btn')[1]!.trigger('click')
    await flushPromises()

    expect(wordpressUsersApi.resetWordpressUserPassword).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // (m) A failed reset shows the error alert; the modal stays open with its original message and both buttons active (it does not close).
  it('shows the error alert and keeps the warning open with its buttons active when the reset request fails', async () => {
    vi.mocked(wordpressUsersApi.listWordpressUsers).mockResolvedValue(USERS)
    vi.mocked(wordpressUsersApi.resetWordpressUserPassword).mockRejectedValue({ response: { data: { message: 'Reset failed' } } })
    const { wrapper, alerts } = await mountUsers()

    await wrapper.findAll('[data-testid="wordpress-users-reset-password"]')[0]!.trigger('click')
    await flushPromises()
    clickFirstButton(wrapper.findComponent(BasicModal))
    await flushPromises()

    const modal = wrapper.findComponent(BasicModal)
    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Reset failed' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(modal.props('message')).toBe('heading.instance.advanced.users.modal.resetPassword.message')
    expect(wrapper.findAllComponents(BasicModalField)).toHaveLength(0)
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeUndefined()
    expect(wordpressUsersApi.listWordpressUsers).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('shows the empty message with its illustration when the list is empty and no search is set', async () => {
    const { wrapper } = await mountUsers()

    expect(wrapper.get('[data-testid="wordpress-users-empty"]').text()).toContain('heading.instance.advanced.users.noData')
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(false)
    wrapper.unmount()
  })

  // The dialog shell (the legacy overlay before the card, the legacy transition, a click on the overlay).
  it('opens Create after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-advanced)', async () => {
    const { wrapper } = await mountUsers()
    await openCreateModal(wrapper)

    const overlay = expectOverlayBeforeCard('[data-testid="wordpress-users-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
    wrapper.unmount()
  })

  it('ignores an overlay click while the create request runs (kit-dialog-advanced)', async () => {
    vi.mocked(wordpressUsersApi.createWordpressUser).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountUsers()
    const modal = await openCreateModal(wrapper)
    fillValidCreateForm(wrapper)
    await flushPromises()
    clickFirstButton(modal)
    await flushPromises()

    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(true)
    await clickOverlay(expectOverlayBeforeCard('[data-testid="wordpress-users-modal"]'))

    expect(openDialogs(wrapper)).toBe(1)
    wrapper.unmount()
  })
})
