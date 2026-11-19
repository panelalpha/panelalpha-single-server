// Contract test: both share dialogs (the project share dialog and the onboarding
// share step) build the invite form and the access table from the shared parts, and the dialog is the kit `AppDialog` + `BasicModal`.
// A raw combobox, a hand-built access grid or a copied SCSS sheet in one of them would bring back the two copies of legacy.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', '..')
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')

const DIALOGS = {
  'entities/project/ui/ShareInstanceModal.vue': read('entities/project/ui/ShareInstanceModal.vue'),
  'views/onboarding/modals/OnboardingShareAccessModal.vue': read('views/onboarding/modals/OnboardingShareAccessModal.vue'),
}

describe('share dialogs keep the share kit', () => {
  it.each(Object.entries(DIALOGS))('%s uses ShareInviteForm and ShareAccessTable, not its own combobox, grid or sheet', (_path, source) => {
    expect(source).toMatch(/<ShareInviteForm\b/)
    expect(source).toMatch(/<ShareAccessTable\b/)
    expect(source).not.toMatch(/<v-combobox\b|<VCombobox\b/)
    expect(source).not.toMatch(/InstanceShareItem|share-access-table__|invite-form__|invite-users-role/)
    expect(source).not.toMatch(/<style[^>]*\ssrc=/)
  })

  it('the project share dialog is AppDialog with BasicModal cards, no raw v-dialog', () => {
    const modal = DIALOGS['entities/project/ui/ShareInstanceModal.vue']
    expect(modal).toMatch(/<AppDialog\b/)
    expect(modal).toMatch(/<BasicModal\b/)
    expect(modal).not.toMatch(/<v-dialog\b|<v-card\b/)
    expect(read('entities/project/ui/ShareCustomPrivileges.vue')).toMatch(/<BasicModal\b/)
  })

  it('the access table is the kit DataTable', () => {
    const table = read('entities/project/ui/ShareAccessTable.vue')
    expect(table).toMatch(/<DataTable\b/)
    expect(table).toMatch(/<MobileTableField\b/)
  })
})
