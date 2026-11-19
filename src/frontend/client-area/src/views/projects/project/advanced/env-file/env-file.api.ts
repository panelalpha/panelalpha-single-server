import type { EnvRow } from './env-vars'
import { api } from '@/shared/api/client'

// The env-file endpoints of
// an instance. Requests go through the shared client; the `instances` / `projects` segment is rewritten there, so these paths stay as
// legacy writes them. Unlike the `data.data` answers of other advanced pages, these answers are the bare JSON body (`EnvFileController`).

/** `GET .../env-file/meta` answer. */
export interface EnvFileMeta {
  is_git_repo: boolean
  is_dind: boolean
  supports_restart: boolean
  default_env_dir: string | null
  default_env_path: string | null
  app_type: string | null
}

/** `GET .../env-file?path=` answer; `parsed` rows are the `EnvRow` shape from `env-vars.ts`. */
export interface EnvFileContents {
  path: string
  exists: boolean
  contents: string | null
  parsed: EnvRow[]
}

/** `PUT .../env-file` body. `mode` is always `raw` (the table view sends the whole rewritten text); `kv` stays in the type as the API accepts it. */
export interface EnvFileSaveBody {
  path: string
  mode: 'kv' | 'raw'
  contents: string
  restart: boolean
}

/** `PUT .../env-file` answer; `restarted` tells which success message to show. */
export interface EnvFileSaveResult {
  success: boolean
  path: string
  restarted: boolean
}

/** `GET /server-accounts/{hostingId}/instances/{id}/env-file/meta`: the bare JSON body. */
export async function getEnvFileMeta (hostingId: number, instanceId: number | string): Promise<EnvFileMeta> {
  const { data } = await api.get<EnvFileMeta>(`/server-accounts/${hostingId}/instances/${instanceId}/env-file/meta`)
  return data
}

/** `GET /server-accounts/{hostingId}/instances/{id}/env-file` with the file path in `params` (not in the URL). */
export async function getEnvFile (hostingId: number, instanceId: number | string, path: string): Promise<EnvFileContents> {
  const { data } = await api.get<EnvFileContents>(`/server-accounts/${hostingId}/instances/${instanceId}/env-file`, {
    params: { path },
  })
  return data
}

/** `PUT /server-accounts/{hostingId}/instances/{id}/env-file` with the editor body; the answer is the bare JSON body. */
export async function putEnvFile (hostingId: number, instanceId: number | string, body: EnvFileSaveBody): Promise<EnvFileSaveResult> {
  const { data } = await api.put<EnvFileSaveResult>(`/server-accounts/${hostingId}/instances/${instanceId}/env-file`, body)
  return data
}
