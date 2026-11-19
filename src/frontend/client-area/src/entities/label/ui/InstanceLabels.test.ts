import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
import type { VueWrapper } from '@vue/test-utils'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as labelsApi from '@/entities/label/labels.api'
import { useLabelsStore } from '@/entities/label/labels.store'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import InstanceLabels from './InstanceLabels.vue'

vi.mock('@/entities/label/labels.api', async importOriginal => {
  const actual = await importOriginal<typeof labelsApi>()
  return {
    ...actual,
    createLabel: vi.fn(),
    assignLabel: vi.fn(),
    unassignLabel: vi.fn(),
    deleteLabel: vi.fn(),
    clearLabelsCache: vi.fn(),
  }
})

/** The menu handlers are `<script setup>` functions; the tests call them through the instance. */
interface LabelsVm {
  addLabelError: string
  onAssignLabel: (label: LabelChipItem) => Promise<void>
  onUnassignLabel: (label: LabelChipItem) => Promise<void>
  onCreateLabel: (label: { title: string, color: string }) => Promise<void>
  onDeleteLabel: (label: LabelChipItem) => Promise<void>
}

const instance: InstanceResource = toInstanceResource({ id: 7, name: 'Site', url: 'https://site.example.com', status: 'active' })

function accountLabels (): LabelChipItem[] {
  return [
    { id: 1, title: 'Production', color: '#07C07E', in_use: false },
    { id: 2, title: 'Client', color: '#2F80ED', in_use: false },
  ]
}

let pinia: ReturnType<typeof createPinia>

async function mountLabels (labels: LabelChipItem[] = []): Promise<VueWrapper> {
  return mountKit(InstanceLabels, {
    props: { labels, instance },
    global: { plugins: [pinia] },
  })
}

function vmOf (wrapper: VueWrapper): LabelsVm {
  return wrapper.vm as unknown as LabelsVm
}

describe('InstanceLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)
    useLabelsStore().availableLabels = accountLabels()
  })

  describe('assign from the Assign panel', () => {
    it('a server error becomes an alert with its message and leaves in_use alone (decisions 1 and 2)', async () => {
      vi.mocked(labelsApi.assignLabel).mockRejectedValueOnce({ response: { data: { message: 'Label limit reached' } } })
      const labels: LabelChipItem[] = []
      const wrapper = await mountLabels(labels)

      await vmOf(wrapper).onAssignLabel(accountLabels()[0]!)

      expect(useAlertsStore().activeAlerts).toEqual([
        expect.objectContaining({ success: false, errorMessage: 'Label limit reached' }),
      ])
      expect(useLabelsStore().availableLabels[0]!.in_use).toBe(false)
      expect(labels).toEqual([])
      wrapper.unmount()
    })

    it('a success writes in_use and pushes the label into the array the store holds (legacy quirk, ported 1:1)', async () => {
      vi.mocked(labelsApi.assignLabel).mockResolvedValueOnce({ title: 'Production' })
      const labels: LabelChipItem[] = []
      const wrapper = await mountLabels(labels)
      const label = accountLabels()[0]!

      await vmOf(wrapper).onAssignLabel(label)

      expect(labelsApi.assignLabel).toHaveBeenCalledWith(7, label)
      expect(useLabelsStore().availableLabels[0]!.in_use).toBe(true)
      expect(labels).toEqual([label])
      expect(useAlertsStore().activeAlerts).toEqual([])
      wrapper.unmount()
    })
  })

  describe('unassign', () => {
    it('writes in_use from the answer and filters the local copy without touching the shared array', async () => {
      vi.mocked(labelsApi.unassignLabel).mockResolvedValueOnce({ title: 'Client', in_use: false })
      const shared = [{ title: 'Production', color: '#07C07E' }, { title: 'Client', color: '#2F80ED' }]
      const wrapper = await mountLabels(shared)
      const client = { title: 'Client', color: '#2F80ED' }
      useLabelsStore().availableLabels = [{ ...client, id: 2, in_use: true }]

      await vmOf(wrapper).onUnassignLabel(client)

      expect(labelsApi.unassignLabel).toHaveBeenCalledWith(7, client)
      expect(useLabelsStore().availableLabels[0]!.in_use).toBe(false)
      expect(shared).toHaveLength(2)
      wrapper.unmount()
    })

    it('a failure is an alert and nothing else changes', async () => {
      vi.mocked(labelsApi.unassignLabel).mockRejectedValueOnce({ response: { data: { message: 'Nope' } } })
      const wrapper = await mountLabels([{ title: 'Client', color: '#2F80ED' }])
      useLabelsStore().availableLabels = [{ id: 2, title: 'Client', color: '#2F80ED', in_use: true }]

      await vmOf(wrapper).onUnassignLabel({ title: 'Client', color: '#2F80ED' })

      expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Nope' })])
      expect(useLabelsStore().availableLabels[0]!.in_use).toBe(true)
      wrapper.unmount()
    })
  })

  describe('create', () => {
    it('adds the label to the account list, drops the cache and assigns it', async () => {
      vi.mocked(labelsApi.createLabel).mockResolvedValueOnce({ title: 'Archive', color: '#44B3D6' })
      vi.mocked(labelsApi.assignLabel).mockResolvedValueOnce({ title: 'Archive' })
      const labels: LabelChipItem[] = []
      const wrapper = await mountLabels(labels)
      const created = { title: 'Archive', color: '#44B3D6' }

      await vmOf(wrapper).onCreateLabel(created)

      expect(labelsApi.createLabel).toHaveBeenCalledWith(created)
      expect(useLabelsStore().availableLabels.map(label => label.title)).toEqual(['Production', 'Client', 'Archive'])
      expect(labelsApi.clearLabelsCache).toHaveBeenCalledTimes(1)
      expect(labelsApi.assignLabel).toHaveBeenCalledWith(7, created)
      expect(useLabelsStore().availableLabels[2]!.in_use).toBe(true)
      wrapper.unmount()
    })

    it('a create error stays inline in the Add panel and skips the cache drop and the assign', async () => {
      vi.mocked(labelsApi.createLabel).mockRejectedValueOnce({ response: { data: { message: 'Title taken' } } })
      const wrapper = await mountLabels([])

      await vmOf(wrapper).onCreateLabel({ title: 'Archive', color: '#44B3D6' })

      expect(vmOf(wrapper).addLabelError).toBe('Title taken')
      expect(labelsApi.clearLabelsCache).not.toHaveBeenCalled()
      expect(labelsApi.assignLabel).not.toHaveBeenCalled()
      expect(useAlertsStore().activeAlerts).toEqual([])
      wrapper.unmount()
    })
  })

  describe('delete from the account', () => {
    it('removes the label by id and drops the cache', async () => {
      vi.mocked(labelsApi.deleteLabel).mockResolvedValueOnce(undefined)
      const wrapper = await mountLabels([])

      await vmOf(wrapper).onDeleteLabel(accountLabels()[0]!)

      expect(labelsApi.deleteLabel).toHaveBeenCalledWith(accountLabels()[0])
      expect(useLabelsStore().availableLabels.map(label => label.id)).toEqual([2])
      expect(labelsApi.clearLabelsCache).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('a failure is an alert with the legacy delete copy and keeps the label and the cache', async () => {
      vi.mocked(labelsApi.deleteLabel).mockRejectedValueOnce({ response: { data: { message: 'In use' } } })
      const wrapper = await mountLabels([])

      await vmOf(wrapper).onDeleteLabel(accountLabels()[0]!)

      expect(useAlertsStore().activeAlerts).toEqual([
        expect.objectContaining({ success: false, errorMessage: 'notification.instance.label.delete.error' }),
      ])
      expect(useLabelsStore().availableLabels).toHaveLength(2)
      expect(labelsApi.clearLabelsCache).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })
})
