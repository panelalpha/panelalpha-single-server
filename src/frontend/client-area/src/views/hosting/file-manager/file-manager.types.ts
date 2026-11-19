// Types of the File Manager API.
// Paths are relative to the disk root, without a leading slash; '' is the home directory.

export type FmItemType = 'dir' | 'file'

export interface FmDirectory {
  type: 'dir'
  path: string
  basename: string
  dirname: string
  timestamp: number
}

export interface FmFile {
  type: 'file'
  path: string
  basename: string
  dirname: string
  filename: string
  extension: string
  size: number
  timestamp: number
}

export interface FmConfig {
  /** Bytes; the sum of the files of one upload request must not exceed it. */
  uploadMaxFilesize: number
  /** Actions the account cannot run, e.g. `zip` on WP Cloud. */
  unsupportedActions: string[]
}

export interface FmContent {
  directories: FmDirectory[]
  files: FmFile[]
}

/** A reference to one item, as the delete endpoint takes it. */
export interface FmItemRef {
  type: FmItemType
  path: string
}

/** Selected paths per type. */
export interface FmSelection {
  directories: string[]
  files: string[]
}

/** A file written back into a folder (the text editor and the image crop): the folder, the file name and the content. */
export interface FmFileWrite {
  dir: string
  name: string
  blob: Blob
}

export interface FmClipboard extends FmSelection {
  type: 'copy' | 'cut'
}

export interface FmTreeNode {
  children: FmDirectory[]
  expanded: boolean
  loaded: boolean
}

export type FmView = 'table' | 'grid'

/** The modals of the File Manager: one is open at a time. */
export type FmModal = 'newFile' | 'newFolder' | 'upload' | 'clipboard' | 'delete' | 'rename' | 'zip' | 'unzip' | 'status' | 'editor' | 'audioPlayer' | 'videoPlayer'
