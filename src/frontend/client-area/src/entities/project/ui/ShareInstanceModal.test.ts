import type { ShareTableRow } from './share-access-table'
import type { ShareUser } from './share-instance'
import type * as InstancesApi from '@/entities/project/share-instance.api'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/entities/project/share-instance.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { on, resetAppEvents } from '@/shared/events/app-events'
import { mountKit } from '@/test/mount-kit'
import ShareAccessTable from './ShareAccessTable.vue'
import ShareInstanceModal from './ShareInstanceModal.vue'

vi.mock('@/entities/project/share-instance.api', async importOriginal => {
  const actual: typeof InstancesApi = await importOriginal()
  return {
    ...actual,
    inviteSharedAccess: vi.fn(),
    updateSharedAccess: vi.fn(),
    deleteSharedAccess: vi.fn(),
    resendSharedAccessInvite: vi.fn(),
    fetchInvitationSuggestions: vi.fn(),
    fetchWordpressUsers: vi.fn(),
  }
})

const accepted = '2026-01-01T00:00:00.000Z'

function entry (email: string, role: string, extra: Record<string, unknown> = {}) {
  return { email, name: email.split('@', 1)[0], role, accepted_at: accepted, invited_at: accepted, ...extra }
}

function makeInstance (id: number, sharedAccess: ReturnType<typeof entry>[], extra: Record<string, unknown> = {}) {
  const instance = {
    id,
    title: `Site ${id}`,
    sharedAccess,
    subInstances: [],
    owner: { name: 'Jane Doe', email: 'jane@example.com' },
    setSharedAccessData: undefined as unknown as (data: unknown) => void,
    ...extra,
  }
  // Like the resource: the method reads and writes the object it is called on.
  instance.setSharedAccessData = data => {
    instance.sharedAccess = data as typeof sharedAccess
  }
  return instance
}

async function mountModal (props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const pinia = createPinia()
  setActivePinia(pinia)
  // Closed at mount and opened afterwards, as the view does: the dialog loads its data on the closed-to-open change. The host
  // passes the signed-in user's e-mail.
  const wrapper = await mountKit(ShareInstanceModal, {
    props: { modelValue: false, currentUserEmail: 'jane@example.com', ...props },
    global: { plugins: [pinia] },
    attachTo: host,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

type Mounted = Awaited<ReturnType<typeof mountModal>>

/** The user rows of the access table (the owner row has no user). */
function tableUsers (wrapper: Mounted): ShareUser[] {
  return (wrapper.findComponent(ShareAccessTable).props('rows') as ShareTableRow[]).flatMap(row => row.user ? [row.user] : [])
}

function emitFromTable (wrapper: Mounted, event: string, ...args: unknown[]): void {
  wrapper.findComponent(ShareAccessTable).vm.$emit(event, ...args)
}

describe('ShareInstanceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAppEvents()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
    vi.mocked(api.fetchWordpressUsers).mockResolvedValue([{ id: 3, display_name: 'admin', user_email: 'admin@example.com' }])
    vi.mocked(api.fetchInvitationSuggestions).mockResolvedValue([{ email: 'cara@example.com', name: 'Cara' }])
  })

  it('titles the dialog by instance, lists the owner and the users, and loads WordPress users and suggestions on open', async () => {
    const instance = makeInstance(7, [entry('ann@example.com', 'developer'), entry('bob@example.com', 'view_only')])
    const wrapper = await mountModal({ instance })

    expect(bodyQuery('[data-testid="share-title"]')!.textContent).toContain('heading.instance.modal.sharedAccess.title.one')
    // The owner is the signed-in user, so the row reads `table.field.userOwner` (raw key) with the e-mail below.
    expect(bodyQuery('[data-testid="share-owner-row"]')!.textContent).toContain('jane@example.com')
    expect(document.body.querySelectorAll('[data-testid="share-user-row"]')).toHaveLength(2)
    expect(api.fetchWordpressUsers).toHaveBeenCalledWith(7)
    expect(api.fetchInvitationSuggestions).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('shows the Login as column for an SSO role', async () => {
    const instance = makeInstance(7, [entry('ann@example.com', 'developer'), entry('bob@example.com', 'view_only')])
    const wrapper = await mountModal({ instance })

    // Ann (developer) has an SSO role, Bob (view only) not: the column shows, with one picker.
    expect(bodyQuery('[data-testid="share-table-header"]')!.textContent).toContain('form.label.loginAs')
    expect(document.body.querySelectorAll('[data-testid="share-user-row"] .share-login-as')).toHaveLength(1)
    wrapper.unmount()
  })

  it('saves a role change with one update request, then closes and reloads the list', async () => {
    const instance = makeInstance(7, [entry('ann@example.com', 'view_only')])
    vi.mocked(api.updateSharedAccess).mockResolvedValue([entry('ann@example.com', 'full_access')] as never)
    const events: string[] = []
    on('instances-list-reload', () => events.push('reload'))
    on('instance-updated', payload => events.push(`updated:${(payload as { id: number }).id}`))
    const wrapper = await mountModal({ instance })

    emitFromTable(wrapper, 'role-changed', tableUsers(wrapper)[0], 'full_access')
    await flushPromises()
    expect(bodyQuery('[data-testid="share-save"]')!.textContent).toContain('button.sharedAccess.pending')

    bodyQuery('[data-testid="share-save"]')!.click()
    await flushPromises()

    expect(api.updateSharedAccess).toHaveBeenCalledWith(7, {
      users: [{ email: 'ann@example.com', role: 'full_access', custom_privileges: [], apply_to_stagings: false, wordpress_user_id: null }],
    })
    expect(instance.sharedAccess).toEqual([entry('ann@example.com', 'full_access')])
    expect(events).toEqual(['updated:7', 'reload'])
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.sharedAccess.update.success'])
    expect(wrapper.emitted('update:model-value')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('removes a user: the row hides, and Save sends one delete request', async () => {
    const instance = makeInstance(7, [entry('ann@example.com', 'view_only'), entry('bob@example.com', 'view_only')])
    vi.mocked(api.deleteSharedAccess).mockResolvedValue([entry('bob@example.com', 'view_only')] as never)
    const wrapper = await mountModal({ instance })

    bodyQuery('[data-testid="share-remove-access"]')!.click()
    await flushPromises()
    // The removed user leaves the table, and the person counter counts the rows left (owner + Bob).
    expect(document.body.querySelectorAll('[data-testid="share-user-row"]')).toHaveLength(1)
    expect(bodyQuery('[data-testid="share-table-header"]')!.textContent).toContain('general.person')

    bodyQuery('[data-testid="share-save"]')!.click()
    await flushPromises()

    expect(api.deleteSharedAccess).toHaveBeenCalledWith(7, { users: [{ email: 'ann@example.com', apply_to_stagings: false }] })
    expect(api.updateSharedAccess).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancels without a request and drops the pending changes', async () => {
    const instance = makeInstance(7, [entry('ann@example.com', 'view_only')])
    const wrapper = await mountModal({ instance })

    bodyQuery('[data-testid="share-remove-access"]')!.click()
    await flushPromises()
    bodyQuery('[data-testid="share-cancel"]')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:model-value')?.at(-1)).toEqual([false])
    expect(api.deleteSharedAccess).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="share-save"]')!.textContent).toContain('button.save')
    wrapper.unmount()
  })

  it('sends an invite with the chosen addresses and the default role, then clears the form', async () => {
    const instance = makeInstance(7, [])
    vi.mocked(api.inviteSharedAccess).mockResolvedValue([entry('new@example.com', 'view_only')] as never)
    const wrapper = await mountModal({ instance })

    const combobox = wrapper.findComponent({ name: 'VCombobox' })
    combobox.vm.$emit('update:modelValue', [{ email: 'new@example.com', name: 'New' }, 'typed@example.com'])
    await flushPromises()
    bodyQuery('[data-testid="share-invite"]')!.click()
    await flushPromises()

    expect(api.inviteSharedAccess).toHaveBeenCalledWith(7, {
      role: 'view_only',
      emails: ['new@example.com', 'typed@example.com'],
      apply_to_stagings: false,
    })
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.sharedAccess.invite.success'])
    expect(instance.sharedAccess).toEqual([entry('new@example.com', 'view_only')])
    wrapper.unmount()
  })

  it('shows the API error of a failed invite as an alert', async () => {
    const instance = makeInstance(7, [])
    vi.mocked(api.inviteSharedAccess).mockRejectedValue(Object.assign(new Error('x'), { response: { status: 422, data: { message: 'Already invited.' } } }))
    const wrapper = await mountModal({ instance })

    wrapper.findComponent({ name: 'VCombobox' }).vm.$emit('update:modelValue', ['a@example.com'])
    await flushPromises()
    bodyQuery('[data-testid="share-invite"]')!.click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.map(alert => alert.errorMessage)).toEqual(['Already invited.'])
    wrapper.unmount()
  })

  it('resends the invitation of a pending user to the instance', async () => {
    const instance = makeInstance(7, [{ email: 'bob@example.com', name: 'bob', role: 'view_only', accepted_at: null, invited_at: accepted, resend_available_at: accepted }])
    vi.mocked(api.resendSharedAccessInvite).mockResolvedValue([] as never)
    const wrapper = await mountModal({ instance })

    emitFromTable(wrapper, 'resend-button-clicked', tableUsers(wrapper)[0])
    await flushPromises()

    expect(api.resendSharedAccessInvite).toHaveBeenCalledWith(7, { email: 'bob@example.com', apply_to_stagings: false })
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.sharedAccess.resendInvite.success'])
    wrapper.unmount()
  })

  it('shares a selection: titled by the count, mixed roles, invite and update per instance', async () => {
    const a = makeInstance(1, [entry('ann@example.com', 'developer'), entry('bob@example.com', 'view_only')], { owner: undefined })
    const b = makeInstance(2, [entry('ann@example.com', 'developer')], { owner: undefined })
    vi.mocked(api.inviteSharedAccess).mockResolvedValue([] as never)
    vi.mocked(api.updateSharedAccess).mockResolvedValue([] as never)
    const wrapper = await mountModal({ multiInstances: [a, b] })

    expect(bodyQuery('[data-testid="share-title"]')!.textContent).toContain('heading.instance.modal.sharedAccess.title.other')
    expect(api.fetchWordpressUsers).toHaveBeenCalledWith(1)
    expect(bodyQuery('[data-testid="share-owner-row"]')).toBeNull()
    const users = tableUsers(wrapper)
    expect(users.map(user => user.role)).toEqual(['developer', 'mixed'])
    // A mixed role shows the "Select Role" placeholder and the note below the picker.
    expect(bodyQuery('[data-testid="share-table"]')!.textContent).toContain('heading.instance.modal.sharedAccess.mixedTole.title')

    // Bob only exists on the first instance: changing his role updates there and invites him on the second.
    emitFromTable(wrapper, 'role-changed', users[1], 'full_access')
    await flushPromises()
    bodyQuery('[data-testid="share-save"]')!.click()
    await flushPromises()

    expect(api.updateSharedAccess).toHaveBeenCalledWith(1, { users: [expect.objectContaining({ email: 'bob@example.com', role: 'full_access' })] })
    expect(api.inviteSharedAccess).toHaveBeenCalledWith(2, expect.objectContaining({ emails: ['bob@example.com'], role: 'full_access' }))
    wrapper.unmount()
  })

  it('opens the custom privileges screen for the custom role and keeps the choice for the save', async () => {
    const instance = makeInstance(7, [entry('ann@example.com', 'view_only')])
    vi.mocked(api.updateSharedAccess).mockResolvedValue([] as never)
    const wrapper = await mountModal({ instance })

    emitFromTable(wrapper, 'role-changed', tableUsers(wrapper)[0], 'custom')
    await flushPromises()
    expect(bodyQuery('[data-testid="share-custom-privileges"]')).not.toBeNull()
    expect(bodyQuery('[data-testid="share-modal"]')).toBeNull()

    document.body.querySelector<HTMLElement>('.v-expansion-panel-title')!.click()
    await flushPromises()
    document.body.querySelector<HTMLInputElement>('.v-expansion-panel-text .checkbox input')!.click()
    await flushPromises()
    bodyQuery('[data-testid="share-privileges-save"]')!.click()
    await flushPromises()
    expect(bodyQuery('[data-testid="share-modal"]')).not.toBeNull()

    bodyQuery('[data-testid="share-save"]')!.click()
    await flushPromises()
    expect(api.updateSharedAccess).toHaveBeenCalledWith(7, {
      users: [expect.objectContaining({ email: 'ann@example.com', role: 'custom', custom_privileges: ['general.manage_labels'] })],
    })
    wrapper.unmount()
  })

  it('closes like Cancel from the X of the card and from Esc, without a request', async () => {
    const instance = makeInstance(7, [entry('ann@example.com', 'view_only')])
    const wrapper = await mountModal({ instance })

    bodyQuery('[data-testid="share-remove-access"]')!.click()
    await flushPromises()
    bodyQuery('[data-testid="share-close"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:model-value')?.at(-1)).toEqual([false])
    expect(api.deleteSharedAccess).not.toHaveBeenCalled()

    const before = wrapper.emitted('update:model-value')!.length
    // Esc with a picker menu open only closes the menu; Esc otherwise cancels, wherever the focus is.
    const field = bodyQuery('[data-testid="share-role"] .v-field')!
    const expanded = field.getAttribute('aria-expanded')
    field.setAttribute('aria-expanded', 'true')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('update:model-value')!.length).toBe(before)

    field.setAttribute('aria-expanded', expanded ?? 'false')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('update:model-value')!.length).toBe(before + 1)
    wrapper.unmount()
  })

  it('escapes the project title in the dialog title (the kit card renders it as HTML)', async () => {
    i18next.addResource('en', 'translation', 'heading.instance.modal.sharedAccess.title.one', 'Share {{title}}')
    const instance = makeInstance(7, [], { title: '<img src=x onerror=alert(1)>' })
    const wrapper = await mountModal({ instance })

    expect(bodyQuery('[data-testid="share-title"] img')).toBeNull()
    expect(bodyQuery('[data-testid="share-title"]')!.textContent).toContain('Share <img src=x onerror=alert(1)>')
    i18next.removeResourceBundle('en', 'translation')
    wrapper.unmount()
  })
})
