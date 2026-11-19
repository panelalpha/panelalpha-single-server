import { describe, expect, it } from 'vitest'
import { createInstancePrivilegeMethods } from '@/entities/privileges/instance-privilege-methods'
import { PRIVILEGES as P } from '@/entities/privileges/privileges'
import {
  ADVANCED_HOSTING_SECTIONS,
  type AdvancedHostingSource,
  hiddenHostingSectionRedirect,
  HOSTING_SECTION_DEFINITIONS,
  isAdvancedHostingSectionVisible,
} from './advanced-hosting-sections'

// The privilege methods are the real ones: they read `privileges` through `this`, as on the resource.
function source (privileges: string[], isContainer = false): AdvancedHostingSource {
  return { ...createInstancePrivilegeMethods('wordpress'), privileges, isContainer } as unknown as AdvancedHostingSource
}

describe('HOSTING_SECTION_DEFINITIONS', () => {
  it('keeps the legacy order and the title keys', () => {
    expect(HOSTING_SECTION_DEFINITIONS.map(s => s.key)).toEqual(['file-manager', 'domains', 'ftp', 'sftp', 'databases', 'cron', 'containers'])
    expect(HOSTING_SECTION_DEFINITIONS.find(s => s.key === 'ftp')?.titleKey).toBe('heading.hosting.ftp.title')
  })

  it('shows databases with either the MySQL or the phpMyAdmin SSO privilege', () => {
    const databases = HOSTING_SECTION_DEFINITIONS.find(s => s.key === 'databases')
    expect(databases?.visible(source([P.MANAGE_MYSQL]))).toBe(true)
    expect(databases?.visible(source([P.PHPMYADMIN_SSO]))).toBe(true)
    expect(databases?.visible(source([]))).toBe(false)
  })
})

describe('ADVANCED_HOSTING_SECTIONS', () => {
  it('holds only the shipped sections', () => {
    expect(ADVANCED_HOSTING_SECTIONS.map(s => s.key)).toEqual(['file-manager', 'domains', 'ftp', 'sftp', 'databases', 'cron', 'containers'])
  })
})

describe('isAdvancedHostingSectionVisible', () => {
  it('is true for a shipped section with the privilege on single-server', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_FTP]), true, 'ftp')).toBe(true)
  })

  it('is false on multi-server', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_FTP]), false, 'ftp')).toBe(false)
  })

  it('is false without the privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([]), true, 'ftp')).toBe(false)
  })

  it('shows databases on single-server with MANAGE_MYSQL or PHPMYADMIN_SSO alone, not without both or on multi-server', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_MYSQL]), true, 'databases')).toBe(true)
    expect(isAdvancedHostingSectionVisible(source([P.PHPMYADMIN_SSO]), true, 'databases')).toBe(true)
    expect(isAdvancedHostingSectionVisible(source([]), true, 'databases')).toBe(false)
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_MYSQL, P.PHPMYADMIN_SSO]), false, 'databases')).toBe(false)
  })

  it('is false for a section not shipped yet, even with its privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_FTP]), true, 'unknown')).toBe(false)
  })
})

describe('isAdvancedHostingSectionVisible file-manager', () => {
  it('is true only on single-server with the file manager privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_FILE_MANAGER]), true, 'file-manager')).toBe(true)
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_FILE_MANAGER]), false, 'file-manager')).toBe(false)
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_FTP]), true, 'file-manager')).toBe(false)
  })
})

describe('cron section', () => {
  it('is visible on single-server with the cron privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_CRON]), true, 'cron')).toBe(true)
  })

  it('is hidden on multi-server and without the privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_CRON]), false, 'cron')).toBe(false)
    expect(isAdvancedHostingSectionVisible(source([]), true, 'cron')).toBe(false)
  })

  it('redirects a hidden cron section to Details and keeps a visible one', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/cron', '7', 'cron', source([]), true)).toBe('/projects/7/advanced/details')
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/cron', '7', 'cron', source([P.MANAGE_CRON]), true)).toBeNull()
  })
})

describe('isAdvancedHostingSectionVisible: sftp', () => {
  it('is true on single-server with manage_sftp and false without it', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_SFTP]), true, 'sftp')).toBe(true)
    expect(isAdvancedHostingSectionVisible(source([]), true, 'sftp')).toBe(false)
  })
})

describe('domains section', () => {
  it('is visible on single-server with the manage_domains privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_DOMAINS]), true, 'domains')).toBe(true)
  })

  it('is hidden on multi-server or without the privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_DOMAINS]), false, 'domains')).toBe(false)
    expect(isAdvancedHostingSectionVisible(source([]), true, 'domains')).toBe(false)
  })

  it('redirects a hidden domains section to Details and keeps a visible one', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/domains', '7', 'domains', source([]), true)).toBe('/projects/7/advanced/details')
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/domains', '7', 'domains', source([P.MANAGE_DOMAINS]), false)).toBe('/projects/7/advanced/details')
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/domains', '7', 'domains', source([P.MANAGE_DOMAINS]), true)).toBeNull()
  })
})

describe('containers section', () => {
  it('is visible on single-server with the privilege and isContainer', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_CONTAINERS], true), true, 'containers')).toBe(true)
  })

  it('is hidden with only the privilege', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_CONTAINERS], false), true, 'containers')).toBe(false)
  })

  it('is hidden with only isContainer', () => {
    expect(isAdvancedHostingSectionVisible(source([], true), true, 'containers')).toBe(false)
  })

  it('is hidden on multi-server', () => {
    expect(isAdvancedHostingSectionVisible(source([P.MANAGE_CONTAINERS], true), false, 'containers')).toBe(false)
  })

  it('redirects a hidden containers section to Details under /projects and /instances', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/containers', '7', 'containers', source([]), true)).toBe('/projects/7/advanced/details')
    expect(hiddenHostingSectionRedirect('/instances/7/advanced/containers', '7', 'containers', source([P.MANAGE_CONTAINERS]), true)).toBe('/instances/7/advanced/details')
  })
})

describe('hiddenHostingSectionRedirect', () => {
  it('redirects a hidden section to Details under /projects', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/ftp', '7', 'ftp', source([]), true)).toBe('/projects/7/advanced/details')
  })

  it('redirects a hidden section to Details under /instances', () => {
    expect(hiddenHostingSectionRedirect('/instances/7/advanced/ftp', '7', 'ftp', source([]), true)).toBe('/instances/7/advanced/details')
  })

  it('redirects a hidden databases section to Details', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/databases', '7', 'databases', source([]), true)).toBe('/projects/7/advanced/details')
  })

  it('redirects on multi-server', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/ftp', '7', 'ftp', source([P.MANAGE_FTP]), false)).toBe('/projects/7/advanced/details')
  })

  it('does not redirect a visible section', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/ftp', '7', 'ftp', source([P.MANAGE_FTP]), true)).toBeNull()
  })

  it('redirects a hidden file-manager section to Details', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/file-manager', '7', 'file-manager', source([]), true)).toBe('/projects/7/advanced/details')
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/file-manager', '7', 'file-manager', source([P.MANAGE_FILE_MANAGER]), false)).toBe('/projects/7/advanced/details')
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/file-manager', '7', 'file-manager', source([P.MANAGE_FILE_MANAGER]), true)).toBeNull()
  })

  it('does not redirect a route without a section', () => {
    expect(hiddenHostingSectionRedirect('/projects/7/advanced/details', '7', undefined, source([]), true)).toBeNull()
  })
})
