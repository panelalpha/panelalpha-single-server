import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import {
  acceptFile,
  applyUploadSource,
  buildArchiveRedeployPayload,
  canOpenFilePicker,
  canSubmitUpload,
  captureUploadSubmit,
  changeUploadTarget,
  clearFile,
  createUploadVersionForm,
  currentLineKey,
  dragEnter,
  dragLeave,
  dragOver,
  dropFile,
  effectiveDeployStaging,
  finishUpload,
  isAllowedArchive,
  mapUploadError,
  newestFilesStaging,
  showUploadStagingCheckbox,
  unlockUpload,
  uploadDeploySteps,
  uploadedDate,
  uploadedSize,
  uploadPercent,
  uploadTargetId,
} from './files-upload-version'

function file (name: string, size = 10) {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

function filesStaging (id: number, type = 'custom', sourceType = 'files') {
  return { id, type, source: { type: sourceType } } as unknown as InstanceResource
}

function instance (extra: Record<string, unknown> = {}) {
  return { id: 1, source: null, details: {}, subInstances: [], parentInstance: null, ...extra } as unknown as InstanceResource
}

describe('files-upload-version current line', () => {
  it('passes the raw finished_at of the last deploy (the modal formats it with the session format)', () => {
    const iso = new Date(2026, 2, 5, 10).toISOString()
    expect(uploadedDate(instance())).toBe('')
    expect(uploadedDate(instance({ source: { last_deploy: { finished_at: iso } } }))).toBe(iso)
  })

  it('formats the size without decimals and drops missing, zero and non-numeric values', () => {
    expect(uploadedSize(instance({ details: { archive_size: 1536 } }))).toBe('2 KB')
    expect(uploadedSize(instance({ details: { archive_size: 0 } }))).toBe('')
    expect(uploadedSize(instance({ details: { archive_size: '' } }))).toBe('')
    expect(uploadedSize(instance({ details: { archive_size: 'abc' } }))).toBe('')
    expect(uploadedSize(instance({ details: null }))).toBe('')
  })

  it('picks the key by what is known', () => {
    const date = { source: { last_deploy: { finished_at: new Date(2026, 0, 2, 10).toISOString() } } }
    const size = { details: { archive_size: 2048 } }
    expect(currentLineKey(instance({ ...date, ...size }))).toBe('heading.instance.siteDetails.uploadVersion.current')
    expect(currentLineKey(instance(date))).toBe('heading.instance.siteDetails.uploadVersion.currentDate')
    expect(currentLineKey(instance(size))).toBe('heading.instance.siteDetails.uploadVersion.currentSize')
    expect(currentLineKey(instance())).toBe('')
  })
})

describe('files-upload-version staging', () => {
  it('takes the newest staging only when it is a custom project with a files source', () => {
    const inst = instance({ subInstances: [filesStaging(2), filesStaging(5)] })
    expect(newestFilesStaging(inst)?.id).toBe(5)
    expect(showUploadStagingCheckbox(inst)).toBe(true)
    expect(showUploadStagingCheckbox(instance({ subInstances: [filesStaging(5, 'custom', 'git')] }))).toBe(false)
    expect(showUploadStagingCheckbox(instance({ subInstances: [filesStaging(5, 'wordpress')] }))).toBe(false)
    expect(showUploadStagingCheckbox(instance())).toBe(false)
  })

  it('has no staging for a staging project itself', () => {
    expect(newestFilesStaging(instance({ parentInstance: { id: 9 }, subInstances: [filesStaging(5)] }))).toBeNull()
  })

  it('counts the staging option only when the checkbox is shown', () => {
    const form = createUploadVersionForm()
    form.deployStaging = true
    expect(effectiveDeployStaging(form, instance())).toBe(false)
    expect(effectiveDeployStaging(form, instance({ subInstances: [filesStaging(5)] }))).toBe(true)
  })
})

describe('files-upload-version file handling', () => {
  it('allows only .zip and .tar.gz, case-insensitive', () => {
    expect(isAllowedArchive(file('a.ZIP'))).toBe(true)
    expect(isAllowedArchive(file('a.tar.gz'))).toBe(true)
    expect(isAllowedArchive(file('a.gz'))).toBe(false)
    expect(isAllowedArchive(file('a.sql'))).toBe(false)
    expect(isAllowedArchive(null)).toBe(false)
  })

  it('accepts a valid file and refuses a wrong type or a file over the panel limit, keeping the old selection', () => {
    const form = createUploadVersionForm()
    const limit = 268_435_456
    expect(acceptFile(form, null, limit)).toEqual({ accepted: false, errorKey: null })
    expect(acceptFile(form, file('a.zip'), limit)).toEqual({ accepted: true })
    const first = form.selectedFile
    expect(acceptFile(form, file('b.txt'), limit)).toEqual({ accepted: false, errorKey: 'heading.instance.siteDetails.uploadVersion.invalidType' })
    expect(acceptFile(form, file('c.zip', limit + 1), limit)).toEqual({
      accepted: false,
      errorKey: 'heading.instance.siteDetails.uploadVersion.tooLarge',
      errorParams: { size: '256 MB' },
    })
    expect(form.selectedFile).toBe(first)
    expect(acceptFile(form, file('d.zip', limit), limit)).toEqual({ accepted: true })
    // The limit is the panel's, not a copy: a panel that takes 1 GiB takes a 300 MB archive.
    expect(acceptFile(createUploadVersionForm(), file('e.zip', 314_572_800), 1_073_741_824)).toEqual({ accepted: true })
  })

  it('names the panel limit, not the body text of the 413, when the panel refuses the upload', () => {
    const tooLarge = Object.assign(new Error('Request failed with status code 413'), {
      isAxiosError: true,
      response: { status: 413, data: { message: 'The uploaded file is too large.' } },
    })
    expect(mapUploadError(tooLarge, 268_435_456)).toEqual({
      message: '',
      fallbackKey: 'heading.instance.siteDetails.uploadVersion.tooLarge',
      params: { size: '256 MB' },
    })
    const failed = Object.assign(new Error('Request failed with status code 422'), {
      isAxiosError: true,
      response: { status: 422, data: { message: 'This project has no directory an archive deploy can read.' } },
    })
    expect(mapUploadError(failed, 268_435_456).message).toBe('This project has no directory an archive deploy can read.')
  })

  it('clears the file only while not submitting', () => {
    const form = createUploadVersionForm()
    form.selectedFile = file('a.zip')
    form.submitting = true
    expect(clearFile(form)).toBe(false)
    expect(canOpenFilePicker(form)).toBe(false)
    form.submitting = false
    expect(clearFile(form)).toBe(true)
    expect(form.selectedFile).toBeNull()
    expect(canOpenFilePicker(form)).toBe(true)
  })

  it('resolves the deploy target: the newest files staging when staging is on, else the project', () => {
    const inst = instance({ id: 1, subInstances: [filesStaging(2), filesStaging(5)] })
    expect(uploadTargetId(inst, false)).toBe(1)
    expect(uploadTargetId(inst, true)).toBe(5)
    expect(uploadTargetId(instance({ id: 1 }), true)).toBe(1)
  })

  it('ignores a source answer of another target and drops the skipped steps on a target change', () => {
    const form = createUploadVersionForm()
    const inst = instance({ id: 1, subInstances: [filesStaging(5)] })
    const source = { available: true, deploy_steps: { build: { commands: ['npm run build'], skippable: true } } } as never
    applyUploadSource(form, inst, 5, source)
    expect(form.targetSource).toBeNull()
    applyUploadSource(form, inst, 1, source)
    expect(uploadDeploySteps(form)).toEqual({ build: { commands: ['npm run build'], skippable: true } })
    form.skippedSteps = ['build']
    changeUploadTarget(form, true)
    expect(form).toMatchObject({ deployStaging: true, skippedSteps: [], targetSource: null })
    expect(uploadDeploySteps(form)).toBeNull()
  })

  it('keeps the drag highlight until the depth counter reaches zero', () => {
    const form = createUploadVersionForm()
    dragEnter(form)
    dragEnter(form)
    dragLeave(form)
    expect(form.isDragOver).toBe(true)
    dragLeave(form)
    dragLeave(form)
    expect(form).toMatchObject({ isDragOver: false, dragDepth: 0 })
    dragOver(form)
    expect(form.isDragOver).toBe(true)
  })

  it('resets the highlight on drop and returns the first file unless submitting', () => {
    const form = createUploadVersionForm()
    dragEnter(form)
    const a = file('a.zip')
    expect(dropFile(form, [a, file('b.zip')])).toBe(a)
    expect(form).toMatchObject({ isDragOver: false, dragDepth: 0 })
    expect(dropFile(form, [])).toBeNull()
    form.submitting = true
    expect(dropFile(form, [a])).toBeNull()
  })
})

describe('files-upload-version submit', () => {
  it('needs a file, no submit in flight, no running deploy and the form phase', () => {
    const form = createUploadVersionForm()
    expect(canSubmitUpload(form, instance(), 'form')).toBe(false)
    form.selectedFile = file('a.zip')
    expect(canSubmitUpload(form, instance(), 'form')).toBe(true)
    expect(canSubmitUpload(form, instance(), 'logs')).toBe(false)
    expect(canSubmitUpload(form, instance({ source: { last_deploy: { status: 'running' } } }), 'form')).toBe(false)
    // A files project the panel created and left before uploading: the Engine's create deploy waits for the archive.
    expect(canSubmitUpload(form, instance({ source: { last_deploy: { status: 'running', waiting_for_files: true } } }), 'form')).toBe(true)
    expect(canSubmitUpload(form, instance({ source: { last_deploy: { status: 'finished' } } }), 'form')).toBe(true)
    form.submitting = true
    expect(canSubmitUpload(form, instance(), 'form')).toBe(false)
  })

  it('builds the redeploy body from the upload answer and the effective staging option, without a mode', () => {
    const form = createUploadVersionForm()
    form.deployStaging = true
    expect(buildArchiveRedeployPayload(captureUploadSubmit(form, instance()), '/tmp/a.zip')).toEqual({ remote_filepath: '/tmp/a.zip', deploy_staging: false })
    expect(buildArchiveRedeployPayload(captureUploadSubmit(form, instance({ subInstances: [filesStaging(3)] })), '/tmp/a.zip').deploy_staging).toBe(true)
  })

  it('sends skip only for the unchecked skippable categories of the target', () => {
    const form = createUploadVersionForm()
    form.targetSource = {
      available: true,
      deploy_steps: {
        dependencies: { commands: ['npm install'], skippable: true },
        build: { commands: ['npm run build'], skippable: true },
        migrations: { commands: ['npm run migrate'], skippable: false },
      },
    } as never
    form.skippedSteps = ['build', 'migrations']
    expect(buildArchiveRedeployPayload(captureUploadSubmit(form, instance()), '/tmp/a.zip')).toEqual({ remote_filepath: '/tmp/a.zip', deploy_staging: false, skip: ['build'] })
    form.skippedSteps = []
    expect(buildArchiveRedeployPayload(captureUploadSubmit(form, instance()), '/tmp/a.zip')).not.toHaveProperty('skip')
  })

  it('keeps the options read before the upload when the form changes during it', () => {
    const form = createUploadVersionForm()
    form.deployStaging = true
    const submit = captureUploadSubmit(form, instance({ subInstances: [filesStaging(3)] }))
    form.skippedSteps = ['build']
    form.deployStaging = false
    expect(buildArchiveRedeployPayload(submit, '/tmp/a.zip')).toEqual({ remote_filepath: '/tmp/a.zip', deploy_staging: true })
  })

  it('computes the percent and keeps the previous one without a total', () => {
    expect(uploadPercent({ loaded: 1, total: 3 }, null)).toBe(33)
    expect(uploadPercent({ loaded: 5 }, 40)).toBe(40)
    expect(uploadPercent({ loaded: 5, total: 0 }, null)).toBeNull()
  })

  it('maps errors to the API message with the in-progress or failed key as fallback', () => {
    expect(mapUploadError({ response: { status: 409, data: { message: 'busy' } } }, 268_435_456)).toEqual({
      message: 'busy',
      fallbackKey: 'notification.instance.files.redeploy.inProgress',
    })
    expect(mapUploadError(new Error('x'), 268_435_456).fallbackKey).toBe('notification.instance.files.redeploy.failed')
  })

  it('finishes the upload: unlocks the form unless the logs started and always drops the progress', () => {
    const form = createUploadVersionForm()
    form.submitting = true
    form.uploadPercent = 50
    finishUpload(form, 'logs')
    expect(form).toMatchObject({ submitting: true, uploadPercent: null })
    finishUpload(form, 'form')
    expect(form.submitting).toBe(false)
    form.submitting = true
    unlockUpload(form)
    expect(form.submitting).toBe(false)
  })
})
