import { describe, expect, it } from 'vitest'
import {
  deleteDomainButtons,
  deleteDomainFields,
  editDomainFields,
  editDomainRefusal,
  editDomainTitle,
  normalizeRedirectUrl,
  setPrimaryMessage,
  updatePayload,
} from './row-actions'

const t = (key: string, options?: Record<string, unknown>): string => options ? `${key}:${JSON.stringify(options)}` : key

type Rule = (value: unknown) => true | string

function names (fields: ReturnType<typeof editDomainFields>): string[] {
  return fields.map(field => (field as { name: string }).name)
}

describe('editDomainFields', () => {
  it('offers the document root and the redirect by capabilities', () => {
    expect(editDomainFields({ capabilities: {} }, t)).toEqual([])
    expect(names(editDomainFields({ capabilities: { can_update_document_root: true } }, t))).toEqual(['document_root'])
    expect(names(editDomainFields({ capabilities: { can_redirect: true } }, t))).toEqual(['redirect_enabled', 'redirect_url'])
  })

  it('shows the redirect URL only while the redirect is enabled', () => {
    const row = { capabilities: { can_redirect: true }, redirect_enabled: true }
    expect(editDomainFields(row, t)[1]?.hidden).toBe(false)
    expect(editDomainFields({ ...row, redirect_enabled: false }, t)[1]?.hidden).toBe(true)
    expect(editDomainFields({ ...row, redirect_enabled: false }, t, true)[1]?.hidden).toBe(false)
  })

  it('requires the document root, up to 255 characters', () => {
    const rules = (editDomainFields({ capabilities: { can_update_document_root: true } }, t)[0] as unknown as { rules: Rule[] }).rules
    expect(rules[0]!('')).toContain('form.validation.required')
    expect(rules[0]!('/a')).toBe(true)
    expect(rules[1]!('a'.repeat(256))).toContain('form.validation.maxLength')
    expect(rules[1]!('a'.repeat(255))).toBe(true)
  })

  it('shows a refused request under the field it names', () => {
    const row = { capabilities: { can_update_document_root: true, can_redirect: true }, redirect_enabled: true }
    const message = 'Enter the URL to redirect the domain to.'
    const fields = editDomainFields(row, t, true, { redirect_url: [message] })
    expect(fields[2]).toMatchObject({ name: 'redirect_url', errorMessages: [message] })
    expect(fields[0]).toMatchObject({ name: 'document_root', errorMessages: [] })
    expect(editDomainFields(row, t, true)[2]).toMatchObject({ errorMessages: [] })
  })
})

describe('editDomainRefusal', () => {
  const refused = (status: number, data: Record<string, unknown>) => ({ isAxiosError: true, response: { status, data } })
  const message = 'Enter the URL to redirect the domain to.'

  it('puts a 422 under the field it names, with no message left for the alert', () => {
    expect(editDomainRefusal(refused(422, { errors: { redirect_url: [message] } })))
      .toEqual({ fields: { redirect_url: [message] }, message: '' })
  })

  it('keeps what names a field the dialog has no field for', () => {
    const refusal = editDomainRefusal(refused(422, {
      errors: { redirect_url: [message], aliases: ['Domain alias shop.example.com is not available'] },
    }))
    expect(refusal).toEqual({ fields: { redirect_url: [message] }, message: 'Domain alias shop.example.com is not available' })
  })

  it('is no refusal when nothing names a field of the dialog', () => {
    expect(editDomainRefusal(refused(422, { errors: { aliases: ['Invalid alias domain name.'] } }))).toBeNull()
    expect(editDomainRefusal(refused(422, { errors: {} }))).toBeNull()
    expect(editDomainRefusal(refused(500, { errors: { redirect_url: [message] } }))).toBeNull()
    expect(editDomainRefusal(new Error('boom'))).toBeNull()
  })
})

describe('editDomainTitle', () => {
  it('puts the domain in a span that breaks only a domain longer than the line', () => {
    expect(editDomainTitle('a.com', t)).toContain('text-break-long')
    expect(editDomainTitle('a.com', t)).toContain('a.com</span>')
  })
})

describe('normalizeRedirectUrl', () => {
  it('turns an empty value into https://', () => {
    expect(normalizeRedirectUrl('')).toBe('https://')
    expect(normalizeRedirectUrl(' '.repeat(3))).toBe('https://')
    expect(normalizeRedirectUrl(null)).toBe('https://')
  })

  it('adds https:// when the protocol is missing and keeps http(s)://', () => {
    expect(normalizeRedirectUrl('example.com')).toBe('https://example.com')
    // eslint-disable-next-line unicorn/prefer-https
    expect(normalizeRedirectUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeRedirectUrl('HTTPS://example.com')).toBe('HTTPS://example.com')
  })
})

describe('updatePayload', () => {
  it('sends the whole element with the edited fields over it', () => {
    const row = { domain: 'a.com', type: 'addon', document_root: '/a', capabilities: {} } as never
    expect(updatePayload(row, { document_root: '/b', redirect_enabled: true })).toEqual({
      domain: 'a.com',
      type: 'addon',
      document_root: '/b',
      capabilities: {},
      redirect_enabled: true,
    })
  })
})

describe('delete and set as primary', () => {
  it('asks for a required confirm checkbox and offers an error submit', () => {
    expect(deleteDomainFields(t)).toEqual([{
      message: '<b>message.confirmAction</b>',
      label: 'form.confirmDelete.domain',
      name: 'confirm',
      type: 'checkbox',
      required: true,
    }])
    expect(deleteDomainButtons(t)[0]).toMatchObject({ id: 'submit', color: 'error', label: 'button.delete' })
  })

  it('puts the domain in the message', () => {
    expect(setPrimaryMessage('a.com', t)).toContain('"domain":"a.com"')
  })

  it('spells out what happens to a PanelAlpha Online main domain', () => {
    expect(setPrimaryMessage('shop.org', t, 'site.panelalpha.online')).toContain('heading.hosting.domains.modal.setAsPrimary.onlineWarning:{"domain":"site.panelalpha.online"}')
    expect(setPrimaryMessage('shop.org', t, 'main.example.com')).not.toContain('onlineWarning')
    expect(setPrimaryMessage('shop.org', t)).not.toContain('onlineWarning')
  })
})
