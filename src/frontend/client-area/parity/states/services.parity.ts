import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { cancelErrorState, cancelFocusState, cancelLoadingState, cancelModalState, listProbes, servicesEmptyState, servicesErrorState, servicesFilterAllState, servicesLoadingState, servicesSearchNoResultsState, servicesState, servicesStatusMenuState, sitesTooltipState, upgradeHoverState } from './services'

// S-120 ui-services (formerly S-49): the My plans list at `/services`, measured on app-lite (`target: 'lite'`, M-2).
// Source: `context/changes/ui-services/research.md` (section 4, the 7-state matrix). States are added phase by phase:
// default (phase 4), hover and tooltip (5), focus (6), cancel modal (7), errors (8), empty and no-results (9), loading (10), status filter (11).
// Each `id` is a literal line: `registeredStates` in `report/write-report.ts` reads them from this file.

const states: ParityState[] = [
  {
    id: 'services-default',
    ...servicesState({ probes: listProbes }),
  },
  {
    id: 'services-upgrade-hover',
    ...upgradeHoverState(),
  },
  {
    id: 'services-sites-tooltip',
    ...sitesTooltipState(),
  },
  {
    id: 'services-cancel-focus',
    ...cancelFocusState(),
  },
  {
    id: 'services-cancel-modal',
    ...cancelModalState(false),
  },
  {
    id: 'services-cancel-modal-filled',
    ...cancelModalState(true),
  },
  {
    id: 'services-error',
    ...servicesErrorState(),
  },
  {
    id: 'services-cancel-error',
    ...cancelErrorState(),
  },
  {
    id: 'services-empty',
    ...servicesEmptyState(),
  },
  {
    id: 'services-search-no-results',
    ...servicesSearchNoResultsState(),
  },
  {
    id: 'services-loading',
    ...servicesLoadingState(),
  },
  {
    id: 'services-cancel-loading',
    ...cancelLoadingState(),
  },
  {
    id: 'services-status-menu',
    ...servicesStatusMenuState(),
  },
  {
    id: 'services-filter-all',
    ...servicesFilterAllState(),
  },
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
