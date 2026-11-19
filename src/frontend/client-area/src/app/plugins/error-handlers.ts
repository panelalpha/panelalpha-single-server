import type { App, ComponentPublicInstance } from 'vue'
import { reportError } from '@/shared/errors/report-error'

type ErrorTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

export interface ErrorHandlerOptions {
  /** Where `error` and `unhandledrejection` are listened to. Defaults to `window`. */
  target?: ErrorTarget
  /** Current route name for the report. Only a string is used; the path, params and query are never read (invite and reset links carry tokens). */
  getRouteName?: () => unknown
}

function componentName (instance: ComponentPublicInstance | null): string | undefined {
  const options = instance?.$options
  return options?.name ?? options?.__name
}

/**
 * Sends every unhandled front-end error to `reportError`: Vue render, hook and handler errors (`app.config.errorHandler`),
 * script errors (`window` `error`) and rejected promises nobody caught (`unhandledrejection`). Returns a function that removes
 * the listeners and restores the previous `errorHandler`.
 *
 * The browser still logs its own "Uncaught" line (the events are not cancelled): that line keeps the source-mapped stack.
 * Vue passes an error that a component threw to `errorHandler` only, so the same error does not arrive twice; if an error
 * does come through two channels, `reportError` reports it once.
 */
export function installErrorHandlers (app: App, options: ErrorHandlerOptions = {}): () => void {
  const target = options.target ?? window

  function routeName (): string | undefined {
    try {
      const name = options.getRouteName?.()
      return typeof name === 'string' ? name : undefined
    } catch {
      return undefined
    }
  }

  const previousHandler = app.config.errorHandler

  app.config.errorHandler = (error, instance, info) => {
    reportError(error, { source: 'vue', componentName: componentName(instance), info, routeName: routeName() })
  }

  const onWindowError = (event: Event): void => {
    const { error, message } = event as ErrorEvent
    reportError(error ?? message, { source: 'window', routeName: routeName() })
  }

  const onUnhandledRejection = (event: Event): void => {
    reportError((event as PromiseRejectionEvent).reason, { source: 'unhandledrejection', routeName: routeName() })
  }

  target.addEventListener('error', onWindowError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    target.removeEventListener('error', onWindowError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
    app.config.errorHandler = previousHandler
  }
}
