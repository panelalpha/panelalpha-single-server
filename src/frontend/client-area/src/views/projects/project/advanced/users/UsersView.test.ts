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
import * as usersApi from './users.api'
import UsersView from './UsersView.vue'

vi.mock('./users.api', () => ({
  listUsers: vi.fn(),
  listUserRoles: vi.fn(),
  createUser: vi.fn(),
  resetUserPassword: vi.fn(),
  deleteUser: vi.fn(),
}))

const INSTANCE_ID = 9

function makeInstance (): InstanceResource {
  return { id: INSTANCE_ID } as unknown as InstanceResource
}

function makeUser (id: string, overrides: Partial<usersApi.InstanceAppUser> = {}): usersApi.InstanceAppUser {
  return { id, username: `user${id}`, email: `user${id}@example.com`, role: 'admin', ...overrides }
}

async function mountUsers () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(UsersView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

/** The table rows as their id cell text (the first column). */
function rowIds (wrapper: Awaited<ReturnType<typeof mountUsers>>['wrapper']): string[] {
  return wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text())
}

/** Clicks the title-bar Create button and waits for the roles and the modal. */
async function openCreateModal (wrapper: Awaited<ReturnType<typeof mountUsers>>['wrapper']) {
  await wrapper.get('[data-testid="users-add"]').trigger('click')
  await flushPromises()
  return wrapper.findComponent(BasicModal)
}

function setField (wrapper: Awaited<ReturnType<typeof mountUsers>>['wrapper'], name: string, value: unknown): void {
  const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!
  field.vm.$emit('update:modelValue', value)
}

/** The Create button of the open modal (the first action button). */
function clickCreate (modal: { findAll: (selector: string) => Array<{ trigger: (event: string) => unknown }> }): void {
  modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
}

function fillValidCreateForm (wrapper: Awaited<ReturnType<typeof mountUsers>>['wrapper']): void {
  setField(wrapper, 'username', 'newuser')
  setField(wrapper, 'email', 'new@example.com')
  setField(wrapper, 'password', 'secret123')
  setField(wrapper, 'role', 'administrator')
}

describe('UsersView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    // The desktop table (and its header row) starts at 1400 px.
    window.innerWidth = 1600
    vi.resetAllMocks()
    vi.mocked(usersApi.listUsers).mockResolvedValue([])
    vi.mocked(usersApi.listUserRoles).mockResolvedValue(['administrator', 'editor'])
  })

  afterEach(() => {
    window.innerWidth = width
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  // (a) The title bar: title, filter controls and the Create button with its i18n keys.
  it('renders the title, the search controls and the Create button', async () => {
    const { wrapper } = await mountUsers()

    expect(wrapper.find('.page-title__title').text()).toBe('heading.instance.advanced.users.title')
    expect(wrapper.findComponent(DataIteratorFilterControls).exists()).toBe(true)
    expect(wrapper.get('[data-testid="users-add"]').text()).toContain('button.user.create')
    expect(usersApi.listUsers).toHaveBeenCalledWith(INSTANCE_ID)
    wrapper.unmount()
  })

  // (b) A failed list request shows the error alert and ends the loading state.
  it('shows the error alert and no skeleton when the list request fails', async () => {
    vi.mocked(usersApi.listUsers).mockRejectedValue({ response: { data: { message: 'Users unavailable' } } })
    const { wrapper, alerts } = await mountUsers()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Users unavailable' }])
    expect(wrapper.find('[data-testid="users-loading"]').exists()).toBe(false)
    wrapper.unmount()
  })

  // (c) The rows, sorted by id descending as text: "9" before "10" and "1" last.
  it('lists the users sorted by id descending as text', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('1'), makeUser('10'), makeUser('9')])
    const { wrapper } = await mountUsers()

    expect(rowIds(wrapper)).toEqual(['9', '10', '1'])
    wrapper.unmount()
  })

  // (d) An empty list shows the empty state; a search without matches shows no-results, and clearing it restores the rows.
  it('shows the empty state for an empty list', async () => {
    const { wrapper } = await mountUsers()

    expect(wrapper.find('[data-testid="users-empty"]').exists()).toBe(true)
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows no-results for a search without matches and clears the search from it', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('1'), makeUser('2')])
    const { wrapper } = await mountUsers()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:searchTerm', 'nobody-has-this')
    await flushPromises()

    expect(wrapper.find('[data-testid="users-empty"]').exists()).toBe(false)
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)

    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')
    await flushPromises()

    expect(wrapper.findComponent(DataIteratorFilterControls).props('searchTerm')).toBe('')
    expect(rowIds(wrapper)).toEqual(['2', '1'])
    wrapper.unmount()
  })

  // (e) The Delete button of the user with id 1 is disabled; the others stay enabled.
  it('disables Delete for the user with id 1 only', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('1'), makeUser('2')])
    const { wrapper } = await mountUsers()

    const deleteButtons = wrapper.findAll('tbody tr [data-testid="users-delete"]').map(button => button.element as HTMLButtonElement)
    expect(deleteButtons.map(button => button.disabled)).toEqual([false, true])
    wrapper.unmount()
  })

  // (e2) The row icon buttons have an accessible name (the tooltip keys), on the desktop table and in the mobile card.
  it('names the reset and delete icon buttons of a row on desktop and mobile', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('2')])
    const width = window.innerWidth
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1500 })
      const desktop = await mountUsers()
      expect(desktop.wrapper.get('tbody tr [data-testid="users-reset-password"]').attributes('aria-label')).toBe('button.resetPassword')
      expect(desktop.wrapper.get('tbody tr [data-testid="users-delete"]').attributes('aria-label')).toBe('button.user.delete')
      desktop.wrapper.unmount()

      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 })
      const mobile = await mountUsers()
      const names = mobile.wrapper.findAll('.mobile-table-item .v-btn').map(button => button.attributes('aria-label'))
      expect(names).toEqual(['button.resetPassword', 'button.user.delete'])
      mobile.wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
    }
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a user and the desktop row with the legacy markup', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('2')])
    const width = window.innerWidth
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1500 })
      const desktop = await mountUsers()
      expect(normalizeHtml(desktop.wrapper.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr class="v-data-table__tr"><td class="v-data-table__td v-data-table-column--align-start">2</td><td class="v-data-table__td v-data-table-column--align-start">user2</td><td class="v-data-table__td v-data-table-column--align-start">user2@example.com</td><td class="v-data-table__td v-data-table-column--align-start">admin</td><td class="v-data-table__td v-data-table-column--align-start"><div class="d-flex actions-row"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword" data-testid="users-reset-password"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="users-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></td></tr>"`)
      desktop.wrapper.unmount()

      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 })
      const mobile = await mountUsers()
      expect(normalizeHtml(mobile.wrapper.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.id</div><div class="mobile-table-item__value"><span class="bold p-3">2</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.login</div><div class="mobile-table-item__value"><span class="bold p-3">user2</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.email</div><div class="mobile-table-item__value"><span class="bold p-3">user2@example.com</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.role</div><div class="mobile-table-item__value"><span class="bold p-3">admin</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.resetPassword"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
      mobile.wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
    }
  })

  // (f) The roles are loaded once for the page; the role select is plain text, as lite.
  it('loads the roles once for the Create modal and shows the role select as plain text', async () => {
    const { wrapper } = await mountUsers()

    const modal = await openCreateModal(wrapper)

    expect(usersApi.listUserRoles).toHaveBeenCalledWith(INSTANCE_ID)
    expect(modal.classes()).toContain('card-width-560')
    expect(modal.attributes('style')).toBeUndefined()
    expect(modal.props('title')).toBe('heading.instance.advanced.users.modal.create.title')
    const fields = wrapper.findAllComponents(BasicModalField)
    expect(fields.map(field => field.props('field').name)).toEqual(['username', 'email', 'password', 'role'])
    expect(fields[3]!.props('field')).toMatchObject({ plainOptions: true })
    expect(document.body.querySelector('.user-role-label')).toBeNull()

    modal.vm.$emit('modal-close')
    await flushPromises()
    await openCreateModal(wrapper)
    expect(usersApi.listUserRoles).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // (g) An invalid form does not reach the API; a valid one creates the user, alerts, reloads and closes.
  it('creates the user only from a valid form, then reloads the list and closes', async () => {
    vi.mocked(usersApi.createUser).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountUsers()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    setField(wrapper, 'email', 'not-an-email')
    await flushPromises()
    clickCreate(modal)
    await flushPromises()
    expect(usersApi.createUser).not.toHaveBeenCalled()

    setField(wrapper, 'email', 'new@example.com')
    await flushPromises()
    clickCreate(modal)
    await flushPromises()

    expect(usersApi.createUser).toHaveBeenCalledWith(INSTANCE_ID, {
      username: 'newuser',
      email: 'new@example.com',
      password: 'secret123',
      role: 'administrator',
    })
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.user.create.success' }])
    expect(usersApi.listUsers).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (h) A failed create keeps the modal open and closable; a failed roles request shows the alert and no modal.
  it('keeps the modal open and closable when the create request fails', async () => {
    vi.mocked(usersApi.createUser).mockRejectedValue({ response: { data: { message: 'Create failed' } } })
    const { wrapper, alerts } = await mountUsers()
    const modal = await openCreateModal(wrapper)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickCreate(modal)
    await flushPromises()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Create failed' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(false)

    wrapper.findComponent(BasicModal).vm.$emit('modal-close')
    await flushPromises()
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('shows the alert, opens no modal and stops the Create spinner when the roles request fails', async () => {
    vi.mocked(usersApi.listUserRoles).mockRejectedValue({ response: { data: { message: 'Roles unavailable' } } })
    const { wrapper, alerts } = await mountUsers()

    await wrapper.get('[data-testid="users-add"]').trigger('click')
    await flushPromises()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Roles unavailable' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
    const addButton = wrapper.findAllComponents({ name: 'VBtn' }).find(button => button.attributes('data-testid') === 'users-add')!
    expect(addButton.props('loading')).toBe(false)
    wrapper.unmount()
  })

  // (i) Reset sends the whole row with the new password, alerts and closes; a short password sends nothing.
  it('resets the password from a valid form, alerts and closes; a short password sends no request', async () => {
    vi.mocked(usersApi.resetUserPassword).mockResolvedValue(undefined)
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('1'), makeUser('2')])
    const { wrapper, alerts } = await mountUsers()

    // Rows are sorted id descending as text, so the first reset button belongs to user "2".
    await wrapper.findAll('tbody tr [data-testid="users-reset-password"]')[0]!.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)
    expect(modal.props('title')).toBe('heading.instance.advanced.users.modal.resetPassword.title')
    expect(modal.classes()).toContain('card-width-560')
    expect(modal.attributes('style')).toBeUndefined()

    setField(wrapper, 'password', 'short')
    await flushPromises()
    clickCreate(modal)
    await flushPromises()
    expect(usersApi.resetUserPassword).not.toHaveBeenCalled()

    setField(wrapper, 'password', 'longenough')
    await flushPromises()
    clickCreate(modal)
    await flushPromises()

    expect(usersApi.resetUserPassword).toHaveBeenCalledWith(INSTANCE_ID, '2', { ...makeUser('2'), password: 'longenough' })
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.user.resetPassword.success' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (j) A failed reset shows the error alert; the modal stays open and closable.
  it('keeps the reset modal open and closable when the reset request fails', async () => {
    vi.mocked(usersApi.resetUserPassword).mockRejectedValue({ response: { data: { message: 'Reset failed' } } })
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('2')])
    const { wrapper, alerts } = await mountUsers()

    await wrapper.get('tbody tr [data-testid="users-reset-password"]').trigger('click')
    await flushPromises()
    setField(wrapper, 'password', 'longenough')
    await flushPromises()
    clickCreate(wrapper.findComponent(BasicModal))
    await flushPromises()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Reset failed' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(false)

    wrapper.findComponent(BasicModal).vm.$emit('modal-close')
    await flushPromises()
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (k) Delete stays disabled until the confirm checkbox is ticked; then it deletes, alerts, reloads and closes.
  it('deletes the user only after the confirm checkbox is ticked, then alerts, reloads and closes', async () => {
    vi.mocked(usersApi.deleteUser).mockResolvedValue(undefined)
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('2')])
    const { wrapper, alerts } = await mountUsers()

    await wrapper.get('tbody tr [data-testid="users-delete"]').trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(BasicModal)
    expect(modal.props('confirmRequired')).toBe(true)
    expect(modal.classes()).toContain('card-width-560')
    expect(modal.attributes('style')).toBeUndefined()
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeDefined()

    setField(wrapper, 'confirm', true)
    await flushPromises()
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeUndefined()

    clickCreate(modal)
    await flushPromises()

    expect(usersApi.deleteUser).toHaveBeenCalledWith(INSTANCE_ID, '2')
    expect(alerts.activeAlerts).toMatchObject([{ success: true, successMessage: 'notification.instance.user.delete.success' }])
    expect(usersApi.listUsers).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (l) A failed delete shows the error alert and closes the modal (legacy `finally`).
  it('shows the error alert and closes the modal when the delete request fails', async () => {
    vi.mocked(usersApi.deleteUser).mockRejectedValue({ response: { data: { message: 'Delete failed' } } })
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('2')])
    const { wrapper, alerts } = await mountUsers()

    await wrapper.get('tbody tr [data-testid="users-delete"]').trigger('click')
    await flushPromises()
    setField(wrapper, 'confirm', true)
    await flushPromises()
    clickCreate(wrapper.findComponent(BasicModal))
    await flushPromises()

    expect(usersApi.deleteUser).toHaveBeenCalledWith(INSTANCE_ID, '2')
    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Delete failed' }])
    expect(usersApi.listUsers).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // (m) Entry without `general.manage_users` (no route or view guard, as legacy): the list and the Create modal render,
  // and the 403 of a write shows the server message and leaves the modal closable.
  it('renders the page for a user without manage_users and shows a 403 on create as an alert with a closable modal', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser('2')])
    vi.mocked(usersApi.createUser).mockRejectedValue({ response: { status: 403, data: { message: 'Forbidden' } } })
    const { wrapper, alerts } = await mountUsers()

    expect(rowIds(wrapper)).toEqual(['2'])
    const modal = await openCreateModal(wrapper)
    expect(modal.exists()).toBe(true)

    fillValidCreateForm(wrapper)
    await flushPromises()
    clickCreate(modal)
    await flushPromises()

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Forbidden' }])
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    wrapper.findComponent(BasicModal).vm.$emit('modal-close')
    await flushPromises()
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  // The dialog shell (the legacy overlay before the card, the legacy transition, a click on the overlay).
  it('opens Create after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-advanced)', async () => {
    const { wrapper } = await mountUsers()
    await openCreateModal(wrapper)

    const overlay = expectOverlayBeforeCard('[data-testid="users-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
    wrapper.unmount()
  })

  it('ignores an overlay click while the create request runs (kit-dialog-advanced)', async () => {
    vi.mocked(usersApi.createUser).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountUsers()
    const modal = await openCreateModal(wrapper)
    fillValidCreateForm(wrapper)
    await flushPromises()
    clickCreate(modal)
    await flushPromises()

    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(true)
    await clickOverlay(expectOverlayBeforeCard('[data-testid="users-modal"]'))

    expect(openDialogs(wrapper)).toBe(1)
    wrapper.unmount()
  })
})
