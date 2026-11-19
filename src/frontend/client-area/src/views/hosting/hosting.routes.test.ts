import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { hostingRoutes } from './hosting.routes'

describe('hosting routes', () => {
  it('sends /hosting/summary to Usage on single-server before the Summary renders', () => {
    setActivePinia(createPinia())
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const summary = frame.children!.find(route => route.path === '/hosting/summary')!
    const enter = summary.beforeEnter as () => unknown

    expect(enter()).toBe(true)
    useSessionStore().hydrateHome({ app: { single_server: { active: true } } } as never)
    expect(enter()).toBe('/hosting/usage')
  })

  it('has /hosting/ftp as a child of the frame with the ftp title and a lazy view', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const ftp = frame.children!.find(route => route.path === '/hosting/ftp')!

    expect(ftp.name).toBe('hosting-ftp')
    expect(ftp.meta).toEqual({ title: 'ftp' })
    expect(typeof ftp.component).toBe('function')
  })

  it('has /hosting/sftp as a child of the frame with the sftp title and a lazy view', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const sftp = frame.children!.find(route => route.path === '/hosting/sftp')!

    expect(sftp.name).toBe('hosting-sftp')
    expect(sftp.meta).toEqual({ title: 'sftp' })
    expect(typeof sftp.component).toBe('function')
  })

  it('has /hosting/email-addresses as a child of the frame with the email-addresses title and a lazy view', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const emailAddresses = frame.children!.find(route => route.path === '/hosting/email-addresses')!

    expect(emailAddresses.name).toBe('hosting-email-addresses')
    expect(emailAddresses.meta).toEqual({ title: 'email-addresses' })
    expect(typeof emailAddresses.component).toBe('function')
  })

  it('has /hosting/email-forwarders as a child of the frame with the email-forwarders title and a lazy view', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const emailForwarders = frame.children!.find(route => route.path === '/hosting/email-forwarders')!

    expect(emailForwarders.name).toBe('hosting-email-forwarders')
    expect(emailForwarders.meta).toEqual({ title: 'email-forwarders' })
    expect(typeof emailForwarders.component).toBe('function')
  })

  it('has /hosting/containers as a child of the frame with the containers title and a lazy view', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const containers = frame.children!.find(route => route.path === '/hosting/containers')!

    expect(containers.name).toBe('hosting-containers')
    expect(containers.meta).toEqual({ title: 'containers' })
    expect(typeof containers.component).toBe('function')
  })

  it('has /hosting/dns as a child of the frame with the dns title and a lazy view', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const dns = frame.children!.find(route => route.path === '/hosting/dns')!

    expect(dns.name).toBe('hosting-dns')
    expect(dns.meta).toEqual({ title: 'dns' })
    expect(typeof dns.component).toBe('function')
  })

  it('keeps /hosting/email-addresses behind the login guard through the frame meta', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const emailAddresses = frame.children!.find(route => route.path === '/hosting/email-addresses')!

    expect(frame.meta).toMatchObject({ requiresAuth: true })
    expect(emailAddresses).toBeDefined()
  })
})

describe('hosting routes: email-forwarders login guard', () => {
  it('keeps /hosting/email-forwarders behind the login guard', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const emailForwarders = frame.children!.find(route => route.path === '/hosting/email-forwarders')!
    const matched = [frame, emailForwarders]

    expect(matched.some(record => record.meta?.requiresAuth === true)).toBe(true)
  })
})
