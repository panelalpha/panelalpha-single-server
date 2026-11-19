import { describe, expect, it } from 'vitest'
import { type InstanceResource, toInstanceResource } from '@/entities/project/instance-resource'
import { buildTableItems, sortSubinstances } from './use-custom-table-page'

function resource (id: number, overrides: Record<string, unknown> = {}): InstanceResource {
  return toInstanceResource({ id, name: `Site ${id}`, url: `https://site-${id}.example.com`, status: 'active', ...overrides })
}

describe('buildTableItems', () => {
  it('makes the item itself the first sub-instance of its group (the main row)', () => {
    const [group] = buildTableItems([resource(1)])
    expect(group!.id).toBe(1)
    expect(group!.subInstances.map(sub => sub.id)).toEqual([1])
    expect(group!.subInstances[0]!.subInstances).toEqual([])
  })

  it('follows the main row with the staging apps (the sub-rows)', () => {
    const parent = resource(1, { staging_apps: [{ id: 11, name: 'Staging', url: 'https://staging.example.com', staging: true, status: 'active' }] })
    const [group] = buildTableItems([parent])
    expect(group!.subInstances.map(sub => sub.id)).toEqual([1, 11])
    expect(group!.subInstances[1]!.subinstanceLabel).toBe('staging')
  })

  it('skips an app already seen, keeps the methods the cells call and leaves the source untouched', () => {
    const parent = resource(1)
    parent.subInstances = [resource(1), resource(2)]
    const [group] = buildTableItems([parent])
    expect(group!.subInstances.map(sub => sub.id)).toEqual([1, 2])
    expect(group!.subInstances[1]!.hasInstallFailed()).toBe(false)
    expect(parent.subInstances.map(sub => sub.id)).toEqual([1, 2])
  })
})

describe('sortSubinstances', () => {
  function group () {
    const [built] = buildTableItems([resource(1)])
    built!.subInstances = [resource(1), resource(3, { name: 'B' }), resource(2, { name: 'A' })]
    return built!
  }

  it('leaves a group with a single row as it is', () => {
    const [built] = buildTableItems([resource(1)])
    expect(sortSubinstances([built!], { text: 'Title' }, false)[0]).toBe(built)
  })

  it('sorts the sub-rows by title, never the main row', () => {
    const [sorted] = sortSubinstances([group()], { text: 'Title' }, false)
    expect(sorted!.subInstances.map(sub => sub.id)).toEqual([1, 2, 3])
    const [desc] = sortSubinstances([group()], { text: 'Title' }, true)
    expect(desc!.subInstances.map(sub => sub.id)).toEqual([1, 3, 2])
  })

  it('keeps the API order for the real header keys (legacy compares the capitalised "Title" / "Status")', () => {
    const [sorted] = sortSubinstances([group()], { text: 'name' }, false)
    expect(sorted!.subInstances.map(sub => sub.id)).toEqual([1, 3, 2])
  })
})
