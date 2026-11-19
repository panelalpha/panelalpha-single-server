import type { FakeBackupsBackend } from './fake-backups-api'
import type { FakeBackend } from './fake-file-manager-api'
import type { FakeTasksBackend } from './fake-tasks-api'
import type { FakeWizardBackend } from './fake-wizard-api'
import { test as base } from '@playwright/test'
import { installFakeBackupsBackend } from './fake-backups-api'
import { installFakeBackend } from './fake-file-manager-api'
import { installFakeTasksBackend } from './fake-tasks-api'
import { installFakeWizardBackend } from './fake-wizard-api'

export { expect } from '@playwright/test'

/** The first-run wizard specs (`e2e/admin-wizard*.spec.ts`, `e2e/admin-wizard/*.spec.ts`) use the wizard fake, the rest the File Manager fake. */
const isWizardSpec = (file: string): boolean => /[\\/]admin-wizard[^\\/]*\.spec\.ts$|[\\/]admin-wizard[\\/][^\\/]+\.spec\.ts$/.test(file)

/** The Backups page of a custom project (`e2e/project-backups-custom*.spec.ts`) uses its own fake. */
const isBackupsSpec = (file: string): boolean => /[\\/]project-backups-custom[^\\/]*\.spec\.ts$/.test(file)

/** The Tasks screen (`e2e/tasks.visual*.spec.ts`) uses its own fake. */
const isTasksSpec = (file: string): boolean => /[\\/]tasks\.visual[^\\/]*\.spec\.ts$/.test(file)

// Every test runs against its own fake backend, installed before the first navigation (`auto`, so a test cannot forget it).
// A request the fake does not answer fails the test here, after the body, with the paths that were missing.
// `backend` is the File Manager fake; in a wizard, Backups or Tasks spec it is not installed (the test uses `wizard`, `backups` or `tasks`)
// and must not be read.
export const test = base.extend<{ backend: FakeBackend, wizard: FakeWizardBackend, backups: FakeBackupsBackend, tasks: FakeTasksBackend }>({
  backend: [
    async ({ page }, use, testInfo) => {
      if (isWizardSpec(testInfo.file) || isBackupsSpec(testInfo.file) || isTasksSpec(testInfo.file)) {
        await use(undefined as never)
        return
      }
      const backend = await installFakeBackend(page)
      await use(backend)
      if (backend.unhandled.length > 0) {
        throw new Error(`Unhandled /api request(s): ${[...new Set(backend.unhandled)].join(', ')}`)
      }
    },
    { auto: true },
  ],
  wizard: [
    async ({ page }, use, testInfo) => {
      if (!isWizardSpec(testInfo.file)) {
        await use(undefined as never)
        return
      }
      const wizard = await installFakeWizardBackend(page)
      await use(wizard)
      if (wizard.unhandled.length > 0) {
        throw new Error(`Unhandled /api request(s): ${[...new Set(wizard.unhandled)].join(', ')}`)
      }
    },
    { auto: true },
  ],
  backups: [
    async ({ page }, use, testInfo) => {
      if (!isBackupsSpec(testInfo.file)) {
        await use(undefined as never)
        return
      }
      const backups = await installFakeBackupsBackend(page)
      await use(backups)
      if (backups.unhandled.length > 0) {
        throw new Error(`Unhandled /api request(s): ${[...new Set(backups.unhandled)].join(', ')}`)
      }
    },
    { auto: true },
  ],
  tasks: [
    async ({ page }, use, testInfo) => {
      if (!isTasksSpec(testInfo.file)) {
        await use(undefined as never)
        return
      }
      const tasks = await installFakeTasksBackend(page)
      await use(tasks)
      if (tasks.unhandled.length > 0) {
        throw new Error(`Unhandled /api request(s): ${[...new Set(tasks.unhandled)].join(', ')}`)
      }
    },
    { auto: true },
  ],
})
