import { describe, expect, it } from 'vitest'
import {
  isSslInstalledEventFor,
  orderStatusAfterSslEvent,
  sslBlockState,
  sslInfoFromCertificate,
} from './security-ssl'

const installed = { issuer_name: 'Let\'s Encrypt', self_signed: false, name_match: true }

describe('sslInfoFromCertificate', () => {
  it('keeps the previous status when the server answers with nothing', () => {
    expect(sslInfoFromCertificate(null)).toBeNull()
    expect(sslInfoFromCertificate(undefined)).toBeNull()
  })

  it('shows a certificate with an issuer as installed', () => {
    expect(sslInfoFromCertificate(installed)).toEqual({ certificate_installed: true, certificate: installed })
  })

  it('shows a certificate without an issuer as not installed, with no certificate', () => {
    expect(sslInfoFromCertificate({ self_signed: true })).toEqual({ certificate_installed: false, certificate: null })
  })
})

describe('sslBlockState', () => {
  const none = { certificate_installed: false }
  const secured = { certificate_installed: true, certificate: installed }

  it('shows the loader while the certificate is fetched', () => {
    expect(sslBlockState({ fetching: true, orderStatus: 'pending', sslInfo: none })).toBe('loading')
  })

  it('shows the pending indicator for an order in flight without a valid certificate', () => {
    expect(sslBlockState({ fetching: false, orderStatus: 'pending', sslInfo: none })).toBe('pending')
    expect(sslBlockState({ fetching: false, orderStatus: 'failed', sslInfo: none })).toBe('pending')
  })

  it('shows the certificate indicator behind a valid certificate, whatever the order says', () => {
    expect(sslBlockState({ fetching: false, orderStatus: 'pending', sslInfo: secured })).toBe('indicator')
  })

  it('shows the certificate indicator when there is no order', () => {
    expect(sslBlockState({ fetching: false, orderStatus: 'none', sslInfo: none })).toBe('indicator')
    expect(sslBlockState({ fetching: false, orderStatus: null, sslInfo: secured })).toBe('indicator')
  })
})

describe('isSslInstalledEventFor (ssl-certificate-installed handler)', () => {
  it('refreshes the block only for the page\'s own instance', () => {
    expect(isSslInstalledEventFor({ id: 42 }, 42)).toBe(true)
    expect(isSslInstalledEventFor({ id: 7 }, 42)).toBe(false)
  })

  it('ignores an event without a payload', () => {
    expect(isSslInstalledEventFor(undefined, 42)).toBe(false)
  })
})

describe('orderStatusAfterSslEvent', () => {
  it('clears the order after an install and marks it pending after an order', () => {
    expect(orderStatusAfterSslEvent('installed')).toBe('none')
    expect(orderStatusAfterSslEvent('ordered')).toBe('pending')
  })
})
