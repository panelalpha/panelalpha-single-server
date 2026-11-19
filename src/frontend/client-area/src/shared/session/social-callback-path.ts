/** Single source for the OAuth callback route path (router) and its matcher (401 interceptor). */
export const socialCallbackRoutePath = '/auth/:provider/callback'

export const socialCallbackPathPattern = /^\/auth\/[^/]+\/callback\/?$/
