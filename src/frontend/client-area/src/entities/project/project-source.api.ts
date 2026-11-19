import { api } from '@/shared/api/client'

// `projectSource` and `forgetProjectSource`: the answer is remembered for 30 s and shared by the Source card,
// the redeploy/upload modals and the deploy alert. A rejected request is not remembered.

export type DeployStepKey = 'dependencies' | 'build' | 'migrations'

export interface ProjectSourceDeployStep {
  commands?: string[]
  skippable?: boolean
}

export interface ProjectSourceWarning {
  code: string
  title?: string | null
  details?: string[]
}

export interface ProjectSource {
  available: boolean
  stack?: { label?: string } | null
  database?: { present?: boolean, label?: string } | null
  last_deploy?: { status?: string, commit?: string | null, finished_at?: string | null, waiting_for_files?: boolean } | null
  deploy_steps?: Partial<Record<DeployStepKey, ProjectSourceDeployStep>> | null
  warnings?: ProjectSourceWarning[] | null
}

export const PROJECT_SOURCE_TTL_MS = 30_000

interface ProjectSourceMemoEntry {
  at: number
  promise: Promise<ProjectSource | null>
}

const projectSourceMemo = new Map<string, ProjectSourceMemoEntry>()

export function getProjectSource (
  id: number | string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<ProjectSource | null> {
  const key = String(id)
  const hit = projectSourceMemo.get(key)
  if (!fresh && hit && Date.now() - hit.at < PROJECT_SOURCE_TTL_MS) {
    return hit.promise
  }

  const promise = api
    .get<{ data: ProjectSource | null }>(`/instances/${id}/source`)
    .then(({ data }) => data.data)
  const entry: ProjectSourceMemoEntry = { at: Date.now(), promise }
  projectSourceMemo.set(key, entry)
  promise.catch(() => {
    if (projectSourceMemo.get(key) === entry) {
      projectSourceMemo.delete(key)
    }
  })
  return promise
}

export function forgetProjectSource (id: number | string): void {
  projectSourceMemo.delete(String(id))
}

export function resetProjectSourceMemo (): void {
  projectSourceMemo.clear()
}
