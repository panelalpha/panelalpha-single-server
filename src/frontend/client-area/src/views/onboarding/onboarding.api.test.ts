import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import {
  connectGitSsh,
  createDeployKey,
  createFilesDomain,
  createImportDomain,
  createServiceDomain,
  deleteDeployKeyProject,
  deployGitSsh,
  deployInstance,
  getCloneInstances,
  getEnvExampleSsh,
  getGitBranches,
  getGitBranchesSsh,
  getRecommendedThemes,
  getServiceDomains,
  getThemeCategories,
  getThemes,
  getThemesFromCategory,
  getWordpressTemplates,
  getWordpressUrlTest,
  getWordpressVersions,
  importInstance,
  installServiceInstance,
  listServiceDomains,
  previewEnvExample,
  serviceDomainsQuery,
  testGitUrl,
  testWordpressConnection,
  themeListQuery,
  themeScreenshotUrl,
  themesQuery,
  uploadDeployFile,
  validateServiceDomain,
  wordpressVersionOptions,
} from './onboarding.api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('themesQuery', () => {
  it('sends page, per_page, browse in legacy order', () => {
    expect(themesQuery({ page: 1, browse: 'popular' })).toBe('page=1&per_page=12&browse=popular')
  })

  it('adds search_term only when there is one and service_id when a service is selected', () => {
    expect(themesQuery({ page: 2, browse: 'new', searchTerm: 'shop', serviceId: 10 }))
      .toBe('page=2&per_page=12&browse=new&search_term=shop&service_id=10')
  })

  it('omits an empty search term and a missing service', () => {
    expect(themesQuery({ page: 1, browse: 'popular', searchTerm: '', serviceId: null })).toBe('page=1&per_page=12&browse=popular')
  })
})

describe('themeListQuery', () => {
  it('is the category and recommended query: never a search term', () => {
    expect(themeListQuery(3)).toBe('page=3&per_page=12&sort_by=id&sort_dir=asc')
  })
})

describe('themeScreenshotUrl', () => {
  it('points at the API screenshot route, not at /projects', () => {
    const url = themeScreenshotUrl(42)
    expect(url).toMatch(/\/instances\/onboarding\/theme\/42\/screenshot$/)
    expect(url).not.toContain('/projects/')
  })
})

describe('onboarding theme requests', () => {
  it('getThemes requests /instances/onboarding/themes with the built query', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], meta: { total: 0 } } })
    await getThemes({ page: 1, browse: 'popular', serviceId: 7 })
    expect(spy).toHaveBeenCalledWith('/instances/onboarding/themes?page=1&per_page=12&browse=popular&service_id=7')
  })

  it('getThemesFromCategory requests the category path with the sort query', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], meta: { total: 0 } } })
    await getThemesFromCategory(5, 2)
    expect(spy).toHaveBeenCalledWith('/instances/onboarding/5/themes-from-category?page=2&per_page=12&sort_by=id&sort_dir=asc')
  })

  it('getRecommendedThemes requests the recommended path with the sort query', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], meta: { total: 0 } } })
    await getRecommendedThemes(1)
    expect(spy).toHaveBeenCalledWith('/instances/onboarding/recommended-themes?page=1&per_page=12&sort_by=id&sort_dir=asc')
  })

  it('getThemeCategories unwraps the list from the cached response', async () => {
    const categories = [{ id: 1, name: 'Blog', order: 1 }]
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: categories } })
    await expect(getThemeCategories()).resolves.toEqual(categories)
    expect(spy).toHaveBeenCalledWith('/instances/onboarding/theme-categories', undefined)
  })
})

describe('serviceDomainsQuery', () => {
  it('sends per_page=100 only when there is no term', () => {
    expect(serviceDomainsQuery('')).toBe('per_page=100')
    expect(serviceDomainsQuery(' '.repeat(3))).toBe('per_page=100')
  })

  it('adds the trimmed search_term (legacy name, not search)', () => {
    expect(serviceDomainsQuery(' shop.pl ')).toBe('per_page=100&search_term=shop.pl')
  })
})

describe('service domain requests', () => {
  it('getServiceDomains requests the service domains and unwraps the list', async () => {
    const domains = [{ id: 1, domain: 'shop.pl' }]
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: domains } })
    await expect(getServiceDomains(7, 'shop')).resolves.toEqual(domains)
    expect(spy).toHaveBeenCalledWith('/services/7/domains?per_page=100&search_term=shop')
  })

  it('getServiceDomains returns an empty list when the response has none', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    await expect(getServiceDomains(7)).resolves.toEqual([])
  })

  it('validateServiceDomain requests the service validate path with the encoded domain', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    await validateServiceDomain(7, 'a b.pl')
    expect(spy).toHaveBeenCalledWith('/services/7/domains/validate?domain=a%20b.pl')
  })

  it('createServiceDomain posts the legacy body and returns the created domain', async () => {
    const body = { domain: 'shop.pl', name: null, delegated_user_email: null, user_configurable_options: {} }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 5, domain: 'shop.pl', domain_zone: 'pl' } } })
    await expect(createServiceDomain(7, body)).resolves.toEqual({ id: 5, domain: 'shop.pl', domain_zone: 'pl' })
    expect(spy).toHaveBeenCalledWith('/services/7/domains', body)
  })

  it('installServiceInstance posts the install body to /instances/install and returns the instance', async () => {
    const body = { service_id: 7, domain_id: 5, install_method: 'quick', name: 'shop', theme: 'corporate', shared_access: [] }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 99, domain: 'shop.pl' } } })
    await expect(installServiceInstance(body)).resolves.toEqual({ id: 99, domain: 'shop.pl' })
    expect(spy).toHaveBeenCalledWith('/instances/install', body)
  })
})

describe('deploy requests', () => {
  it('testGitUrl posts the repo and the token and returns the whole answer', async () => {
    const answer = { success: false, error_message: 'Repository not found' }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: answer })
    await expect(testGitUrl({ repo_url: 'https://git.example.com/a.git', token: 't' })).resolves.toEqual(answer)
    expect(spy).toHaveBeenCalledWith('/instances/test-git-url', { repo_url: 'https://git.example.com/a.git', token: 't' })
  })

  it('getGitBranches posts the repo and the token and returns the branches with the default one', async () => {
    const answer = { success: true, branches: ['main', 'dev'], default_branch: 'main' }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: answer })
    await expect(getGitBranches({ repo_url: 'https://git.example.com/a.git', token: 't' })).resolves.toEqual(answer)
    expect(spy).toHaveBeenCalledWith('/instances/git-branches', { repo_url: 'https://git.example.com/a.git', token: 't' })
  })

  it('previewEnvExample posts the git body for a branch and returns the example variables', async () => {
    const answer = { has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] }
    const body = { repo_url: 'https://git.example.com/a.git', token: 't', branch: 'main' }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: answer })
    await expect(previewEnvExample(body)).resolves.toEqual(answer)
    expect(spy).toHaveBeenCalledWith('/instances/preview-env-example', body)
  })

  it('previewEnvExample posts the files body for the uploaded file', async () => {
    const body = { remote_filepath: '/tmp/site.zip', service_id: 7, domain_id: 8 }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { has_example: false, variables: [] } })
    await previewEnvExample(body)
    expect(spy).toHaveBeenCalledWith('/instances/preview-env-example', body)
  })

  it('listServiceDomains requests the 50 newest domains and unwraps the list', async () => {
    const domains = [{ id: 9, domain: 'new.pl' }]
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: domains } })
    await expect(listServiceDomains(7)).resolves.toEqual(domains)
    expect(spy).toHaveBeenCalledWith('/services/7/domains?per_page=50&sort_by=id&sort_dir=desc')
  })

  it('listServiceDomains returns an empty list when the payload is not a list', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { id: 1 } } })
    await expect(listServiceDomains(7)).resolves.toEqual([])
  })

  it('uploadDeployFile sends the raw file with its content type and the query, and returns the stored path', async () => {
    const file = new File(['x'], 'site.zip')
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { remote_filepath: '/uploads/site.zip' } })
    await expect(uploadDeployFile(file, 'application/zip', { service_id: 7, domain_id: 8, filename: 'site.zip' })).resolves.toBe('/uploads/site.zip')
    expect(spy).toHaveBeenCalledWith('/instances/upload-files?service_id=7&domain_id=8&filename=site.zip', file, {
      headers: { 'Content-Type': 'application/zip' },
    })
  })

  it('deployInstance posts the git body and returns the instance', async () => {
    const body = { service_id: 7, domain_id: 8, shared_access: [], source_type: 'git' as const, repo_url: 'https://git.example.com/a.git', token: 't', branch: 'main', env_vars: { DB_HOST: 'x' } }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 99 } } })
    await expect(deployInstance(body)).resolves.toEqual({ id: 99 })
    expect(spy).toHaveBeenCalledWith('/instances/deploy', body)
  })

  it('deployInstance posts the files body with the uploaded paths', async () => {
    const body = { service_id: 7, domain_id: 8, shared_access: ['a@example.com'], source_type: 'files' as const, remote_filepath: ['/uploads/site.zip'], env_vars: {} }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 100 } } })
    await expect(deployInstance(body)).resolves.toEqual({ id: 100 })
    expect(spy).toHaveBeenCalledWith('/instances/deploy', body)
  })
})

describe('SSH deploy-key requests', () => {
  it('createDeployKey posts the legacy body to /instances/deploy-key and returns the project with its key', async () => {
    const answer = { project: { id: 41 }, deploy_key: { public_key: 'ssh-ed25519 AAAA' } }
    const body = { service_id: 7, domain_id: 8, shared_access: ['a@example.com'], repo_url: 'git@github.com:o/r.git' }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: answer } })
    await expect(createDeployKey(body)).resolves.toEqual(answer)
    expect(spy).toHaveBeenCalledWith('/instances/deploy-key', body)
  })

  it('connectGitSsh posts the repo and the branch to the project and reports a missing branch', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { branch_missing: true } } })
    await expect(connectGitSsh(41, { repo_url: 'git@github.com:o/r.git', branch: 'main' })).resolves.toEqual({ branch_missing: true })
    expect(spy).toHaveBeenCalledWith('/instances/41/git/connect', { repo_url: 'git@github.com:o/r.git', branch: 'main' })
  })

  it('connectGitSsh treats an answer without the flag as the branch being found', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
    await expect(connectGitSsh(41, { repo_url: 'git@github.com:o/r.git', branch: 'main' })).resolves.toEqual({ branch_missing: false })
  })

  it('getGitBranchesSsh requests the project branches and unwraps the list', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: ['main', 'dev'] } })
    await expect(getGitBranchesSsh(41)).resolves.toEqual(['main', 'dev'])
    expect(spy).toHaveBeenCalledWith('/instances/41/git/branches')
  })

  it('getGitBranchesSsh returns an empty list when the answer has none', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    await expect(getGitBranchesSsh(41)).resolves.toEqual([])
  })

  it('getEnvExampleSsh requests the example of the project and returns it', async () => {
    const preview = { has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] }
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: preview } })
    await expect(getEnvExampleSsh(41)).resolves.toEqual(preview)
    expect(spy).toHaveBeenCalledWith('/instances/41/git/env-example')
  })

  it('getEnvExampleSsh answers no example when the payload is empty', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    await expect(getEnvExampleSsh(41)).resolves.toEqual({ has_example: false, variables: [] })
  })

  it('deployGitSsh posts the branch and the env vars to the project and returns the instance', async () => {
    const body = { branch: 'main', env_vars: { DB_HOST: 'x' } }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 41 } } })
    await expect(deployGitSsh(41, body)).resolves.toEqual({ id: 41 })
    expect(spy).toHaveBeenCalledWith('/instances/41/git/deploy', body)
  })

  it('deleteDeployKeyProject deletes the project with every acknowledgement the request requires', async () => {
    const spy = vi.spyOn(api, 'delete').mockResolvedValue({ data: { success: true } })
    await deleteDeployKeyProject(41)
    expect(spy).toHaveBeenCalledWith('/instances/41', {
      data: { remove_data: true, remove_database: true, confirm: true, defer_while_busy: true },
    })
  })
})

describe('wordpressVersionOptions', () => {
  it('marks the first version as the latest, and keeps the others as they are', () => {
    expect(wordpressVersionOptions(['6.7', '6.6'])).toEqual([
      { text: '6.7 - latest', value: '6.7' },
      { text: '6.6', value: '6.6' },
    ])
  })

  it('is empty for an empty list (the install has no versions)', () => {
    expect(wordpressVersionOptions([])).toEqual([])
  })
})

describe('standard form loaders', () => {
  beforeEach(() => {
    clearAllCachedGet()
  })

  it('getWordpressVersions requests the cached versions and returns the labelled options', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: ['6.7', '6.6'] } })
    await expect(getWordpressVersions()).resolves.toEqual([
      { text: '6.7 - latest', value: '6.7' },
      { text: '6.6', value: '6.6' },
    ])
    expect(spy).toHaveBeenCalledWith('/instances/wordpress-versions', undefined)
  })

  it('getWordpressTemplates requests the first 100 templates by id', async () => {
    const templates = [{ id: 3, name: 'Blog' }]
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: templates } })
    await expect(getWordpressTemplates()).resolves.toEqual(templates)
    expect(spy).toHaveBeenCalledWith('/instances/wordpress-templates?page=1&per_page=100&sort_by=id&sort_dir=asc', undefined)
  })

  it('getCloneInstances requests the instances by name and keeps only id and name', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 1, name: 'shop', domain: 'shop.pl' }] } })
    await expect(getCloneInstances()).resolves.toEqual([{ id: 1, name: 'shop' }])
    expect(spy).toHaveBeenCalledWith('/instances?page=1&per_page=100&sort_by=name&sort_dir=asc', undefined)
  })

  it('an answer without a list is an empty list', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    await expect(getWordpressTemplates()).resolves.toEqual([])
  })
})

describe('import requests', () => {
  it('getWordpressUrlTest sends only the url when there is no ip', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { wordpress_detected: true } })
    await expect(getWordpressUrlTest('https://shop.pl')).resolves.toEqual({ wordpress_detected: true })
    expect(spy).toHaveBeenCalledWith('/instances/import/test-wordpress-url?url=https%3A%2F%2Fshop.pl')
  })

  it('getWordpressUrlTest adds the ip_address when there is one', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: { error_message: 'Unreachable' } })
    await expect(getWordpressUrlTest('https://shop.pl', '10.0.0.1')).resolves.toEqual({ error_message: 'Unreachable' })
    expect(spy).toHaveBeenCalledWith('/instances/import/test-wordpress-url?url=https%3A%2F%2Fshop.pl&ip_address=10.0.0.1')
  })

  it('testWordpressConnection posts the body and returns the whole answer', async () => {
    const body = { type: 'plugin' as const, service_id: 7, url: 'https://shop.pl', login_url: 'https://shop.pl/wp-login.php', username: 'admin', password: 'x', using_admin_login_credentials: true }
    const answer = { error_type: 'connection_error', message: 'Host unreachable' }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: answer })
    await expect(testWordpressConnection(body)).resolves.toEqual(answer)
    expect(spy).toHaveBeenCalledWith('/instances/import/test-wordpress-connection', body)
  })

  it('createFilesDomain posts the files source and the name and returns the domain', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 8, domain: 'site-zip' } } })
    await expect(createFilesDomain(7, 'site')).resolves.toEqual({ id: 8, domain: 'site-zip' })
    expect(spy).toHaveBeenCalledWith('/services/7/domains', { source_type: 'files', name: 'site' })
  })

  it('createImportDomain posts the legacy body without ip_address and returns the domain', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { id: 11, domain: 'shop.pl' } } })
    await expect(createImportDomain(7, 'https://shop.pl', null, { plan: 'basic' })).resolves.toEqual({ id: 11, domain: 'shop.pl' })
    expect(spy).toHaveBeenCalledWith('/instances/import/domain', {
      service_id: 7,
      url: 'https://shop.pl',
      delegated_user_email: null,
      user_configurable_options: { plan: 'basic' },
    })
  })

  it('importInstance posts the payload and returns the instance with its nameservers', async () => {
    const payload = { service_id: 7, domain_id: 11, type: 'ftp', shared_access: [] }
    const answer = { data: { url: 'https://shop.pl' }, meta: { nameservers: ['ns1.example.com'] } }
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: answer })
    await expect(importInstance(payload)).resolves.toEqual(answer)
    expect(spy).toHaveBeenCalledWith('/instances/import/import', payload)
  })
})
