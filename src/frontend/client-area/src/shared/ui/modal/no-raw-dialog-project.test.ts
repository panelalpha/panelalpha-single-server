// Contract test: the modals of the project pages (`src/views/projects/**`) are the kit `AppDialog`, and the cards
// this change moved onto the kit card are `BasicModal`. Legacy wrote a dialog with its own overlay, X and buttons in every page; a new modal
// written that way would bring the copies back. The two top bar modals wait for their own change.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const ROOT = join(SRC, '..')
const PROJECTS = join(SRC, 'views', 'projects')
const WAITING = new Set([
  join(PROJECTS, 'project', 'topbar', 'ReportProviderTrackingCodeModal.vue'),
  join(PROJECTS, 'project', 'topbar', 'SetYourDomainModal.vue'),
])
// The Read more card is the kit `ReadMoreModal`: a `v-card` with its own status frame, not `BasicModal`.
const CARDS = [
  'views/projects/project/advanced/developer-settings/PhpVersionModal.vue',
  'views/projects/project/advanced/developer-settings/PhpSettingsModal.vue',
  'views/projects/project/general/modals/GitRedeployModal.vue',
  'views/projects/project/general/modals/FilesUploadVersionModal.vue',
].map(path => join(SRC, ...path.split('/')))

function walk (directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walk(path)
    }
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

const label = (path: string): string => relative(ROOT, path).split(sep).join('/')

describe('project page modals use the kit dialog (kit-dialog-advanced)', () => {
  it('has no raw dialog under src/views/projects outside the waiting top bar modals', () => {
    const offenders = walk(PROJECTS)
      .filter(path => !WAITING.has(path) && /<v-dialog\b/.test(readFileSync(path, 'utf8')))
      .map(path => label(path))
    expect(offenders).toEqual([])
  })

  it('leaves the mobile scroll lock of a project page modal to AppDialog', () => {
    const offenders = walk(PROJECTS)
      .filter(path => {
        const source = readFileSync(path, 'utf8')
        return /<AppDialog\b/.test(source) && /useMobileScrollLock\(/.test(source)
      })
      .map(path => label(path))
    expect(offenders).toEqual([])
  })

  it.each(CARDS.map(path => [label(path), path]))('%s draws its card with BasicModal', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).toMatch(/<BasicModal\b/)
    expect(source).not.toMatch(/<v-card\b/)
    expect(source).not.toMatch(/<v-card-title\b/)
  })

  it('still finds the waiting top bar modals as raw dialogs (the list is not stale)', () => {
    for (const path of WAITING) {
      expect(readFileSync(path, 'utf8')).toMatch(/<v-dialog\b/)
    }
  })
})
