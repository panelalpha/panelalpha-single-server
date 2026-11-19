import { getErrorMessage } from '@/shared/api/error-message'

export interface HubLoginStartDeps {
  setLoading: (value: boolean) => void
  setErrors: (value: string[]) => void
  fetchUrl: () => Promise<string>
  navigate: (url: string) => void
}

/** Loading stays on after the navigation, an error replaces `errors` and clears loading. */
export async function startHubLogin (deps: HubLoginStartDeps): Promise<void> {
  deps.setLoading(true)
  try {
    const url = await deps.fetchUrl()
    deps.navigate(url)
  } catch (error) {
    deps.setErrors([getErrorMessage(error)])
    deps.setLoading(false)
  }
}
