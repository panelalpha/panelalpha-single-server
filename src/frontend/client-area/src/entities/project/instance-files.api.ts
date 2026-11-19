import { api } from '@/shared/api/client'

// The two calls the status indicator's "upload an archive" solution makes.

/** `POST /instances/{id}/deploy/upload`: the archive as an octet stream; answers where it landed on the server. */
export async function uploadDeployArchive (instanceId: number | string, file: File): Promise<string> {
  const { data } = await api.post<{ remote_filepath: string }>(`/instances/${instanceId}/deploy/upload`, file, {
    headers: { 'Content-Type': 'application/octet-stream' },
    params: { filename: file.name, deploy_staging: 0 },
  })
  return data.remote_filepath
}

/** `POST /instances/{id}/redeploy` of an uploaded archive, overwriting the live files. */
export async function redeployFromArchive (instanceId: number | string, remoteFilepath: string): Promise<void> {
  await api.post(`/instances/${instanceId}/redeploy`, {
    remote_filepath: remoteFilepath,
    mode: 'overwrite',
    deploy_staging: false,
  })
}
