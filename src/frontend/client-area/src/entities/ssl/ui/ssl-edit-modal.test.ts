import { describe, expect, it } from 'vitest'
import { CUSTOM_PROVIDER, defaultProvider, indicatorSsl, installedIndicatorSsl, primaryLabelKey, providerOptions, sslSubmitAction } from './ssl-edit-modal'

describe('ssl-edit-modal', () => {
  it('lists the offers by name and the custom option last', () => {
    expect(providerOptions([{ id: 3, name: 'Let\'s Encrypt' }, { id: 'x', name: 'Paid' }], 'Custom')).toEqual([
      { label: 'Let\'s Encrypt', value: 3 },
      { label: 'Paid', value: 'x' },
      { label: 'Custom', value: CUSTOM_PROVIDER },
    ])
    expect(providerOptions([], 'Custom')).toEqual([{ label: 'Custom', value: CUSTOM_PROVIDER }])
  })

  it('selects the first offer, or custom without offers', () => {
    expect(defaultProvider([{ id: 7 }, { id: 8 }])).toBe(7)
    expect(defaultProvider([])).toBe(CUSTOM_PROVIDER)
  })

  it('labels the primary button by mode', () => {
    expect(primaryLabelKey({ isWpCloud: true, isCustom: true })).toBe('button.retry.ssl')
    expect(primaryLabelKey({ isWpCloud: false, isCustom: true })).toBe('button.install')
    expect(primaryLabelKey({ isWpCloud: false, isCustom: false })).toBe('button.generate')
  })

  it('picks the submit action; an order in flight blocks every mode', () => {
    expect(sslSubmitAction({ status: 'pending', isWpCloud: true, isCustom: false })).toBe('blocked')
    expect(sslSubmitAction({ status: 'awaiting_dns_propagation', isWpCloud: false, isCustom: true })).toBe('blocked')
    expect(sslSubmitAction({ status: 'failed', isWpCloud: true, isCustom: false })).toBe('retry')
    expect(sslSubmitAction({ status: 'none', isWpCloud: false, isCustom: true })).toBe('install')
    expect(sslSubmitAction({ status: 'none', isWpCloud: false, isCustom: false })).toBe('order')
  })

  it('shows any certificate as installed in the indicator', () => {
    expect(indicatorSsl({ self_signed: true })).toEqual({ certificate_installed: true, certificate: { self_signed: true } })
  })

  it('drops points_here from the installed certificate and keeps the rest, without changing the input', () => {
    const installed = { status: 'trusted', issuer_name: 'Let\'s Encrypt', points_here: false }
    expect(installedIndicatorSsl(installed)).toEqual({ certificate_installed: true, certificate: { status: 'trusted', issuer_name: 'Let\'s Encrypt' } })
    expect(installed.points_here).toBe(false)
    expect(installedIndicatorSsl(null)).toEqual({ certificate_installed: true, certificate: null })
  })
})
