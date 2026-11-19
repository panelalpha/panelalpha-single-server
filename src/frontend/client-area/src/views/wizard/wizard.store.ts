import { defineStore } from 'pinia'
import { ref } from 'vue'
import { onSessionCleared } from '@/shared/session/session-reset'
import { nextMaxStep } from './wizard-steps'

// Furthest step the user reached. A store, not a ref of the view, so going back
// to an earlier step or between the routes of the wizard keeps it. A full reload starts from the step of the URL.
export const useWizardStore = defineStore('wizard', () => {
  const maxStep = ref(0)
  // Step 2 found the server connected to PanelAlpha; step 3 reads it.
  const hubConnected = ref(false)
  // Step 3 found an active MCP token or created one (Summary reads it).
  const aiConnected = ref(false)
  // Address of the Hub account page (`hub_url` of `complete`), for "Use another account" in step 2; null when the panel sent none.
  const hubUrl = ref<string | null>(null)

  function reach (index: number): void {
    maxStep.value = nextMaxStep(maxStep.value, index)
  }

  function setHubConnected (value: boolean): void {
    hubConnected.value = value
  }

  function setAiConnected (value: boolean): void {
    aiConnected.value = value
  }

  function setHubUrl (value: string | null): void {
    hubUrl.value = value
  }

  // What the wizard learned belongs to the signed-in admin: a sign-out (or a 401) forgets it, so another account in the same tab
  // starts from the server. The store lives as long as its Pinia, so one registration per store.
  function reset (): void {
    maxStep.value = 0
    hubConnected.value = false
    aiConnected.value = false
    hubUrl.value = null
  }
  onSessionCleared(reset)

  return { maxStep, hubConnected, aiConnected, hubUrl, reach, setHubConnected, setAiConnected, setHubUrl, reset }
})
