import type { DomainActionsDeps } from './use-domain-actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDomainActions } from './use-domain-actions'

const account = { id: 11, ipv4_addresses: ['192.0.2.10'] }

function setup (overrides: Partial<DomainActionsDeps> = {}, service: Record<string, unknown> = {}) {
  const deps = {
    service: () => ({ id: 5, server_settings: {}, ...service }) as never,
    account: () => account as never,
    rows: () => [{ domain: 'example.com', type: 'main' }, { domain: 'blog.example.com', type: 'sub' }],
    supportedDomainTypes: () => ['addon', 'sub'],
    reload: vi.fn().mockResolvedValue(undefined),
    highlight: vi.fn(),
    addDomain: vi.fn().mockResolvedValue(undefined),
    updateDomain: vi.fn().mockResolvedValue(undefined),
    deleteDomain: vi.fn().mockResolvedValue(undefined),
    setPrimaryDomain: vi.fn().mockResolvedValue(undefined),
    verifyDomain: vi.fn().mockResolvedValue({ verification_required: false }),
    resetCertificateCache: vi.fn(),
    addSuccessAlert: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: vi.fn(() => 'boom'),
    t: (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key,
    ...overrides,
  } satisfies DomainActionsDeps
  return { deps, actions: useDomainActions(deps) }
}

const valid = async () => ({ valid: true })

describe('openAdd', () => {
  it('opens the dialog from the first type and parent', () => {
    const { actions } = setup()
    actions.openAdd()
    expect(actions.open.value).toBe(true)
    expect(actions.modal.value?.mode).toBe('add-domain')
    expect(actions.values).toMatchObject({ type: 'addon', parent_domain: 'example.com', target_domain: 'example.com' })
    expect(actions.showDnsOptions.value).toBe(true)
  })

  it('does nothing and does not throw without a parent domain', () => {
    const { actions } = setup({ rows: () => [] })
    expect(() => actions.openAdd()).not.toThrow()
    expect(actions.open.value).toBe(false)
    expect(actions.modal.value).toBeNull()
  })

  it('re-creates the modal on every open', () => {
    const { actions } = setup()
    actions.openAdd()
    const first = actions.render.value
    actions.openAdd()
    expect(actions.render.value).toBe(first + 1)
  })

  it('hides the live DnsOptions once the type is not addon', () => {
    const { actions } = setup()
    actions.openAdd()
    actions.values.type = 'sub'
    actions.onTypeChange('sub')
    expect(actions.showDnsOptions.value).toBe(false)
    expect(actions.fields.value[2]?.hidden).toBe(false)
  })
})

describe('submit', () => {
  beforeEach(() => undefined)

  it('does not send an invalid form', async () => {
    const { actions, deps } = setup()
    actions.openAdd()
    await actions.onButton('submit', async () => ({ valid: false }))
    expect(deps.addDomain).not.toHaveBeenCalled()
  })

  it('adds a subdomain with the parent appended, highlights it and reloads newest first', async () => {
    const { actions, deps } = setup()
    actions.openAdd()
    actions.values.type = 'sub'
    actions.values.domain = 'shop'
    await actions.onButton('submit', valid)
    expect(deps.addDomain).toHaveBeenCalledWith(11, { type: 'sub', domain: 'shop.example.com', parent_domain: 'example.com', target_domain: 'example.com' })
    expect(deps.highlight).toHaveBeenCalledWith('shop.example.com')
    expect(deps.resetCertificateCache).toHaveBeenCalledWith(11)
    expect(deps.reload).toHaveBeenCalledWith(true)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.hosting.domain.create.success:{"type":"form.label.subdomain"}')
    expect(actions.open.value).toBe(false)
    expect(actions.persistent.value).toBe(false)
  })

  it('switches the dialog to the DNS instructions after an addon', async () => {
    const { actions, deps } = setup({}, { dns_settings: { display_options: ['a_records'] } })
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.hosting.domain.create.success:{"type":"form.label.domain"}')
    expect(actions.open.value).toBe(true)
    expect(actions.modal.value).toMatchObject({ mode: 'dns-instructions', title: 'heading.instance.modal.setDomain.title', item: { domain: 'new.org', type: 'addon' } })
    expect(actions.modal.value?.buttons.map(button => button.id)).toEqual(['close'])
    expect(actions.showDnsOptions.value).toBe(true)
    expect(actions.dnsOptionsDomain.value).toBe('new.org')
    expect(actions.fields.value).toEqual([])
  })

  it.each([
    ['no dns settings', undefined],
    ['no display options', { display_options: [] }],
    ['only cname_record without an onboarding subdomain', { display_options: ['cname_record'] }],
  ])('closes the dialog after an addon when DnsOptions has nothing to show (%s)', async (_label, dnsSettings) => {
    const { actions, deps } = setup({}, dnsSettings ? { dns_settings: dnsSettings } : {})
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    expect(deps.addDomain).toHaveBeenCalledWith(11, expect.objectContaining({ type: 'addon', domain: 'new.org' }))
    expect(deps.highlight).toHaveBeenCalledWith('new.org')
    expect(deps.reload).toHaveBeenCalledWith(true)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.hosting.domain.create.success:{"type":"form.label.domain"}')
    expect(actions.open.value).toBe(false)
    expect(actions.modal.value?.mode).not.toBe('dns-instructions')
    expect(actions.persistent.value).toBe(false)
    expect(actions.submitting.value).toBe(false)
  })

  it.each([
    ['no IPv4 address', []],
    ['only a CIDR range', ['10.0.0.0/8']],
  ])('closes the dialog after an addon with A records when the account has %s', async (_label, ipv4) => {
    const { actions } = setup({ account: () => ({ id: 11, ipv4_addresses: ipv4 }) as never }, { dns_settings: { display_options: ['a_records'] } })
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    expect(actions.open.value).toBe(false)
    expect(actions.modal.value?.mode).not.toBe('dns-instructions')
  })

  it('decides with the account it captured before the request, not a later read', async () => {
    const account = vi.fn().mockReturnValueOnce({ id: 11, ipv4_addresses: ['192.0.2.10'] }).mockReturnValue(null)
    const { actions, deps } = setup({ account: account as never }, { dns_settings: { display_options: ['a_records'] } })
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    expect(deps.addDomain).toHaveBeenCalledWith(11, expect.anything())
    expect(actions.open.value).toBe(true)
    expect(actions.modal.value?.mode).toBe('dns-instructions')
  })

  it('keeps the dialog open and alerts on an error', async () => {
    const { actions, deps } = setup({ addDomain: vi.fn().mockRejectedValue(new Error('x')) })
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    expect(deps.addErrorAlert).toHaveBeenCalledWith('boom')
    expect(deps.reload).not.toHaveBeenCalled()
    expect(actions.open.value).toBe(true)
    expect(actions.modal.value?.mode).toBe('add-domain')
    expect(actions.persistent.value).toBe(false)
    expect(actions.submitting.value).toBe(false)
  })

  it('shows a 422 under the domain field, and drops it when the name changes', async () => {
    const refusal = { isAxiosError: true, response: { status: 422, data: { message: 'The domain field format is invalid.', errors: { domain: ['The domain field format is invalid.'] } } } }
    const { actions } = setup({ addDomain: vi.fn().mockRejectedValue(refusal), getErrorMessage: () => 'The domain field format is invalid.' })
    actions.openAdd()
    actions.values.domain = 'fx27nodot'
    await actions.onButton('submit', valid)
    const domainField = actions.fields.value.find(field => field.type === 'domain-input')
    expect(domainField).toMatchObject({ errorMessages: ['The domain field format is invalid.'] })

    actions.values.domain = 'fx27nodot.org'
    await vi.waitFor(() => expect(actions.fields.value.find(field => field.type === 'domain-input')).toMatchObject({ errorMessages: [] }))

    actions.values.domain = 'fx27nodot2'
    await actions.onButton('submit', valid)
    expect(actions.fields.value.find(field => field.type === 'domain-input')).toMatchObject({ errorMessages: ['The domain field format is invalid.'] })
    actions.openAdd()
    expect(actions.fields.value.find(field => field.type === 'domain-input')).toMatchObject({ errorMessages: [] })
  })

  it('keeps a server failure other than a refused answer a toast only', async () => {
    const { actions, deps } = setup({ addDomain: vi.fn().mockRejectedValue({ isAxiosError: true, response: { status: 500, data: { message: 'Server Error' } } }) })
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    expect(deps.getErrorMessage).toHaveBeenCalled()
    expect(deps.addErrorAlert).toHaveBeenCalledWith('boom')
    expect(actions.fields.value.find(field => field.type === 'domain-input')).toMatchObject({ errorMessages: [] })
  })

  it('is persistent while the request runs', async () => {
    let resolve = (): void => undefined
    const addDomain = vi.fn(async () => new Promise<void>(done => {
      resolve = done
    }))
    const { actions } = setup({ addDomain })
    actions.openAdd()
    actions.values.domain = 'new.org'
    const pending = actions.onButton('submit', valid)
    await Promise.resolve()
    await Promise.resolve()
    expect(actions.persistent.value).toBe(true)
    expect(actions.submitting.value).toBe(true)
    resolve()
    await pending
    expect(actions.persistent.value).toBe(false)
  })

  it('closes on cancel and close', async () => {
    const { actions } = setup()
    actions.openAdd()
    await actions.onButton('cancel', valid)
    expect(actions.open.value).toBe(false)
  })
})

describe('transfer check', () => {
  it('verifies first when the service allows transfers, then adds', async () => {
    const { actions, deps } = setup({}, { server_settings: { domain_transfer_allowed: true } })
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    expect(deps.verifyDomain).toHaveBeenCalledWith(5, 'new.org')
    await vi.waitFor(() => expect(deps.addDomain).toHaveBeenCalled())
  })

  it('hands over to the transfer when verification is required', async () => {
    const verifyDomain = vi.fn().mockResolvedValue({ verification_required: true, verification_record: { name: '_x' } })
    const { actions, deps } = setup({ verifyDomain }, { server_settings: { domain_transfer_allowed: true } })
    actions.openAdd()
    actions.values.type = 'sub'
    actions.values.domain = 'shop'
    await actions.onButton('submit', valid)
    expect(verifyDomain).toHaveBeenCalledWith(5, 'shop.example.com')
    expect(deps.addDomain).not.toHaveBeenCalled()
    expect(actions.open.value).toBe(false)
    expect(actions.transfer.open).toBe(true)
    expect(actions.transfer.domain.domain).toBe('shop.example.com')
    expect(actions.transfer.record).toEqual({ name: '_x' })
  })

  it('adds the kept values on Transfer now, a subdomain suffixed a second time, and leaves the transfer dialog open', async () => {
    const verifyDomain = vi.fn().mockResolvedValue({ verification_required: true, verification_record: { name: '_x' } })
    const { actions, deps } = setup({ verifyDomain }, { server_settings: { domain_transfer_allowed: true } })
    actions.openAdd()
    actions.values.type = 'sub'
    actions.values.domain = 'shop'
    await actions.onButton('submit', valid)
    await actions.transferDomain()
    expect(deps.addDomain).toHaveBeenCalledWith(11, expect.objectContaining({ type: 'sub', domain: 'shop.example.com.example.com' }))
    expect(actions.transfer.open).toBe(true)
  })

  it('sends the add once while a request is running, even when a second click verifies again', async () => {
    let resolve = (): void => undefined
    const addDomain = vi.fn<() => Promise<void>>()
      .mockImplementationOnce(async () => new Promise<void>(done => {
        resolve = done
      }))
      .mockResolvedValue(undefined)
    const { actions } = setup({ addDomain }, { server_settings: { domain_transfer_allowed: true } })
    actions.openAdd()
    actions.values.domain = 'new.org'

    const first = actions.onButton('submit', valid)
    await vi.waitFor(() => expect(addDomain).toHaveBeenCalledTimes(1))
    // The verify has cleared the flags, so the legacy button is active again and a second click goes through.
    await first
    await actions.onButton('submit', valid)
    await actions.transferDomain()
    expect(addDomain).toHaveBeenCalledTimes(1)

    resolve()
    await new Promise(done => setTimeout(done))
    await actions.transferDomain()
    expect(addDomain).toHaveBeenCalledTimes(2)
  })

  it('closes the transfer dialog', async () => {
    const verifyDomain = vi.fn().mockResolvedValue({ verification_required: true })
    const { actions } = setup({ verifyDomain }, { server_settings: { domain_transfer_allowed: true } })
    actions.openAdd()
    actions.values.domain = 'new.org'
    await actions.onButton('submit', valid)
    actions.closeTransfer()
    expect(actions.transfer.open).toBe(false)
  })
})

const row = {
  serverAccountId: 11,
  domain: 'shop.org',
  type: 'addon',
  type_text: 'Addon',
  document_root: '/public_html/shop',
  redirect_enabled: false,
  redirect_url: null,
  capabilities: { can_update_document_root: true, can_redirect: true },
} as never

describe('edit', () => {
  it('opens with the row as the start values and the fields of its capabilities', () => {
    const { actions } = setup()
    actions.openEdit(row)
    expect(actions.modal.value).toMatchObject({ mode: 'edit-domain', icon: '$edit' })
    expect(actions.values).toMatchObject({ domain: 'shop.org', document_root: '/public_html/shop' })
    expect(actions.fields.value.map(field => (field as { name: string }).name)).toEqual(['document_root', 'redirect_enabled', 'redirect_url'])
    expect(actions.fields.value[2]?.hidden).toBe(true)
    actions.values.redirect_enabled = true
    expect(actions.fields.value[2]?.hidden).toBe(false)
  })

  it('normalizes the redirect URL on blur', () => {
    const { actions } = setup()
    actions.openEdit(row)
    actions.values.redirect_url = 'target.com'
    actions.onFieldBlur('redirect_url')
    expect(actions.values.redirect_url).toBe('https://target.com')
  })

  it('does not send an invalid form', async () => {
    const { actions, deps } = setup()
    actions.openEdit(row)
    await actions.onButton('submit', async () => ({ valid: false }))
    expect(deps.updateDomain).not.toHaveBeenCalled()
  })

  it('puts the whole element, highlights it, reloads newest first and alerts', async () => {
    const { actions, deps } = setup()
    actions.openEdit(row)
    actions.values.document_root = '/public_html/new'
    await actions.onButton('submit', valid)
    expect(deps.updateDomain).toHaveBeenCalledWith(11, 'shop.org', expect.objectContaining({ domain: 'shop.org', type: 'addon', document_root: '/public_html/new' }))
    expect(deps.highlight).toHaveBeenCalledWith('shop.org')
    expect(deps.reload).toHaveBeenCalledWith(true)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.hosting.domain.update.success:{"type":"Addon"}')
    expect(actions.open.value).toBe(false)
  })

  it('keeps the dialog open and alerts on an error', async () => {
    const { actions, deps } = setup({ updateDomain: vi.fn().mockRejectedValue(new Error('x')) })
    actions.openEdit(row)
    await actions.onButton('submit', valid)
    expect(deps.addErrorAlert).toHaveBeenCalledWith('boom')
    expect(actions.modal.value?.alert).toBe('boom')
    expect(deps.reload).not.toHaveBeenCalled()
    expect(actions.open.value).toBe(true)
    expect(actions.persistent.value).toBe(false)
  })

  it('shows a refused redirect URL under its field, and drops it once the URL changes', async () => {
    const message = 'Enter the URL to redirect the domain to.'
    const refusal = { isAxiosError: true, response: { status: 422, data: { message, errors: { redirect_url: [message] } } } }
    const { actions, deps } = setup({ updateDomain: vi.fn().mockRejectedValue(refusal), getErrorMessage: () => message })
    const field = () => actions.fields.value.find(item => 'name' in item && item.name === 'redirect_url')

    actions.openEdit(row)
    actions.values.redirect_enabled = true
    await actions.onButton('submit', valid)

    expect(actions.open.value).toBe(true)
    expect(field()).toMatchObject({ errorMessages: [message] })
    expect(actions.modal.value?.alert).toBeUndefined()
    expect(deps.addErrorAlert).toHaveBeenCalledWith(message)

    actions.values.redirect_url = 'https://target.com'
    await vi.waitFor(() => expect(field()).toMatchObject({ errorMessages: [] }))
  })

  it('keeps a refusal of a name the dialog has no field for in the alert', async () => {
    const refusal = { isAxiosError: true, response: { status: 422, data: { errors: { aliases: ['Invalid alias domain name.'] } } } }
    const { actions, deps } = setup({ updateDomain: vi.fn().mockRejectedValue(refusal), getErrorMessage: () => 'Invalid alias domain name.' })
    actions.openEdit(row)
    await actions.onButton('submit', valid)
    expect(actions.modal.value?.alert).toBe('Invalid alias domain name.')
    expect(deps.addErrorAlert).toHaveBeenCalledWith('Invalid alias domain name.')
  })
})

describe('delete', () => {
  it('opens in error colour with the required confirm checkbox', () => {
    const { actions } = setup()
    actions.openDelete(row)
    expect(actions.modal.value).toMatchObject({ mode: 'delete-domain', color: 'error', icon: '$alertwarning', confirmRequired: true })
    expect(actions.fields.value).toMatchObject([{ type: 'checkbox', name: 'confirm', required: true, message: '<b>message.confirmAction</b>' }])
  })

  it('deletes on the account of the row, not the one the screen shows now', async () => {
    const { actions, deps } = setup()
    actions.openDelete({ ...(row as object), serverAccountId: 7 } as never)
    await actions.onButton('submit', valid)
    expect(deps.deleteDomain).toHaveBeenCalledWith(7, 'shop.org')
  })

  it('deletes, reloads without highlight and alerts', async () => {
    const { actions, deps } = setup()
    actions.openDelete(row)
    await actions.onButton('submit', valid)
    expect(deps.deleteDomain).toHaveBeenCalledWith(11, 'shop.org')
    expect(deps.highlight).not.toHaveBeenCalled()
    expect(deps.reload).toHaveBeenCalledWith()
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.hosting.domain.delete.success:{"type":"Addon"}')
    expect(actions.open.value).toBe(false)
  })

  it('alerts and stays open on an error', async () => {
    const { actions, deps } = setup({ deleteDomain: vi.fn().mockRejectedValue(new Error('x')) })
    actions.openDelete(row)
    await actions.onButton('submit', valid)
    expect(deps.addErrorAlert).toHaveBeenCalledWith('boom')
    expect(actions.modal.value?.alert).toBe('boom')
    expect(actions.open.value).toBe(true)
  })
})

describe('set as primary', () => {
  it('opens with the domain in the message', () => {
    const { actions } = setup()
    actions.openSetPrimary(row)
    expect(actions.modal.value).toMatchObject({
      mode: 'set-primary',
      icon: '$starFullIcon',
      message: 'heading.hosting.domains.modal.setAsPrimary.message:{"domain":"shop.org"}',
    })
    expect(actions.modal.value?.buttons[0]?.label).toBe('button.confirm')
    expect(actions.fields.value).toEqual([])
  })

  it('spells out the consequence on a project whose main domain is a PanelAlpha Online address', () => {
    const { actions } = setup({
      rows: () => [{ domain: 'site.panelalpha.online', type: 'main' }, { domain: 'shop.org', type: 'addon' }],
    })
    actions.openSetPrimary(row)
    expect(actions.modal.value?.message).toContain('heading.hosting.domains.modal.setAsPrimary.onlineWarning:{"domain":"site.panelalpha.online"}')
  })

  it('puts set-as-primary, reloads without highlight, alerts and guards unload while it runs', async () => {
    let resolve = (): void => undefined
    const setPrimaryDomain = vi.fn(async () => new Promise<void>(done => {
      resolve = done
    }))
    const refreshInstance = vi.fn()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { actions, deps } = setup({ setPrimaryDomain, refreshInstance })
    actions.openSetPrimary(row)
    const pending = actions.onButton('submit', valid)
    await Promise.resolve()
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    resolve()
    await pending
    expect(setPrimaryDomain).toHaveBeenCalledWith(11, 'shop.org')
    expect(deps.highlight).not.toHaveBeenCalled()
    expect(deps.reload).toHaveBeenCalledWith()
    expect(refreshInstance).toHaveBeenCalledTimes(1)
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.hosting.domain.setAsPrimaryDomain.success:{"domain":"shop.org"}')
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    expect(actions.open.value).toBe(false)
    add.mockRestore()
    remove.mockRestore()
  })

  it('refreshes no instance on a refused switch', async () => {
    const refreshInstance = vi.fn()
    const { actions, deps } = setup({ setPrimaryDomain: vi.fn().mockRejectedValue(new Error('x')), refreshInstance })
    actions.openSetPrimary(row)
    await actions.onButton('submit', valid)
    expect(deps.addErrorAlert).toHaveBeenCalledWith('boom')
    expect(refreshInstance).not.toHaveBeenCalled()
  })

  it('says in the dialog why the switch was refused, and swaps the answer on a retry', async () => {
    const setPrimaryDomain = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValue(new Error('second'))
    const { actions, deps } = setup({ setPrimaryDomain })
    deps.getErrorMessage.mockReturnValueOnce('Cannot delete domain with existing subdomains').mockReturnValue('Invalid document root directory.')
    actions.openSetPrimary(row)
    await actions.onButton('submit', valid)
    expect(actions.open.value).toBe(true)
    expect(actions.modal.value?.alert).toBe('Cannot delete domain with existing subdomains')

    // The next attempt drops the previous answer while it asks again, then reports its own.
    const pending = actions.onButton('submit', valid)
    expect(actions.modal.value?.alert).toBeUndefined()
    await pending
    expect(actions.open.value).toBe(true)
    expect(actions.modal.value?.alert).toBe('Invalid document root directory.')
  })
})
