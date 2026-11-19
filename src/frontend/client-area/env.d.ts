/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** When 'true', LoginView prefills demo credentials (replaces legacy VUE_APP_DEMO_MODE). */
  readonly VITE_DEMO_MODE?: string
  /** Echo websocket (legacy VUE_APP_WEBSOCKET_*). Defaults: `${apiUrl}/broadcasting/auth`, location.hostname, location port / 443 / 80, `/ws`. */
  readonly VITE_WEBSOCKET_AUTH_ENDPOINT?: string
  readonly VITE_WEBSOCKET_HOST?: string
  readonly VITE_WEBSOCKET_PORT?: string
  readonly VITE_WEBSOCKET_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
