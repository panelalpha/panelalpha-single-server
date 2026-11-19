import { describe, expect, it } from 'vitest'
import { canOpenSslFromCell, sslCell, sslEditTooltip, visibleActions } from './domains-actions'

const manage = { privileges: ['hosting.manage_ssl'] }
const noPrivileges = { privileges: [] }

function row (overrides: Record<string, unknown> = {}) {
  return { type: 'addon', ssl_order_status: 'none', capabilities: {}, ...overrides } as never
}

describe('visibleActions', () => {
  it('shows nothing for a row without capabilities (and delete for a non-main row)', () => {
    expect(visibleActions(row(), noPrivileges, { mobile: false })).toEqual({
      star: { visible: false, disabled: false, icon: '$starEmptyIcon' },
      ssl: { visible: false, disabled: false },
      edit: { visible: false },
      delete: { visible: true },
    })
  })

  it('shows the star of a main domain full and disabled, and no delete', () => {
    const view = visibleActions(row({ type: 'main', capabilities: { can_set_as_primary: true } }), manage, { mobile: false })

    expect(view.star).toEqual({ visible: true, disabled: true, icon: '$starFullPremiumIcon' })
    expect(view.delete.visible).toBe(false)
  })

  it('needs the capability and the privilege for the SSL button on desktop', () => {
    expect(visibleActions(row({ capabilities: { can_manage_ssl: true } }), manage, { mobile: false }).ssl.visible).toBe(true)
    expect(visibleActions(row({ capabilities: { can_manage_ssl: true } }), noPrivileges, { mobile: false }).ssl.visible).toBe(false)
    expect(visibleActions(row({ capabilities: { can_manage_ssl: false } }), manage, { mobile: false }).ssl.visible).toBe(false)
  })

  it('checks only the privilege on mobile (legacy quirk)', () => {
    expect(visibleActions(row({ capabilities: { can_manage_ssl: false } }), manage, { mobile: true }).ssl.visible).toBe(true)
    expect(visibleActions(row({ capabilities: { can_manage_ssl: true } }), noPrivileges, { mobile: true }).ssl.visible).toBe(false)
  })

  it('disables the SSL button while an order is in flight', () => {
    for (const status of ['pending', 'in_progress', 'awaiting_dns_propagation']) {
      expect(visibleActions(row({ ssl_order_status: status }), manage, { mobile: false }).ssl.disabled).toBe(true)
    }
    expect(visibleActions(row({ ssl_order_status: 'failed' }), manage, { mobile: false }).ssl.disabled).toBe(false)
  })

  it('shows edit with either the redirect or the document root capability', () => {
    expect(visibleActions(row({ capabilities: { can_redirect: true } }), manage, { mobile: false }).edit.visible).toBe(true)
    expect(visibleActions(row({ capabilities: { can_update_document_root: true } }), manage, { mobile: false }).edit.visible).toBe(true)
    expect(visibleActions(row({ capabilities: { can_redirect: false, can_update_document_root: false } }), manage, { mobile: false }).edit.visible).toBe(false)
  })

  it('lets a wp-cloud row (aliases) show the star by capability on any type', () => {
    const view = visibleActions(row({ type: 'alias', capabilities: { can_set_as_primary: true } }), manage, { mobile: false })

    expect(view.star).toEqual({ visible: true, disabled: false, icon: '$starEmptyIcon' })
  })
})

describe('sslCell', () => {
  const valid = { self_signed: false, name_match: true, issuer_name: 'Lets Encrypt' }

  it('is a spinner while the certificates load', () => {
    expect(sslCell(row({ sslStatusLoading: true, ssl_order_status: 'pending', sslDetectedCert: null })).kind).toBe('loading')
  })

  it('is green for a valid certificate and shows the issuer', () => {
    expect(sslCell(row({ sslStatusLoading: false, sslDetectedCert: valid }))).toEqual({
      kind: 'indicator',
      ssl: { certificate_installed: true, certificate: valid },
      text: { kind: 'issuer', value: 'Lets Encrypt' },
      textClass: 'text-success',
    })
  })

  it('is red and says self signed for a self-signed certificate', () => {
    const view = sslCell(row({ sslStatusLoading: false, sslDetectedCert: { self_signed: true, name_match: true } }))

    expect(view.text).toEqual({ kind: 'key', key: 'general.sslProvider.selfSigned' })
    expect(view.textClass).toBe('text-error')
  })

  it('is red for a certificate of another name', () => {
    expect(sslCell(row({ sslStatusLoading: false, sslDetectedCert: { self_signed: false, name_match: false, issuer_name: 'CA' } })).textClass).toBe('text-error')
  })

  it('says no SSL, in red, without a certificate', () => {
    expect(sslCell(row({ sslStatusLoading: false, sslDetectedCert: null }))).toEqual({
      kind: 'indicator',
      ssl: { certificate_installed: false, certificate: {} },
      text: { kind: 'key', key: 'general.sslProvider.none' },
      textClass: 'text-error',
    })
  })

  it('is red for an expired certificate and keeps the issuer text', () => {
    const view = sslCell(row({ sslStatusLoading: false, sslDetectedCert: { status: 'expired', self_signed: false, name_match: true, issuer_name: 'Lets Encrypt' } }))

    expect(view.text).toEqual({ kind: 'issuer', value: 'Lets Encrypt' })
    expect(view.textClass).toBe('text-error')
  })

  it('follows the verdict over the name match: trusted stays green (lite)', () => {
    expect(sslCell(row({ sslStatusLoading: false, sslDetectedCert: { status: 'trusted', self_signed: false, name_match: false, issuer_name: 'CA' } })).textClass).toBe('text-success')
  })

  it('shows the order status behind an expired certificate (lite)', () => {
    expect(sslCell(row({ sslStatusLoading: false, ssl_order_status: 'pending', sslDetectedCert: { status: 'expired', issuer_name: 'CA' } })).kind).toBe('pending')
  })

  it('shows the order status without a valid certificate and hides it behind one (lite)', () => {
    expect(sslCell(row({ sslStatusLoading: false, ssl_order_status: 'pending', sslDetectedCert: null })).kind).toBe('pending')
    expect(sslCell(row({ sslStatusLoading: false, ssl_order_status: 'failed', sslDetectedCert: { self_signed: true, name_match: true } })).kind).toBe('pending')
    expect(sslCell(row({ sslStatusLoading: false, ssl_order_status: 'pending', sslDetectedCert: valid })).kind).toBe('indicator')
  })
})

describe('canOpenSslFromCell', () => {
  it('opens only with the capability and without an order in flight', () => {
    expect(canOpenSslFromCell(row({ capabilities: { can_manage_ssl: true } }))).toBe(true)
    expect(canOpenSslFromCell(row({ capabilities: { can_manage_ssl: false } }))).toBe(false)
    expect(canOpenSslFromCell(row({ capabilities: { can_manage_ssl: true }, ssl_order_status: 'pending' }))).toBe(false)
  })
})

describe('visibleActions on a wp-cloud service', () => {
  const wpCloudCapabilities = { can_update_document_root: false, can_redirect: false, can_set_as_primary: true, can_manage_ssl: true }

  it('follows the capabilities: a star on every alias, no edit', () => {
    const alias = visibleActions(row({ type: 'alias', capabilities: wpCloudCapabilities }), manage, { mobile: false })

    expect(alias.star).toEqual({ visible: true, disabled: false, icon: '$starEmptyIcon' })
    expect(alias.edit.visible).toBe(false)
    expect(alias.ssl.visible).toBe(true)
  })

  it('keeps the main (primary) star full and disabled', () => {
    const main = visibleActions(row({ type: 'main', capabilities: wpCloudCapabilities }), manage, { mobile: false })

    expect(main.star).toEqual({ visible: true, disabled: true, icon: '$starFullPremiumIcon' })
  })
})

describe('sslEditTooltip', () => {
  const t = (key: string) => (key === 'tooltip.hosting.dns.status.pending.alert' ? 'Order for {domain} pending' : 'Edit SSL')

  it('names the domain while an order blocks the button', () => {
    expect(sslEditTooltip({ ssl_order_status: 'pending', domain: 'a.test' }, t)).toBe('Order for a.test pending')
    expect(sslEditTooltip({ ssl_order_status: 'none', domain: 'a.test' }, t)).toBe('Edit SSL')
  })
})

describe('sslCell points_here (the domain points to another server)', () => {
  it('shows Wrong DNS in warning colour instead of the issuer for a trusted certificate', () => {
    const view = sslCell(row({ sslStatusLoading: false, sslDetectedCert: { status: 'trusted', self_signed: false, name_match: true, issuer_name: 'Lets Encrypt', points_here: false } }))

    expect(view.text).toEqual({ kind: 'key', key: 'message.status.wrongDns' })
    expect(view.textClass).toBe('text-warning')
    expect(view.ssl.certificate).toMatchObject({ points_here: false })
  })

  it('shows Wrong DNS for a self-signed certificate that points elsewhere', () => {
    const view = sslCell(row({ sslStatusLoading: false, sslDetectedCert: { self_signed: true, name_match: true, points_here: false } }))

    expect(view.text).toEqual({ kind: 'key', key: 'message.status.wrongDns' })
    expect(view.textClass).toBe('text-warning')
  })

  it('keeps the issuer and green for a trusted certificate with points_here null', () => {
    const view = sslCell(row({ sslStatusLoading: false, sslDetectedCert: { status: 'trusted', self_signed: false, name_match: true, issuer_name: 'Lets Encrypt', points_here: null } }))

    expect(view.text).toEqual({ kind: 'issuer', value: 'Lets Encrypt' })
    expect(view.textClass).toBe('text-success')
  })
})
