import type { FmDirectory, FmTreeNode } from './file-manager.types'
import { pathSegments, ROOT_PATH } from './fm-path'

/** One folder of the tree as `VTreeview` takes it. `children: []` marks a folder whose subfolders are not loaded yet. */
export interface FmTreeItem {
  id: string
  title: string
  children?: FmTreeItem[]
}

/**
 * Items of the folder tree from the store cache: the subfolders of `parent`, each with its loaded subfolders. A loaded folder
 * without subfolders is a leaf (`children` undefined), so `VTreeview` does not call `load-children` for it again.
 */
export function buildTreeItems (tree: Record<string, FmTreeNode>, parent: string = ROOT_PATH): FmTreeItem[] {
  const node = tree[parent]
  if (!node) {
    return []
  }
  return node.children.map(dir => toItem(dir, tree))
}

function toItem (dir: FmDirectory, tree: Record<string, FmTreeNode>): FmTreeItem {
  const node = tree[dir.path]
  let children: FmTreeItem[] | undefined
  if (!node?.loaded) {
    children = []
  } else if (node.children.length > 0) {
    children = node.children.map(child => toItem(child, tree))
  }
  return { id: dir.path, title: dir.basename, children }
}

/** Ids of the folders on the way to `path`, the folder itself included: they are opened in the tree. */
export function pathToRootIds (path: string): string[] {
  return pathSegments(path).map(segment => segment.path)
}
