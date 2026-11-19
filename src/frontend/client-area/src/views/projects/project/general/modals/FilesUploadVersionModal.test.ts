import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as instanceApi from '@/views/projects/project/instance.api'
import * as projectSourceApi from '@/entities/project/project-source.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import FilesUploadVersionModal from './FilesUploadVersionModal.vue'

vi.mock('@/views/projects/project/instance.api', () => ({
  uploadVersionArchive: vi.fn(),
  redeployUploadedArchive: vi.fn(),
}))

vi.mock('@/entities/project/project-source.api', () => ({
  getProjectSource: vi.fn(),
  forgetProjectSource: vi.fn(),
}))

vi.mock('@/entities/project/use-deploy-logs', async () => {
  const { ref } = await import('vue')
  return {
    useDeployLogs: () => ({
      status: ref('running'),
      currentStage: ref(null),
      stages: ref([]),
      lines: ref([]),
      error: ref(null),
      warning: ref(null),
      isRunning: ref(true),
      downloadLogId: ref(null),
      finishedLogId: ref(null),
      cancelling: ref(false),
      downloading: ref(false),
      cancelDeploy: vi.fn(),
      download: vi.fn(),
    }),
  }
})

function makeInstance (privileged = true) {
  return {
    id: 7,
    source: { type: 'files', last_deploy: { status: 'success', finished_at: '2026-03-04T10:00:00Z' } },
    details: { archive_size: 2048 },
    subInstances: [],
    parentInstance: null,
    hasRedeployPrivilege: () => privileged,
  } as unknown as InstanceResource
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountModal (instance = makeInstance(), uploadMaxBytes?: number) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (uploadMaxBytes !== undefined) {
    useSessionStore().home = { app: { upload_max_bytes: uploadMaxBytes } } as never
  }
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(FilesUploadVersionModal, { props: { instance }, global: { plugins: [pinia] }, attachTo: host })
  ;(wrapper.vm as unknown as { open: () => void }).open()
  await flushPromises()
  return wrapper
}

async function pickFile (name: string, size?: number) {
  const input = bodyQuery('[data-testid="files-upload-input"]') as HTMLInputElement
  const file = new File(['x'], name)
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size })
  }
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}

function zoneEvent (type: string, files?: File[]): void {
  const zone = bodyQuery('[data-testid="files-upload-dropzone"]')
  if (!zone) {
    throw new Error('drop zone not found')
  }
  const event = new Event(type, { bubbles: true, cancelable: true })
  if (files) {
    Object.defineProperty(event, 'dataTransfer', { value: { files } })
  }
  zone.dispatchEvent(event)
}

function fileInput (): HTMLInputElement {
  const input = bodyQuery('[data-testid="files-upload-input"]')
  if (!input) {
    throw new Error('file input not found')
  }
  return input as HTMLInputElement
}

describe('FilesUploadVersionModal', () => {
  beforeEach(() => {
    vi.mocked(instanceApi.uploadVersionArchive).mockResolvedValue('/tmp/site.zip')
    vi.mocked(instanceApi.redeployUploadedArchive).mockResolvedValue({ target_id: 7, deploy_log_id: 3 })
    vi.mocked(projectSourceApi.getProjectSource).mockResolvedValue({
      available: true,
      deploy_steps: {
        dependencies: { commands: ['npm install'], skippable: true },
        build: { commands: ['npm run build'], skippable: true },
        migrations: { commands: ['npm run migrate'], skippable: false },
      },
    } as never)
  })

  it('shows the deploy steps of the project with the based-on-current note and no existing-files radios', async () => {
    const wrapper = await mountModal()

    expect(projectSourceApi.getProjectSource).toHaveBeenCalledWith(7)
    expect(bodyQuery('[data-testid="files-upload-overwrite"]')).toBeNull()
    expect(bodyQuery('[data-testid="files-upload-modal"] .deploy-steps')).not.toBeNull()
    expect(bodyQuery('[data-step="migrations"] .v-selection-control')).toBeNull()
    wrapper.unmount()
  })

  it('keeps Upload & deploy disabled until an archive is chosen, then uploads, deploys and switches to the logs phase', async () => {
    const wrapper = await mountModal()
    const submit = () => bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement

    expect(bodyQuery('[data-testid="files-upload-current"]')).not.toBeNull()
    expect(submit().disabled).toBe(true)

    await pickFile('site.zip')
    expect(bodyQuery('[data-testid="files-upload-filename"]')?.textContent).toBe('site.zip')
    expect(submit().disabled).toBe(false)

    submit().click()
    await flushPromises()

    expect(instanceApi.uploadVersionArchive).toHaveBeenCalledWith(7, expect.any(File), expect.objectContaining({ deployStaging: false }))
    expect(instanceApi.redeployUploadedArchive).toHaveBeenCalledWith(7, {
      remote_filepath: '/tmp/site.zip',
      deploy_staging: false,
    })
    expect(projectSourceApi.forgetProjectSource).toHaveBeenCalledWith(7)
    expect(bodyQuery('[data-testid="files-upload-submit"]')).toBeNull()
    expect(bodyQuery('[data-testid="files-upload-close"]')).not.toBeNull()
    // the deploy just started: it stays `running` from here, and the footer must still offer to stop it
    expect((bodyQuery('[data-testid="files-upload-cancel-deploy"]') as HTMLButtonElement).textContent).toBe('deployLogs.cancelDeploy')
    wrapper.unmount()
  })

  it('rejects a file of the wrong type in the dialog and leaves the selection empty', async () => {
    const wrapper = await mountModal()
    await pickFile('notes.txt')

    expect(bodyQuery('[data-testid="files-upload-filename"]')).toBeNull()
    expect(bodyQuery('[data-testid="files-upload-error"]')?.textContent).toContain('heading.instance.siteDetails.uploadVersion.invalidType')
    wrapper.unmount()
  })

  it('names the panel limit in the drop area and refuses a bigger archive before uploading it', async () => {
    const wrapper = await mountModal(makeInstance(), 5_242_880)

    // The kit's `t` returns the key: the message's size parameter is pinned in files-upload-version.test.ts.
    expect(bodyQuery('[data-testid="files-upload-modal"]')?.textContent).toContain('heading.instance.siteDetails.uploadVersion.dropZone.hint')

    await pickFile('site.zip', 5_242_881)
    expect(bodyQuery('[data-testid="files-upload-filename"]')).toBeNull()
    expect(bodyQuery('[data-testid="files-upload-error"]')?.textContent).toContain('heading.instance.siteDetails.uploadVersion.tooLarge')
    expect((bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement).disabled).toBe(true)

    // At the limit it goes through, and the refusal clears.
    await pickFile('site.zip', 5_242_880)
    expect(bodyQuery('[data-testid="files-upload-error"]')).toBeNull()
    expect(bodyQuery('[data-testid="files-upload-filename"]')?.textContent).toBe('site.zip')
    wrapper.unmount()
  })

  it('shows the panel 413 in the dialog with the limit instead of the nginx text', async () => {
    vi.mocked(instanceApi.uploadVersionArchive).mockRejectedValue(Object.assign(new Error('Request failed with status code 413'), {
      isAxiosError: true,
      response: { status: 413, data: {} },
    }))
    const wrapper = await mountModal(makeInstance(), 5_242_880)
    await pickFile('site.zip')
    ;(bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(bodyQuery('[data-testid="files-upload-error"]')?.textContent).toContain('heading.instance.siteDetails.uploadVersion.tooLarge')
    expect(instanceApi.redeployUploadedArchive).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts.some(alert => alert.success === false)).toBe(false)
    wrapper.unmount()
  })

  it('shows the API error in the dialog and stays on the form when the upload fails', async () => {
    vi.mocked(instanceApi.uploadVersionArchive).mockRejectedValue(new Error('boom'))
    const wrapper = await mountModal()
    await pickFile('site.tar.gz')
    ;(bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(instanceApi.redeployUploadedArchive).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="files-upload-submit"]')).not.toBeNull()
    expect(bodyQuery('[data-testid="files-upload-error"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('does not upload without the redeploy privilege', async () => {
    const wrapper = await mountModal(makeInstance(false))
    await pickFile('site.zip')
    ;(bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(instanceApi.uploadVersionArchive).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('takes a dropped archive, highlights the zone while dragging and clears the file with the row button', async () => {
    const wrapper = await mountModal()
    const zone = () => bodyQuery('[data-testid="files-upload-dropzone"]') as HTMLElement

    zoneEvent('dragenter')
    await flushPromises()
    expect(zone().classList.contains('drop-zone--active')).toBe(true)

    zoneEvent('drop', [new File(['x'], 'site.zip')])
    await flushPromises()
    expect(zone().classList.contains('drop-zone--active')).toBe(false)
    expect(bodyQuery('[data-testid="files-upload-filename"]')?.textContent).toBe('site.zip')

    ;(bodyQuery('[data-testid="files-upload-clear"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(bodyQuery('[data-testid="files-upload-filename"]')).toBeNull()
    expect((bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('opens the picker on a zone click and ignores clicks, drops and the row button while uploading', async () => {
    const pending: { resolve?: (path: string) => void } = {}
    vi.mocked(instanceApi.uploadVersionArchive).mockImplementation(() => new Promise<string>(resolve => {
      pending.resolve = resolve
    }))
    const wrapper = await mountModal()
    const click = vi.spyOn(fileInput(), 'click').mockReturnValue(undefined)

    ;(bodyQuery('[data-testid="files-upload-dropzone"]') as HTMLElement).click()
    expect(click).toHaveBeenCalledTimes(1)

    await pickFile('site.zip')
    ;(bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    ;(bodyQuery('[data-testid="files-upload-dropzone"]') as HTMLElement).click()
    expect(click).toHaveBeenCalledTimes(1)
    zoneEvent('drop', [new File(['x'], 'other.zip')])
    await flushPromises()
    expect(bodyQuery('[data-testid="files-upload-filename"]')?.textContent).toBe('site.zip')
    expect((bodyQuery('[data-testid="files-upload-clear"]') as HTMLButtonElement).disabled).toBe(true)

    pending.resolve?.('/tmp/site.zip')
    await flushPromises()
    wrapper.unmount()
  })

  // The X, Cancel and `persistent` of the card before and after it moves onto `BasicModal`.
  it('closes from the X in the form phase (kit-dialog-advanced)', async () => {
    const wrapper = await mountModal()

    ;(bodyQuery('[data-testid="files-upload-close-icon"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('hides the X, disables Cancel and keeps the dialog persistent while the upload runs (kit-dialog-advanced)', async () => {
    vi.mocked(instanceApi.uploadVersionArchive).mockReturnValue(new Promise(() => {}))
    const wrapper = await mountModal()
    await pickFile('site.zip')
    expect(wrapper.findComponent({ name: 'VDialog' }).props('persistent')).toBe(false)

    ;(bodyQuery('[data-testid="files-upload-submit"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('persistent')).toBe(true)
    expect(bodyQuery('[data-testid="files-upload-close-icon"]')).toBeNull()
    expect((bodyQuery('[data-testid="files-upload-cancel"]') as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })
})
