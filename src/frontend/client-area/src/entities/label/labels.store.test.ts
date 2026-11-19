import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as labelsApi from './labels.api'
import { useLabelsStore } from './labels.store'

vi.mock('./labels.api', async importOriginal => {
  const actual: typeof labelsApi = await importOriginal()
  return {
    ...actual,
    getLabels: vi.fn(),
  }
})

describe('useLabelsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadLabels stores the labels and ignores a failure', async () => {
    const store = useLabelsStore()
    vi.mocked(labelsApi.getLabels).mockResolvedValueOnce([{ title: 'Prod', color: '#fff' }])
    await store.loadLabels()
    expect(store.availableLabels).toEqual([{ title: 'Prod', color: '#fff' }])

    vi.mocked(labelsApi.getLabels).mockRejectedValueOnce(new Error('nope'))
    await store.loadLabels()
    expect(store.availableLabels).toEqual([{ title: 'Prod', color: '#fff' }])
  })

  describe('account labels', () => {
    it('updateLabelInUse changes only the label it is given', () => {
      const store = useLabelsStore()
      store.availableLabels = [
        { id: 1, title: 'Prod', color: '#fff', in_use: false },
        { id: 2, title: 'Client', color: '#000', in_use: false },
      ]

      store.updateLabelInUse({ id: 1, title: 'Prod', color: '#fff' }, true)

      expect(store.availableLabels.map(label => label.in_use)).toEqual([true, false])
    })

    it('updateLabelInUse writes in place, so an object held elsewhere (the cached answer) follows', () => {
      const store = useLabelsStore()
      const cached = { title: 'Prod', color: '#fff', in_use: false }
      store.availableLabels = [cached]

      store.updateLabelInUse({ title: 'Prod', color: '#fff' }, true)

      expect(cached.in_use).toBe(true)
    })

    it('removeUserLabel removes by id and keeps the other labels', () => {
      const store = useLabelsStore()
      store.availableLabels = [
        { id: 1, title: 'Prod', color: '#fff' },
        { id: 2, title: 'Prod', color: '#fff' },
        { id: 3, title: 'Client', color: '#000' },
      ]

      store.removeUserLabel({ id: 2, title: 'Prod', color: '#fff' })

      expect(store.availableLabels.map(label => label.id)).toEqual([1, 3])
    })

    it('addUserLabel appends a new array, leaving the previous one untouched', () => {
      const store = useLabelsStore()
      const before = [{ title: 'Prod', color: '#fff' }]
      store.availableLabels = before

      store.addUserLabel({ title: 'Client', color: '#000' })

      expect(store.availableLabels.map(label => label.title)).toEqual(['Prod', 'Client'])
      expect(before).toHaveLength(1)
    })
  })
})
