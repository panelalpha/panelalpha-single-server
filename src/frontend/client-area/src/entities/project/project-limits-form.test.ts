import type { ProjectLimitValues } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { ceilingOf, memoryMinimum, needsRebuild, toBody, toForm, validateForm } from './project-limits-form'

const NONE: ProjectLimitValues = { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null }
const MB = 1024 * 1024

const LIMITS: ProjectLimitValues = {
  memory_limit: 2048,
  cpu_limit: 1.5,
  disk_space_limit: 10_240,
  inodes_limit: 500_000,
  device_read_bps: 50 * MB,
  device_write_bps: -1,
}

describe('toForm', () => {
  it('converts MB to GB and bytes a second to MB/s, and marks -1 as no limit', () => {
    const form = toForm(LIMITS)

    expect(form.memory_limit).toMatchObject({ raw: '2', unlimited: false })
    expect(form.cpu_limit).toMatchObject({ raw: '1.5', unlimited: false })
    expect(form.disk_space_limit).toMatchObject({ raw: '10', unlimited: false })
    expect(form.inodes_limit).toMatchObject({ raw: '500000', unlimited: false })
    expect(form.device_read_bps).toMatchObject({ raw: '50', unlimited: false })
    expect(form.device_write_bps).toMatchObject({ raw: '', unlimited: true })
  })

  it('treats a limit that is not set as no limit, except memory, which opens empty', () => {
    const form = toForm(NONE)

    expect(form.memory_limit).toMatchObject({ raw: '', unlimited: false })
    expect(form.cpu_limit.unlimited).toBe(true)
    expect(form.inodes_limit.unlimited).toBe(true)
    expect(validateForm(form, NONE, false).memory_limit).toEqual({ kind: 'required' })
  })

  it('opens an unlimited field at the ceiling when the plan sets one, so the form can be saved', () => {
    const ceilings = { ...NONE, disk_space_limit: 20_480, inodes_limit: 100_000 }
    const form = toForm({ ...LIMITS, disk_space_limit: -1, inodes_limit: null }, ceilings)

    expect(form.disk_space_limit).toMatchObject({ raw: '20', unlimited: false })
    expect(form.inodes_limit).toMatchObject({ raw: '100000', unlimited: false })
    expect(validateForm(form, ceilings, false)).toEqual({})
    expect(toBody(form, ceilings)).toMatchObject({ disk_space_limit: 20_480, inodes_limit: 100_000 })
  })
})

describe('toBody', () => {
  it('converts back to stored units with all six keys', () => {
    expect(toBody(toForm(LIMITS), NONE)).toEqual(LIMITS)
  })

  it('sends untouched fields as stored, not as the rounded text the field shows', () => {
    const odd: ProjectLimitValues = { ...LIMITS, memory_limit: 1000, disk_space_limit: 2047, device_read_bps: 5_000_000 }
    const form = toForm(odd)

    expect(form.memory_limit.raw).toBe('0.98')
    expect(toBody(form, NONE)).toEqual(odd)
  })

  it('converts a field again once it is edited, also when it is typed back to its first text', () => {
    const form = toForm({ ...LIMITS, memory_limit: 1000 })
    form.memory_limit.raw = '1'

    expect(toBody(form, NONE).memory_limit).toBe(1024)
    form.memory_limit.raw = '0.98'
    expect(toBody(form, NONE).memory_limit).toBe(1000)
  })

  it('accepts a decimal comma and rounds whole fields', () => {
    const form = toForm(LIMITS)
    form.cpu_limit.raw = '0,25'
    form.memory_limit.raw = '1.5'
    form.disk_space_limit.raw = '0.0001'

    const body = toBody(form, NONE)
    expect(body.cpu_limit).toBe(0.25)
    expect(body.memory_limit).toBe(1536)
    expect(body.disk_space_limit).toBe(0)
  })

  it('sends -1 for a field with no limit, whatever text is left in it', () => {
    const form = toForm(LIMITS)
    form.cpu_limit = { raw: '3', unlimited: true }

    expect(toBody(form, NONE).cpu_limit).toBe(-1)
  })
})

describe('validateForm', () => {
  it('passes the current values', () => {
    expect(validateForm(toForm(LIMITS), NONE, false)).toEqual({})
  })

  it('asks for a value and refuses unreadable text', () => {
    const form = toForm(LIMITS)
    form.memory_limit.raw = ''
    form.cpu_limit.raw = 'abc'

    const errors = validateForm(form, NONE, false)
    expect(errors.memory_limit).toEqual({ kind: 'required' })
    expect(errors.cpu_limit).toEqual({ kind: 'required' })
  })

  it('refuses text that Number() reads but is not a plain decimal, so Infinity is never sent as null', () => {
    for (const text of ['Infinity', '1e400', '1e3', '0x10', '1.2.3']) {
      const form = toForm(LIMITS)
      form.inodes_limit.raw = text

      expect(validateForm(form, NONE, false).inodes_limit).toEqual({ kind: 'required' })
    }
  })

  it('keeps memory at 6 MB, or 256 MB for a container project', () => {
    const form = toForm(LIMITS)
    form.memory_limit.raw = '0.1'

    expect(validateForm(form, NONE, false).memory_limit).toBeUndefined()
    expect(validateForm(form, NONE, true).memory_limit).toEqual({ kind: 'min', value: 256, unit: 'MB' })
    expect(memoryMinimum(false)).toBe(6)
    form.memory_limit.raw = '0.001'
    expect(validateForm(form, NONE, false).memory_limit).toEqual({ kind: 'min', value: 6, unit: 'MB' })
  })

  it('refuses a negative value and 0, the minimum is 1', () => {
    for (const text of ['-5', '0']) {
      const form = toForm(LIMITS)
      form.inodes_limit.raw = text

      expect(validateForm(form, NONE, false).inodes_limit).toEqual({ kind: 'min', value: 1, unit: 'files' })
    }
  })

  it('refuses values above the backend maximum, CPU above 1024 cores', () => {
    const form = toForm(LIMITS)
    form.cpu_limit.raw = '1025'
    form.inodes_limit.raw = '2147483648'

    const errors = validateForm(form, NONE, false)
    expect(errors.cpu_limit).toEqual({ kind: 'max', value: 1024, unit: 'cores' })
    expect(errors.inodes_limit).toEqual({ kind: 'max', value: 2_147_483_647, unit: 'files' })
    form.cpu_limit.raw = '1024'
    form.inodes_limit.raw = '2147483647'
    expect(validateForm(form, NONE, false)).toEqual({})
  })

  it('accepts a CPU from 0.01 to 1024 cores and refuses less', () => {
    const form = toForm(LIMITS)
    for (const text of ['0.01', '0.5', '1024']) {
      form.cpu_limit.raw = text
      expect(validateForm(form, NONE, false).cpu_limit).toBeUndefined()
    }
    form.cpu_limit.raw = '0.001'
    expect(validateForm(form, NONE, false).cpu_limit).toEqual({ kind: 'min', value: 0.01, unit: 'cores' })
    form.cpu_limit.raw = '0'
    expect(validateForm(form, NONE, false).cpu_limit).toEqual({ kind: 'min', value: 0.01, unit: 'cores' })
  })

  it('opens a stored 0.5 core and saves it untouched', () => {
    const form = toForm({ ...LIMITS, cpu_limit: 0.5 })

    expect(form.cpu_limit).toMatchObject({ raw: '0.5', unlimited: false })
    expect(validateForm(form, NONE, false)).toEqual({})
    expect(toBody(form, NONE).cpu_limit).toBe(0.5)
  })

  it('states the minimum of disk and disk speed in a unit that is not 0', () => {
    const form = toForm(LIMITS)
    form.disk_space_limit.raw = '0'
    form.device_read_bps.raw = '0'
    form.device_write_bps.raw = '0'
    form.device_read_bps.unlimited = false
    form.device_write_bps.unlimited = false

    const errors = validateForm(form, NONE, false)
    expect(errors.disk_space_limit).toEqual({ kind: 'min', value: 1, unit: 'MB' })
    expect(errors.device_read_bps).toEqual({ kind: 'min', value: 1, unit: 'B/s' })
    expect(errors.device_write_bps).toEqual({ kind: 'min', value: 1, unit: 'B/s' })
  })

  it('accepts a fraction of a core of at least 1', () => {
    const form = toForm(LIMITS)
    form.cpu_limit.raw = '1.5'

    expect(validateForm(form, NONE, false).cpu_limit).toBeUndefined()
  })

  it('opens a stored 0 as no limit and sends -1 for it', () => {
    const form = toForm({ ...LIMITS, cpu_limit: 0, device_read_bps: 0 })

    expect(form.cpu_limit).toMatchObject({ raw: '', unlimited: true })
    expect(form.device_read_bps).toMatchObject({ raw: '', unlimited: true })
    expect(toBody(form, NONE)).toMatchObject({ cpu_limit: -1, device_read_bps: -1 })
  })

  it('refuses a value above a numeric ceiling, in the unit of the field', () => {
    const form = toForm(LIMITS)
    form.memory_limit.raw = '4'
    form.device_read_bps.raw = '80'

    const errors = validateForm(form, { ...NONE, memory_limit: 2048, device_read_bps: 60 * MB }, false)
    expect(errors.memory_limit).toEqual({ kind: 'max', value: 2, unit: 'GB' })
    expect(errors.device_read_bps).toEqual({ kind: 'max', value: 60, unit: 'MB/s' })
  })

  it('passes a stored value equal to a ceiling that is not a whole GB, untouched or typed as the hint shows it', () => {
    const ceilings = { ...NONE, memory_limit: 2047 }
    const form = toForm({ ...LIMITS, memory_limit: 2047 }, ceilings)

    expect(form.memory_limit.raw).toBe('2')
    expect(validateForm(form, ceilings, false)).toEqual({})
    expect(toBody(form, ceilings).memory_limit).toBe(2047)

    const lower = toForm({ ...LIMITS, memory_limit: 1024 }, ceilings)
    lower.memory_limit.raw = '2'
    expect(validateForm(lower, ceilings, false)).toEqual({})
    expect(toBody(lower, ceilings).memory_limit).toBe(2047)

    lower.memory_limit.raw = '2.01'
    expect(validateForm(lower, ceilings, false).memory_limit).toEqual({ kind: 'max', value: 2, unit: 'GB' })
  })

  it('does not check a field that has no limit', () => {
    const form = toForm(LIMITS)
    form.device_write_bps = { raw: '', unlimited: true }

    expect(validateForm(form, { ...NONE, device_write_bps: 10 * MB }, false).device_write_bps).toBeUndefined()
  })
})

describe('ceilingOf', () => {
  it('is a number only for a real ceiling', () => {
    expect(ceilingOf(1024)).toBe(1024)
    expect(ceilingOf(null)).toBeNull()
    expect(ceilingOf(-1)).toBe(null)
  })
})

describe('needsRebuild', () => {
  const body = (changes: Partial<ProjectLimitValues> = {}) => toBody(toForm({ ...LIMITS, ...changes }), NONE)

  it('is false when nothing changed', () => {
    expect(needsRebuild(LIMITS, body(), false)).toBe(false)
  })

  it('is false when 0 became -1', () => {
    expect(needsRebuild({ ...LIMITS, cpu_limit: 0 }, body({ cpu_limit: 0 }), false)).toBe(false)
  })

  it('is true when a limit other than memory changed', () => {
    expect(needsRebuild(LIMITS, { ...body(), cpu_limit: 2 }, true)).toBe(true)
    expect(needsRebuild(LIMITS, { ...body(), disk_space_limit: -1 }, true)).toBe(true)
  })

  it('is true for a memory change on a classic project and false on a container project', () => {
    expect(needsRebuild(LIMITS, { ...body(), memory_limit: 4096 }, false)).toBe(true)
    expect(needsRebuild(LIMITS, { ...body(), memory_limit: 4096 }, true)).toBe(false)
  })
})
