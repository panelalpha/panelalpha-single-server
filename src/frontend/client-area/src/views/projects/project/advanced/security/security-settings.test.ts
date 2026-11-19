import { describe, expect, it } from 'vitest'
import { clientSslInfoFromCertificate, otherSharedInstances, sharedDomainMessage } from './security-settings'

describe('clientSslInfoFromCertificate', () => {
  it('shows a certificate as installed', () => {
    const certificate = { issuer_name: 'Let\'s Encrypt', self_signed: false, name_match: true }

    expect(clientSslInfoFromCertificate(certificate)).toEqual({ certificate, certificate_installed: true })
  })

  it('shows a certificate without an issuer as installed too, as legacy does for any answer', () => {
    const certificate = { self_signed: true }

    expect(clientSslInfoFromCertificate(certificate)).toEqual({ certificate, certificate_installed: true })
  })

  it('shows no certificate as not installed', () => {
    expect(clientSslInfoFromCertificate(null)).toEqual({ certificate: null, certificate_installed: false })
  })
})

describe('otherSharedInstances', () => {
  const settings = {
    domain_shared_instances: [
      { id: 1, name: 'Shop', url: 'https://shop.example.com' },
      { id: 2, name: 'Blog', url: 'https://blog.example.com' },
    ],
  }

  it('lists the other instances on the domain, without the page\'s own instance', () => {
    expect(otherSharedInstances(settings, 1)).toEqual(['Blog (https://blog.example.com)'])
  })

  it('drops the page\'s own instance when the API sends its id as a string, as the loose legacy comparison does', () => {
    const withStringId = {
      domain_shared_instances: [
        { id: '1' as unknown as number, name: 'Shop', url: 'https://shop.example.com' },
        { id: 2, name: 'Blog', url: 'https://blog.example.com' },
      ],
    }

    expect(otherSharedInstances(withStringId, 1)).toEqual(['Blog (https://blog.example.com)'])
  })

  it('returns an empty list when the API sends no shared instances', () => {
    expect(otherSharedInstances({}, 1)).toEqual([])
  })
})

describe('sharedDomainMessage', () => {
  it('puts the translated info before a list of the instances', () => {
    expect(sharedDomainMessage('Info.', ['Blog (https://blog.example.com)'])).toBe('Info.<ul><li>Blog (https://blog.example.com)</li></ul>')
  })

  it('escapes names and URLs, so they cannot inject markup', () => {
    const message = sharedDomainMessage('Info.', ['<img src=x onerror=alert(1)> & "Shop" (https://a.example.com/?x=1&y=2)'])

    expect(message).toBe('Info.<ul><li>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Shop&quot; (https://a.example.com/?x=1&amp;y=2)</li></ul>')
  })
})
