import type { FilesDeployDeps, FilesDomainDeps } from './files-deploy'
import type { ServiceDomain, UploadDeployFileQuery } from './onboarding.api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  domainMatchesSourceBase,
  ensureFilesDeployDomain,
  FILES_DOMAIN_LEGACY_POLL_DELAYS_MS,
  FILES_DOMAIN_POLL_DELAYS_MS,
  findRecoverableFilesDeployDomain,
  isTransportError,
  runFilesDeploy,
  sourceBaseFromUploadName,
} from './files-deploy'

const TRANSPORT = { code: 'ERR_NETWORK' }

function file (name: string, options: { type?: string, relativePath?: string } = {}): File {
  const created = new File(['x'], name, { type: options.type ?? '' })
  if (options.relativePath) {
    Object.defineProperty(created, 'webkitRelativePath', { value: options.relativePath })
  }
  return created
}

/** Domain deps for the domain requests: the poll sleeps on the fake timers (the real delay, no wait). */
function domainDeps (patch: Partial<FilesDomainDeps> = {}): FilesDomainDeps {
  return {
    listServiceDomains: vi.fn(async () => []),
    createFilesDomain: vi.fn(async () => ({ id: 7, domain: 'shop-site.pl' })),
    sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    ...patch,
  }
}

/** Sequence deps that stay in the same run; each test overrides what it checks. */
function deps (patch: Partial<FilesDeployDeps> = {}): FilesDeployDeps {
  return {
    ...domainDeps(),
    translate: (key: string) => key,
    uploadMaxBytes: 268_435_456,
    openProgress: vi.fn(),
    setNewDomain: vi.fn(),
    beginCreate: vi.fn(),
    setCreateProject: vi.fn(),
    isCancelled: vi.fn(() => false),
    createCancelled: vi.fn(),
    endCreate: vi.fn(),
    uploadSignal: vi.fn(() => undefined),
    uploadFile: vi.fn(async (_file: File, _type: string, query: UploadDeployFileQuery) => `remote/${query.filename}`),
    setRemoteFilePaths: vi.fn(),
    previewEnvExample: vi.fn(async () => ({ has_example: false, variables: [] })),
    openEnvVars: vi.fn(() => true),
    finish: vi.fn(async () => {}),
    fail: vi.fn(),
    setArchivePending: vi.fn(),
    ...patch,
  }
}

const existingDomain = { id: 5, domain: 'shop.pl' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isTransportError', () => {
  it('is false for no error', () => {
    expect(isTransportError(undefined)).toBe(false)
    expect(isTransportError(null)).toBe(false)
  })

  it('is true for a lost response: no response, network, timeout and cancel codes', () => {
    expect(isTransportError(TRANSPORT)).toBe(true)
    expect(isTransportError({ code: 'ECONNABORTED' })).toBe(true)
    expect(isTransportError({ code: 'ERR_CANCELED' })).toBe(true)
    expect(isTransportError(new Error('socket hang up'))).toBe(true)
  })

  it('is true for the gateway answers 502, 503 and 504 only', () => {
    expect(isTransportError({ response: { status: 502 } })).toBe(true)
    expect(isTransportError({ response: { status: 503 } })).toBe(true)
    expect(isTransportError({ response: { status: 504 } })).toBe(true)
    expect(isTransportError({ response: { status: 422 } })).toBe(false)
    expect(isTransportError({ response: { status: 500 } })).toBe(false)
  })
})

describe('sourceBaseFromUploadName', () => {
  it('slugs the name the way the server does (non-alphanumerics removed, not hyphenated)', () => {
    expect(sourceBaseFromUploadName('README.md')).toBe('readmemd')
    expect(sourceBaseFromUploadName('Shop Site.zip')).toBe('shop-sitezip')
    expect(sourceBaseFromUploadName('my app')).toBe('my-app')
    expect(sourceBaseFromUploadName('my_app')).toBe('myapp')
  })

  it('gives none for an empty or one-character name', () => {
    expect(sourceBaseFromUploadName('')).toBeNull()
    expect(sourceBaseFromUploadName(null)).toBeNull()
    expect(sourceBaseFromUploadName('a')).toBeNull()
  })
})

describe('domainMatchesSourceBase', () => {
  it('matches the base, the base with www., and the base followed by a hyphen or a dot', () => {
    expect(domainMatchesSourceBase('shop-site', 'shop-site')).toBe(true)
    expect(domainMatchesSourceBase('www.shop-site.pl', 'shop-site')).toBe(true)
    expect(domainMatchesSourceBase('shop-site-2.pl', 'shop-site')).toBe(true)
    expect(domainMatchesSourceBase('shop-site.example.com', 'shop-site')).toBe(true)
  })

  it('also matches the compact form of the base (no hyphens)', () => {
    expect(domainMatchesSourceBase('shopsite.pl', 'shop-site')).toBe(true)
    expect(domainMatchesSourceBase('shopsite-2.pl', 'shop-site')).toBe(true)
  })

  it('rejects other names, a longer word that only starts the same, and a missing side', () => {
    expect(domainMatchesSourceBase('other.pl', 'shop-site')).toBe(false)
    expect(domainMatchesSourceBase('shop-sitex.pl', 'shop-site')).toBe(false)
    expect(domainMatchesSourceBase(undefined, 'shop-site')).toBe(false)
    expect(domainMatchesSourceBase('shop-site.pl', null)).toBe(false)
  })
})

describe('findRecoverableFilesDeployDomain', () => {
  const list = (...domains: ServiceDomain[]) => ({ listServiceDomains: vi.fn(async () => domains) })

  it('takes a new domain whose name matches the source first', async () => {
    const deps = list(
      { id: 1, domain: 'shop-site.pl' },
      { id: 2, domain: 'other.pl' },
      { id: 3, domain: 'shop-site-2.pl' },
    )

    const found = await findRecoverableFilesDeployDomain(deps, 10, 'shop-site', new Set([1]))

    expect(found?.id).toBe(3)
  })

  it('then takes any new domain, when no new domain matches the name', async () => {
    const deps = list({ id: 1, domain: 'shop.pl' }, { id: 2, domain: 'unrelated.pl' })

    const found = await findRecoverableFilesDeployDomain(deps, 10, 'shop-site', new Set([1]))

    expect(found?.id).toBe(2)
  })

  it('then takes a domain whose name matches, when every domain was there before', async () => {
    const deps = list({ id: 1, domain: 'shop-site.pl' }, { id: 2, domain: 'x.pl' })

    const found = await findRecoverableFilesDeployDomain(deps, 10, 'shop-site', new Set([1, 2]))

    expect(found?.id).toBe(1)
  })

  it('gives none when nothing is new and nothing matches, or the service has no domains', async () => {
    expect(await findRecoverableFilesDeployDomain(list({ id: 1, domain: 'x.pl' }), 10, 'shop-site', new Set([1]))).toBeNull()
    expect(await findRecoverableFilesDeployDomain(list(), 10, 'shop-site')).toBeNull()
  })
})

describe('ensureFilesDeployDomain', () => {
  it('creates the domain after a snapshot of the known ids, and does not poll', async () => {
    const sleep = vi.fn(async () => {})
    const d = domainDeps({ listServiceDomains: vi.fn(async () => [{ id: 1, domain: 'x.pl' }]), sleep })

    const domain = await ensureFilesDeployDomain(d, 10, 'shop-site.zip')

    expect(d.createFilesDomain).toHaveBeenCalledWith(10, 'shop-site.zip')
    expect(domain).toEqual({ id: 7, domain: 'shop-site.pl' })
    expect(sleep).not.toHaveBeenCalled()
  })

  it('goes on without a snapshot when the list request fails', async () => {
    const d = domainDeps({ listServiceDomains: vi.fn(async () => {
      throw new Error('list down')
    }) })

    const domain = await ensureFilesDeployDomain(d, 10, 'shop-site.zip')

    expect(d.createFilesDomain).toHaveBeenCalledOnce()
    expect(domain?.id).toBe(7)
  })

  it('a non-transport create error is thrown at once, with no poll', async () => {
    const error = { response: { status: 422 } }
    const d = domainDeps({ createFilesDomain: vi.fn(async () => {
      throw error
    }) })
    const sleep = vi.fn(async () => {})

    await expect(ensureFilesDeployDomain({ ...d, sleep }, 10, 'shop-site')).rejects.toBe(error)
    expect(sleep).not.toHaveBeenCalled()
    expect(d.createFilesDomain).toHaveBeenCalledOnce()
  })

  it('a lost create response recovers the domain by polling, and never posts again', async () => {
    const d = domainDeps({
      listServiceDomains: vi.fn()
        .mockResolvedValueOnce([{ id: 1, domain: 'x.pl' }])
        .mockResolvedValue([{ id: 1, domain: 'x.pl' }, { id: 2, domain: 'shop-site.pl' }]),
      createFilesDomain: vi.fn(async () => {
        throw TRANSPORT
      }),
    })

    const pending = ensureFilesDeployDomain(d, 10, 'shop-site')
    await vi.advanceTimersByTimeAsync(2000)

    expect(await pending).toEqual({ id: 2, domain: 'shop-site.pl' })
    expect(d.createFilesDomain).toHaveBeenCalledOnce()
  })

  it('polls with the legacy delays until the domain shows up', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 9, domain: 'shop-site.pl' }])
    const d = domainDeps({ listServiceDomains: list, createFilesDomain: vi.fn(async () => {
      throw TRANSPORT
    }) })

    const pending = ensureFilesDeployDomain(d, 10, 'shop-site')
    await vi.advanceTimersByTimeAsync(2000 + 2500)
    expect(list).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(3000)

    expect(await pending).toEqual({ id: 9, domain: 'shop-site.pl' })
    expect(list).toHaveBeenCalledTimes(4)
  })

  it('after the last poll it throws the last poll error', async () => {
    const pollError = new Error('poll down')
    const list = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValue(pollError)
    const d = domainDeps({ listServiceDomains: list, createFilesDomain: vi.fn(async () => {
      throw TRANSPORT
    }) })

    const result = ensureFilesDeployDomain(d, 10, 'shop-site').catch(error => error)
    await vi.runAllTimersAsync()

    expect(await result).toBe(pollError)
    expect(list).toHaveBeenCalledTimes(1 + FILES_DOMAIN_POLL_DELAYS_MS.length)
  })

  it('an answer without a domain is recovered by the polls instead of stopping the sequence', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce([{ id: 1, domain: 'x.pl' }])
      .mockResolvedValue([{ id: 1, domain: 'x.pl' }, { id: 2, domain: 'shop-site.pl' }])
    const d = domainDeps({
      listServiceDomains: list,
      createFilesDomain: vi.fn(async () => ({}) as unknown as ServiceDomain),
    })

    const pending = ensureFilesDeployDomain(d, 10, 'shop-site')
    await vi.advanceTimersByTimeAsync(2000)

    expect(await pending).toEqual({ id: 2, domain: 'shop-site.pl' })
    expect(d.createFilesDomain).toHaveBeenCalledOnce()
  })

  it('keeps looking after the legacy delays while the panel is still creating the project', async () => {
    // The panel answers the step only when the Engine's create task is done, which takes longer than the legacy 30 s on a busy server.
    const legacy = FILES_DOMAIN_LEGACY_POLL_DELAYS_MS.reduce((sum, delay) => sum + delay, 0)
    let calls = 0
    const list = vi.fn(async () => {
      calls += 1
      // The snapshot and every legacy poll see no project yet: it has no domain while it is being created.
      return calls <= 1 + FILES_DOMAIN_LEGACY_POLL_DELAYS_MS.length ? [] : [{ id: 9, domain: 'shop-site.pl' }]
    })
    const d = domainDeps({ listServiceDomains: list, createFilesDomain: vi.fn(async () => {
      throw TRANSPORT
    }) })

    const pending = ensureFilesDeployDomain(d, 10, 'shop-site')
    await vi.advanceTimersByTimeAsync(legacy)
    expect(list).toHaveBeenCalledTimes(1 + FILES_DOMAIN_LEGACY_POLL_DELAYS_MS.length)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(await pending).toEqual({ id: 9, domain: 'shop-site.pl' })
    expect(list).toHaveBeenCalledTimes(2 + FILES_DOMAIN_LEGACY_POLL_DELAYS_MS.length)
  })

  it('after the last poll with no domain it throws the create error', async () => {
    const d = domainDeps({ createFilesDomain: vi.fn(async () => {
      throw TRANSPORT
    }) })

    const result = ensureFilesDeployDomain(d, 10, 'shop-site').catch(error => error)
    await vi.runAllTimersAsync()

    expect(await result).toBe(TRANSPORT)
  })
})

describe('runFilesDeploy', () => {
  it('opens the progress first, then deploys with no env vars when the first file has no example', async () => {
    const order: string[] = []
    const d = deps({
      openProgress: vi.fn(() => order.push('progress')),
      finish: vi.fn(async paths => {
        order.push(`finish:${paths.join(',')}`)
      }),
    })

    await runFilesDeploy(d, {
      serviceId: 10,
      existingDomainId: null,
      uploadItems: [file('shop.zip')],
    })

    expect(order).toEqual(['progress', 'finish:remote/shop.zip'])
    expect(d.setNewDomain).toHaveBeenCalledWith({ id: 7, domain: 'shop-site.pl' })
    expect(d.setRemoteFilePaths).toHaveBeenCalledWith(['remote/shop.zip'])
    expect(d.openEnvVars).not.toHaveBeenCalled()
  })

  it('names the domain after the first file (legacy uploadItems[0].name)', async () => {
    const d = deps()

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: null, uploadItems: [file('Shop Site.zip')] })

    expect(d.createFilesDomain).toHaveBeenCalledWith(10, 'Shop Site.zip')
  })

  it('takes the flow domain without a create request when the flow already holds one', async () => {
    const d = deps()

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('shop.zip')] })

    expect(d.createFilesDomain).not.toHaveBeenCalled()
    expect(d.setNewDomain).not.toHaveBeenCalled()
    expect(d.uploadFile).toHaveBeenCalledWith(expect.any(File), 'application/zip', { service_id: 10, domain_id: 5, filename: 'shop.zip' }, undefined)
  })

  it('sends the archive name as the filename', async () => {
    const d = deps()

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('site.tar.gz')] })

    expect(d.uploadFile).toHaveBeenCalledWith(expect.any(File), 'application/gzip', {
      service_id: 10,
      domain_id: 5,
      filename: 'site.tar.gz',
    }, undefined)
  })

  it('keeps the browser file type when there is one', async () => {
    const d = deps()

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('site.zip', { type: 'application/x-zip-compressed' })] })

    expect(d.uploadFile).toHaveBeenCalledWith(expect.any(File), 'application/x-zip-compressed', expect.objectContaining({ filename: 'site.zip' }), undefined)
  })

  it.each([
    ['a database file', [file('dump.sql')]],
    ['a folder file', [file('index.html', { relativePath: 'site/index.html' })]],
    ['two archives', [file('a.zip'), file('b.zip')]],
  ])('%s fails before the project is created', async (_name, items) => {
    const d = deps({ translate: (key: string) => `t:${key}` })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: null, uploadItems: items })

    expect(d.createFilesDomain).not.toHaveBeenCalled()
    expect(d.uploadFile).not.toHaveBeenCalled()
    expect(d.fail).toHaveBeenCalled()
    expect(d.finish).not.toHaveBeenCalled()
  })

  it('a file of a type that is not allowed fails before the project is created', async () => {
    const d = deps({ translate: (key: string) => `t:${key}` })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('notes.txt')] })

    expect(d.createFilesDomain).not.toHaveBeenCalled()
    expect(d.uploadFile).not.toHaveBeenCalled()
    expect(d.fail).toHaveBeenCalledWith(new Error('t:heading.onboarding.zipDeploy.file.invalidType'))
    expect(d.finish).not.toHaveBeenCalled()
  })

  it('an empty selection fails with the empty copy', async () => {
    const d = deps({ translate: (key: string) => `t:${key}` })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [] })

    expect(d.fail).toHaveBeenCalledWith(new Error('t:heading.onboarding.zipDeploy.file.empty'))
    expect(d.uploadFile).not.toHaveBeenCalled()
  })

  it('an upload failure goes to fail and deploys nothing', async () => {
    const error = new Error('upload rejected')
    const d = deps({ uploadFile: vi.fn(async () => {
      throw error
    }) })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(d.fail).toHaveBeenCalledWith(error)
    expect(d.finish).not.toHaveBeenCalled()
  })

  it('a failed preview counts as no example and deploys at once', async () => {
    const d = deps({ previewEnvExample: vi.fn(async () => {
      throw new Error('preview down')
    }) })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(d.finish).toHaveBeenCalledWith(['remote/a.zip'], existingDomain.id)
    expect(d.fail).not.toHaveBeenCalled()
  })

  it('previews the first uploaded file on the service and domain', async () => {
    const d = deps()

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(d.previewEnvExample).toHaveBeenCalledWith({ remote_filepath: 'remote/a.zip', service_id: 10, domain_id: 5 })
  })

  it('with an example opens the env vars step with the files context and does not deploy yet', async () => {
    const d = deps({
      previewEnvExample: vi.fn(async () => ({ has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] })),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(d.openEnvVars).toHaveBeenCalledWith({
      source: 'files',
      variables: [{ key: 'DB_HOST', value: 'localhost' }],
      hasExample: true,
      branches: [],
      branch: null,
      remoteFilepath: 'remote/a.zip',
      previewReady: true,
    })
    expect(d.finish).not.toHaveBeenCalled()
  })

  it('closing the dialog does not stop the sequence: the archive uploads and the deploy goes out', async () => {
    // The progress promises that the deployment continues. The archive is this browser's, so a closed flow (its effects inert, as the
    // flow binds them once its run moved on) must not end the sequence before the upload.
    const created = { id: 7, domain: 'shop-site.pl' }
    const order: string[] = []
    let closed = false
    const d = deps({
      createFilesDomain: vi.fn(async () => {
        closed = true
        return created
      }),
      setNewDomain: vi.fn(() => order.push('setNewDomain')),
      uploadFile: vi.fn(async (_file: File, _type: string) => {
        order.push(closed ? 'upload-after-close' : 'upload')
        return 'remote/shop.zip'
      }),
      finish: vi.fn(async (paths: string[]) => {
        order.push(`finish:${paths.join(',')}`)
      }),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: null, uploadItems: [file('shop.zip')] })

    expect(order).toEqual(['setNewDomain', 'upload-after-close', 'finish:remote/shop.zip'])
    expect(d.fail).not.toHaveBeenCalled()
  })

  it('marks the archive pending from the start of the sequence until the upload is done', async () => {
    const order: string[] = []
    const d = deps({
      setArchivePending: vi.fn((value: boolean) => order.push(`pending:${value}`)),
      uploadFile: vi.fn(async (_file: File, _type: string, query: UploadDeployFileQuery) => {
        order.push(`upload:${query.filename}`)
        return `remote/${query.filename}`
      }),
      finish: vi.fn(async () => {
        order.push('finish')
      }),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(order).toEqual(['pending:true', 'upload:a.zip', 'pending:false', 'finish'])
  })

  it('refuses an archive over the panel upload limit before the project is created', async () => {
    const translate = vi.fn((key: string, options?: Record<string, unknown>) => `${key}|${JSON.stringify(options ?? {})}`)
    const d = deps({ translate, uploadMaxBytes: 5_242_880 })
    const big = file('big.zip')
    Object.defineProperty(big, 'size', { value: 5_242_881 })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [big] })

    expect(d.createFilesDomain).not.toHaveBeenCalled()
    expect(d.uploadFile).not.toHaveBeenCalled()
    expect(d.fail).toHaveBeenCalledOnce()
    expect(d.setArchivePending).toHaveBeenLastCalledWith(false)
    expect(translate).toHaveBeenCalledWith('heading.onboarding.zipDeploy.file.tooLarge', { size: '5 MB' })
  })

  it('marks no archive pending when the files are refused or the upload fails', async () => {
    const refused = deps({ translate: (key: string) => `t:${key}` })
    await runFilesDeploy(refused, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('notes.txt')] })
    expect(refused.setArchivePending).toHaveBeenLastCalledWith(false)

    const failed = deps({ uploadFile: vi.fn(async () => {
      throw new Error('upload rejected')
    }) })
    await runFilesDeploy(failed, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })
    expect(failed.fail).toHaveBeenCalledOnce()
    expect(failed.setArchivePending).toHaveBeenLastCalledWith(false)
  })

  it('a closed flow with an example env file deploys without the env vars step', async () => {
    const d = deps({
      previewEnvExample: vi.fn(async () => ({ has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] })),
      openEnvVars: vi.fn(() => false),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(d.openEnvVars).toHaveBeenCalledOnce()
    expect(d.finish).toHaveBeenCalledWith(['remote/a.zip'], existingDomain.id)
  })

  it('marks the create project before the upload and ends the create once the deploy is posted', async () => {
    const order: string[] = []
    const d = deps({
      beginCreate: vi.fn(() => order.push('begin')),
      setCreateProject: vi.fn((id: number | string) => order.push(`project:${String(id)}`)),
      uploadSignal: vi.fn(() => new AbortController().signal),
      uploadFile: vi.fn(async (_file: File, _type: string, _query: UploadDeployFileQuery, signal?: AbortSignal) => {
        order.push(`upload:${String(signal instanceof AbortSignal)}`)
        return 'remote/a.zip'
      }),
      endCreate: vi.fn(() => order.push('end')),
      finish: vi.fn(async () => {
        order.push('finish')
      }),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(order).toEqual(['begin', 'project:5', 'upload:true', 'end', 'finish'])
  })

  it('a cancel during the create leaves the project waiting for its files: nothing uploads, nothing deploys', async () => {
    // The domain step is the long one: the user can cancel while the project is still being created.
    let cancelled = false
    const d = deps({
      isCancelled: vi.fn(() => cancelled),
      createFilesDomain: vi.fn(async () => {
        cancelled = true
        return { id: 7, domain: 'shop-site.pl' }
      }),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: null, uploadItems: [file('a.zip')] })

    expect(d.createCancelled).toHaveBeenCalledWith(7)
    expect(d.uploadFile).not.toHaveBeenCalled()
    expect(d.previewEnvExample).not.toHaveBeenCalled()
    expect(d.finish).not.toHaveBeenCalled()
    expect(d.fail).not.toHaveBeenCalled()
    expect(d.setNewDomain).toHaveBeenCalledWith({ id: 7, domain: 'shop-site.pl' })
    expect(d.setArchivePending).toHaveBeenLastCalledWith(false)
    expect(d.endCreate).toHaveBeenCalledOnce()
  })

  it('a cancel during the upload aborts it and is no failure', async () => {
    let cancelled = false
    const abort = new AbortController()
    const d = deps({
      isCancelled: vi.fn(() => cancelled),
      uploadSignal: vi.fn(() => abort.signal),
      uploadFile: vi.fn(async () => {
        cancelled = true
        abort.abort()
        throw Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })
      }),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(d.createCancelled).toHaveBeenCalledWith(existingDomain.id)
    expect(d.fail).not.toHaveBeenCalled()
    expect(d.finish).not.toHaveBeenCalled()
    expect(d.setArchivePending).toHaveBeenLastCalledWith(false)
  })

  it('a cancel after the upload stops the deploy and the env vars step', async () => {
    const cancelled = vi.fn(() => false)
    const d = deps({
      isCancelled: cancelled,
      previewEnvExample: vi.fn(async () => {
        // The cancel lands while the preview runs: the deploy must not follow it.
        cancelled.mockReturnValue(true)
        return { has_example: true, variables: [{ key: 'DB_HOST', value: 'localhost' }] }
      }),
    })

    await runFilesDeploy(d, { serviceId: 10, existingDomainId: existingDomain.id, uploadItems: [file('a.zip')] })

    expect(d.openEnvVars).not.toHaveBeenCalled()
    expect(d.finish).not.toHaveBeenCalled()
    expect(d.createCancelled).toHaveBeenCalledWith(existingDomain.id)
  })
})
