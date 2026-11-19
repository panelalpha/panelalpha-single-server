import type { HomeResponse } from '@/shared/session/session.api'
import { ref, type Ref, type WatchSource } from 'vue'
import { onFirstHomeHydration } from '@/app/shell/first-hydration'
import { hasExpiredTrial } from '@/shared/session/trial-rules'

/**
 * Legacy `App.mounted()` opens `TrialExpiredModal` when the services hold an expired trial. In next that is
 * the first `/home` hydration (`onFirstHomeHydration`), so an in-app sign-in and a later `/home` refresh never open it. The
 * flag lives in the caller's setup, outside the keyed `v-app`, so a language remount does not reopen it either.
 */
export function useTrialExpiredModal (
  source: WatchSource<HomeResponse | null | undefined>,
  now: () => Date = () => new Date(),
): Ref<boolean> {
  const opened = ref(false)
  onFirstHomeHydration(source, home => {
    if (hasExpiredTrial(home.user?.services, now())) {
      opened.value = true
    }
  })
  return opened
}
