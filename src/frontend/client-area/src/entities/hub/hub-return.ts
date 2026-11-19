// The Hub returns the browser to `/hub-connected?state&result`; this key tells the router to send it back to Settings instead of the setup
// wizard. The `/hub-connected` route itself belongs to the wizard (`src/views/wizard/hub-connected-redirect.ts`).
export const FREE_HUB_RETURN_KEY = 'free-hub-return'
