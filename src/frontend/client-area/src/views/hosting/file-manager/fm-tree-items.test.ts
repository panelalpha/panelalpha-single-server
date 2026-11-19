import type { FmTreeNode } from './file-manager.types'
import { describe, expect, it } from 'vitest'
import { buildTreeItems, pathToRootIds } from './fm-tree-items'

function dir (path: string) {
  return { type: 'dir' as const, path, basename: path.split('/').at(-1) ?? path, dirname: '', timestamp: 0 }
}

describe('buildTreeItems', () => {
  it('returns no items before the root is loaded', () => {
    expect(buildTreeItems({})).toEqual([])
  })

  it('marks an unloaded folder as lazy and a loaded folder without subfolders as a leaf', () => {
    const tree: Record<string, FmTreeNode> = {
      '': { children: [dir('a'), dir('b')], expanded: true, loaded: true },
      'a': { children: [dir('a/x')], expanded: true, loaded: true },
      'a/x': { children: [], expanded: false, loaded: true },
    }

    expect(buildTreeItems(tree)).toEqual([
      { id: 'a', title: 'a', children: [{ id: 'a/x', title: 'x', children: undefined }] },
      { id: 'b', title: 'b', children: [] },
    ])
  })
})

describe('pathToRootIds', () => {
  it('lists every folder on the way to the path', () => {
    expect(pathToRootIds('a/b/c')).toEqual(['a', 'a/b', 'a/b/c'])
    expect(pathToRootIds('')).toEqual([])
  })
})
