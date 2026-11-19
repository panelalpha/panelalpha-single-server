import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { createCronJob, type CronJobPayload, deleteCronJob, listCronJobs, updateCronJob } from './cron.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const payload: CronJobPayload = {
  common_settings: 'custom',
  minute: '*/5',
  hour: '*',
  day_of_month: '*',
  month: '*',
  day_of_week: '*',
  command: 'php /home/example/cron.php',
}

describe('cron.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists the jobs of the server account from data.data, with no services on PHP hosting', async () => {
    const jobs = [{ line: '3', command: 'ls', minute: '0', hour: '1', day_of_month: '*', month: '*', day_of_week: '*' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: jobs, meta: { services: null } } })

    await expect(listCronJobs(11)).resolves.toEqual({ jobs, services: null })
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/cron-jobs')
  })

  it('returns the services of a container project from meta.services (ID-47)', async () => {
    const jobs = [{ line: 'a1', command: 'php artisan schedule:run', service: 'app', minute: '*', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: jobs, meta: { services: ['app', 'worker'] } } })

    await expect(listCronJobs(11)).resolves.toEqual({ jobs, services: ['app', 'worker'] })
  })

  it('reads a list without meta as PHP hosting', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } })

    await expect(listCronJobs(11)).resolves.toEqual({ jobs: [], services: null })
  })

  it('creates a job with POST on the collection', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })

    await createCronJob(11, payload)

    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/cron-jobs', payload)
  })

  it('updates a job with PUT on its line', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })

    await updateCronJob(11, '7', payload)

    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/cron-jobs/7', payload)
  })

  it('deletes a job with DELETE on its line', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await deleteCronJob(11, '7')

    expect(api.delete).toHaveBeenCalledWith('/server-accounts/11/cron-jobs/7')
  })

  it('rejects when the request fails, so the caller can show the error', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Server Error'))

    await expect(listCronJobs(11)).rejects.toThrow('Server Error')
  })
})
