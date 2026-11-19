// The dialog shell checks live in `src/shared/ui/modal/dialog-shell.fixtures.ts`, so the hosting and the project pages
// (a view group does not import another one) use the same code. This path stays for the hosting tests.
export { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openCard, openDialogs } from '@/shared/ui/modal/dialog-shell.fixtures'
