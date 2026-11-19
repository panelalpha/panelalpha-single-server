import type { EnvExamplePreview, FilesEnvPreviewBody, ServiceDomain, UploadDeployFileQuery } from './onboarding.api'
import type { EnvVarsContext } from './onboarding.store'
import { DROP_ERROR_KEYS, getFileExtension, getUploadContentType, getUploadFilename, isAllowedStandaloneFile, MAX_FILE_SELECTIONS, normalizePayloadFiles } from '@/shared/files/drop-files'
import { formatBytes } from '@/shared/format/format-bytes'
import { hasExampleVariables } from './env-vars'

// The files sequence of the onboarding. The effects are injected, so the order, the
// recovery after a lost response and what a sequence of a closed flow still does are testable without requests. The deploy request
// itself is the flow's (`finish`).

/** The legacy retry delays after a lost create response. Each poll waits one of them. */
export const FILES_DOMAIN_LEGACY_POLL_DELAYS_MS: readonly number[] = [2000, 2500, 3000, 4000, 5000, 6000, 8000]

/**
 * The panel answers the files domain step only once the Engine's create task is done (it creates the project for the uploads
 * first), which takes seconds on an idle server and minutes on a busy one. A project still being created has no domain yet, so
 * the served domain list cannot show it: the legacy delays above run out in half a minute and the project would be left without
 * its archive. These keep the sequence looking after them.
 */
const FILES_DOMAIN_SLOW_POLL_DELAYS_MS: readonly number[] = [
  10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
  10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
]

/** The whole recovery schedule: the legacy attempts, then a slower tail for a project the panel is still creating. */
export const FILES_DOMAIN_POLL_DELAYS_MS: readonly number[] = [
  ...FILES_DOMAIN_LEGACY_POLL_DELAYS_MS,
  ...FILES_DOMAIN_SLOW_POLL_DELAYS_MS,
]

/** The domain requests the domain step needs (the service domains list, the files domain create, the sleep of the polls). */
export interface FilesDomainDeps {
  listServiceDomains: (serviceId: number | string) => Promise<ServiceDomain[]>
  createFilesDomain: (serviceId: number | string, name: string) => Promise<ServiceDomain>
  sleep: (ms: number) => Promise<void>
}

/** The effects of the whole files sequence, bound to the store and the requests by the flow. */
export interface FilesDeployDeps extends FilesDomainDeps {
  /** Copy lookup for the upload errors. */
  translate: (key: string, options?: Record<string, unknown>) => string
  /** The panel's upload limit in bytes (`home.app.upload_max_bytes`): a bigger archive is refused before the project exists. */
  uploadMaxBytes: number
  /** The progress opens with the result flags reset. */
  openProgress: () => void
  /** Sets the domain the sequence created (only while the flow is open). */
  setNewDomain: (domain: ServiceDomain) => void
  /** The sequence starts: the cancel paths have a create to stop from here on. */
  beginCreate: () => void
  /** The project the domain step created, so a Cancel Deploy of the project itself can stop this sequence. */
  setCreateProject: (projectId: number | string) => void
  /** True once the user cancelled this create (the progress screen, the project's card, its Deploy Logs). */
  isCancelled: (projectId?: number | string) => boolean
  /** The create was cancelled: the project waits for its files and the window says so (nothing failed). */
  createCancelled: (projectId: number | string) => void
  /** The sequence is over, deployed or not: its project is an ordinary one again. */
  endCreate: () => void
  /** The signal of the upload, so a cancel stops the archive in flight. */
  uploadSignal: () => AbortSignal | undefined
  /** Resolves the path the server stored the file under. */
  uploadFile: (file: File, contentType: string, query: UploadDeployFileQuery, signal?: AbortSignal) => Promise<string>
  /** The stored paths the deploy sends (only while the flow is open). */
  setRemoteFilePaths: (paths: string[]) => void
  /** The env example preview for the first uploaded file. */
  previewEnvExample: (body: FilesEnvPreviewBody) => Promise<EnvExamplePreview>
  /** Opens the env vars step for the files source; false when the closed flow cannot show the step. */
  openEnvVars: (context: EnvVarsContext) => boolean
  /** With no env vars: the deploy request of the uploaded paths on the domain the sequence resolved. */
  finish: (remoteFilePaths: string[], domainId: number | string) => Promise<void>
  /** The failed result and an alert. The flow keeps the run guard. */
  fail: (error: unknown) => void
  /** True from the start of the sequence until the browser has uploaded the archive (a reload would lose it). */
  setArchivePending: (pending: boolean) => void
}

/** What the sequence reads from the flow: the service, the domain the flow already holds, and the picked files. */
export interface FilesDeployContext {
  serviceId: number | string
  /** The id of the domain the flow holds, or null when the sequence creates one. */
  existingDomainId: number | string | null
  /** The picked files, uploaded in order. */
  uploadItems: File[]
}

/** The axios codes of a lost response. */
const TRANSPORT_ERROR_CODES: ReadonlySet<string> = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ERR_CANCELED'])

/**
 * A lost response (no response, network, timeout, cancel) or a gateway
 * answer (502, 503, 504). Those may still have created the domain on the server, so the sequence polls instead of posting again.
 */
export function isTransportError (error: unknown): boolean {
  if (!error) {
    return false
  }
  const info = (typeof error === 'object' && error !== null ? error : {}) as { code?: string, response?: { status?: number } }
  if (TRANSPORT_ERROR_CODES.has(info.code ?? '')) {
    return true
  }
  if (!info.response) {
    return true
  }
  return [502, 503, 504].includes(info.response.status ?? 0)
}

/**
 * A mirror of the server's slug: diacritics go, non-alphanumerics are removed (`README.md`
 * becomes `readmemd`), spaces and underscores become hyphens. Shorter than two characters gives none.
 */
export function sourceBaseFromUploadName (name: string | null | undefined): string | null {
  const slug = String(name || '')
    .normalize('NFKD')
    // Combining marks (the diacritics NFKD split off). Non-ASCII left over is removed by the next step either way.
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9\s-]+/gi, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug.length >= 2 ? slug : null
}

/**
 * The domain (without `www.`) is the base, or the base followed by `-` or `.`, also in its
 * compact form without hyphens. No base or no domain matches nothing.
 */
export function domainMatchesSourceBase (domainName: string | null | undefined, sourceBase: string | null): boolean {
  if (!domainName || !sourceBase) {
    return false
  }
  let host = String(domainName).toLowerCase()
  if (host.startsWith('www.')) {
    host = host.slice(4)
  }
  const compact = sourceBase.replace(/-/g, '')
  return host === sourceBase
    || host.startsWith(`${sourceBase}-`)
    || host.startsWith(`${sourceBase}.`)
    || host.startsWith(`${compact}-`)
    || host.startsWith(`${compact}.`)
}

/**
 * The domain a lost create left behind. In order: a new domain (its id was not in
 * the snapshot) whose name matches the source, any new domain, a domain whose name matches. Nothing else is taken.
 */
export async function findRecoverableFilesDeployDomain (
  deps: Pick<FilesDomainDeps, 'listServiceDomains'>,
  serviceId: number | string,
  sourceName: string,
  knownIds: ReadonlySet<ServiceDomain['id']> = new Set(),
): Promise<ServiceDomain | null> {
  const sourceBase = sourceBaseFromUploadName(sourceName)
  const list = await deps.listServiceDomains(serviceId)
  if (list.length === 0) {
    return null
  }

  // With no snapshot every domain counts as new for the name match, but not for the "any new" step.
  const hasSnapshot = knownIds.size > 0
  const matchesName = (domain: ServiceDomain): boolean => domainMatchesSourceBase(domain.domain, sourceBase)

  const matchedNew = list.find(domain => (!hasSnapshot || !knownIds.has(domain.id)) && matchesName(domain))
  if (matchedNew) {
    return matchedNew
  }
  const brandNew = list.find(domain => hasSnapshot && !knownIds.has(domain.id))
  if (brandNew) {
    return brandNew
  }
  return list.find(domain => matchesName(domain)) ?? null
}

/** A domain answer the upload can use: the panel's `{data: {id, domain}}`, or nothing to fall back to the polls. */
function isUsableDomain (domain: ServiceDomain | null | undefined): domain is ServiceDomain {
  return domain !== null && domain !== undefined && domain.id !== null && domain.id !== undefined && domain.id !== ''
}

/**
 * The snapshot of the domain ids, then the create. A transport error is not posted again:
 * the sequence polls for the domain with the legacy delays and then the slow ones. Any other error is thrown at once. An answer without a
 * domain is no better than a lost one (the project was created all the same), so it is recovered the same way instead of stopping the
 * sequence with the progress screen left open. A closed flow does not stop the polls: the archive a files project waits for is uploaded by
 * this browser, so the sequence that was told to continue has to keep the tab's share of the work going.
 */
export async function ensureFilesDeployDomain (
  deps: FilesDomainDeps,
  serviceId: number | string,
  sourceName: string,
): Promise<ServiceDomain> {
  let knownIds: Set<ServiceDomain['id']> = new Set()
  try {
    const before = await deps.listServiceDomains(serviceId)
    knownIds = new Set(before.map(domain => domain.id))
  } catch {
    // Legacy: proceed without the snapshot; the name match still reclaims the domain.
  }

  let createError: unknown = null
  try {
    const created = await deps.createFilesDomain(serviceId, sourceName)
    if (isUsableDomain(created)) {
      return created
    }
  } catch (error) {
    if (!isTransportError(error)) {
      throw error
    }
    createError = error
  }

  let lastPollError: unknown = createError
  for (const delay of FILES_DOMAIN_POLL_DELAYS_MS) {
    await deps.sleep(delay)
    let existing: ServiceDomain | null = null
    try {
      existing = await findRecoverableFilesDeployDomain(deps, serviceId, sourceName, knownIds)
    } catch (pollError) {
      lastPollError = pollError
    }
    if (isUsableDomain(existing)) {
      return existing
    }
  }
  throw lastPollError ?? new Error('The files domain step answered no domain for the project it created.')
}

/** The files a flow may upload: one archive. Checked before the project is created, so a wrong file leaves no empty project. */
function assertUploadableFiles (deps: FilesDeployDeps, files: readonly File[]): void {
  if (files.length === 0) {
    throw new Error(deps.translate(DROP_ERROR_KEYS.empty))
  }
  if (files.some(file => file.webkitRelativePath || !isAllowedStandaloneFile(file))) {
    throw new Error(deps.translate(DROP_ERROR_KEYS.invalidType))
  }
  if (files.some(file => file.size > deps.uploadMaxBytes)) {
    throw new Error(deps.translate(DROP_ERROR_KEYS.tooLarge, { size: formatBytes(deps.uploadMaxBytes, 0) }))
  }
  if (files.length > MAX_FILE_SELECTIONS) {
    throw new Error(deps.translate(DROP_ERROR_KEYS.maxSelections))
  }
}

/** One request per file, in order, each checked against the file type first. */
async function uploadFiles (
  deps: FilesDeployDeps,
  files: readonly File[],
  target: { serviceId: number | string, domainId: number | string },
): Promise<string[]> {
  const remoteFilePaths: string[] = []
  for (const file of files) {
    const uploadFilename = getUploadFilename(file)
    const ext = getFileExtension(uploadFilename)
    const remoteFilepath = await deps.uploadFile(file, getUploadContentType(ext, file), {
      service_id: target.serviceId,
      domain_id: target.domainId,
      filename: uploadFilename,
    }, deps.uploadSignal())
    remoteFilePaths.push(remoteFilepath)
  }
  return remoteFilePaths
}

/** Legacy preview of the first uploaded file: a failed request counts as no example. */
async function readFilesPreview (deps: FilesDeployDeps, body: FilesEnvPreviewBody): Promise<EnvExamplePreview> {
  try {
    return (await deps.previewEnvExample(body)) || { has_example: false, variables: [] }
  } catch {
    return { has_example: false, variables: [] }
  }
}

/**
 * The progress opens, the domain is created when the flow has none (named after the first
 * file), the files upload in order, then the example env file of the first file decides: the env vars step, or the deploy at once. A
 * failure before the deploy is the failed result.
 *
 * The upload is the browser's, so closing the dialog does not end the sequence: the progress promises that the deployment continues, and
 * a project whose archive never arrives waits for its files for ever. The sequence keeps going while the tab lives and only stops changing
 * the flow's state once the flow is closed. When it is closed with an example env file there is nobody to fill the variables: the deploy
 * goes with none, the path of a project without the example.
 *
 * A cancelled create stops the sequence where it stands: the upload in flight is aborted and nothing is uploaded or deployed after it.
 * Nothing reaches the Engine to cancel (its create deploy of the new project waits for these files and refuses a cancel), so the project
 * stays as it is, waiting for the archive: the result is not a failure, and `createCancelled` shows what the project waits for.
 */
export async function runFilesDeploy (deps: FilesDeployDeps, ctx: FilesDeployContext): Promise<void> {
  deps.openProgress()
  const files = normalizePayloadFiles({ uploadItems: ctx.uploadItems })
  let domainId = ctx.existingDomainId
  // The env vars step keeps the create open: its deploy is still to come (`onboarding-flow.ts` `finishFilesDeploy` ends it).
  let handedOver = false
  let ended = false
  const endCreate = (): void => {
    if (!ended) {
      ended = true
      deps.endCreate()
    }
  }
  deps.beginCreate()
  deps.setArchivePending(true)
  try {
    assertUploadableFiles(deps, files)
    if (domainId === null) {
      const domain = await ensureFilesDeployDomain(deps, ctx.serviceId, files[0]?.name ?? '')
      deps.setNewDomain(domain)
      domainId = domain.id as number | string
    }
    deps.setCreateProject(domainId)
    if (deps.isCancelled(domainId)) {
      deps.setArchivePending(false)
      deps.createCancelled(domainId)
      return
    }

    const remoteFilePaths = await uploadFiles(deps, files, { serviceId: ctx.serviceId, domainId })
    deps.setArchivePending(false)
    if (deps.isCancelled(domainId)) {
      deps.createCancelled(domainId)
      return
    }
    deps.setRemoteFilePaths(remoteFilePaths)

    const firstPath = remoteFilePaths[0] ?? ''
    const preview = await readFilesPreview(deps, { remote_filepath: firstPath, service_id: ctx.serviceId, domain_id: domainId })
    if (deps.isCancelled(domainId)) {
      deps.createCancelled(domainId)
      return
    }
    if (hasExampleVariables(preview) && deps.openEnvVars({
      source: 'files',
      variables: [...preview.variables],
      hasExample: true,
      branches: [],
      branch: null,
      remoteFilepath: firstPath,
      previewReady: true,
    })) {
      handedOver = true
      return
    }
    // The deploy is the sequence's last step: from here the project has an ordinary deploy the Engine cancels.
    endCreate()
    await deps.finish(remoteFilePaths, domainId)
  } catch (error) {
    deps.setArchivePending(false)
    // A cancel aborts the upload in flight: the abort is the cancel, never a failed create.
    if (deps.isCancelled(domainId ?? undefined)) {
      deps.createCancelled((domainId ?? '') as number | string)
      return
    }
    deps.fail(error)
  } finally {
    if (!handedOver) {
      endCreate()
    }
  }
}
