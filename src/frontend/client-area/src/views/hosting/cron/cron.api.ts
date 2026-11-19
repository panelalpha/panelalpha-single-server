import { api } from '@/shared/api/client'

// Calls of the Cron Jobs screen, same contract as legacy.

/** One line of the crontab as `GET /server-accounts/{id}/cron-jobs` returns it. `schedule` is set for WP Cloud only. */
export interface CronJob {
  line: string
  command: string
  /** The Compose service a container project's job runs in; null or missing on PHP hosting. */
  service?: string | null
  minute: string
  hour: string
  day_of_month: string
  month: string
  day_of_week: string
  schedule?: string
}

/** Body of `POST` and `PUT`. `common_settings` is sent but ignored by the backend (legacy sends it too). */
export interface CronJobPayload {
  common_settings: string
  minute: string
  hour: string
  day_of_month: string
  month: string
  day_of_week: string
  command: string
  /** Container projects only, and required there: the service the command runs in. */
  service?: string
}

export interface CronJobList {
  jobs: CronJob[]
  /** `meta.services`: the services a container project's job can run in; null on PHP hosting, whose jobs name none. */
  services: string[] | null
}

/** `GET /server-accounts/{id}/cron-jobs`. */
export async function listCronJobs (accountId: number): Promise<CronJobList> {
  const { data } = await api.get<{ data: CronJob[], meta?: { services?: string[] | null } }>(`/server-accounts/${accountId}/cron-jobs`)
  return { jobs: data.data, services: data.meta?.services ?? null }
}

/** `POST /server-accounts/{id}/cron-jobs`. */
export async function createCronJob (accountId: number, payload: CronJobPayload): Promise<void> {
  await api.post(`/server-accounts/${accountId}/cron-jobs`, payload)
}

/** `PUT /server-accounts/{id}/cron-jobs/{line}`. */
export async function updateCronJob (accountId: number, line: string, payload: CronJobPayload): Promise<void> {
  await api.put(`/server-accounts/${accountId}/cron-jobs/${line}`, payload)
}

/** `DELETE /server-accounts/{id}/cron-jobs/{line}`. */
export async function deleteCronJob (accountId: number, line: string): Promise<void> {
  await api.delete(`/server-accounts/${accountId}/cron-jobs/${line}`)
}
