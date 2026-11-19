/** Stubs jsdom lacks that Vuetify 4 overlays need. Registered via vitest setupFiles. */

class ResizeObserverStub {
  observe (): void {}
  unobserve (): void {}
  disconnect (): void {}
}

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom does not implement media playback; dialogs with <video>/<audio> call play() and pause().
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = async function play (): Promise<void> {}
  HTMLMediaElement.prototype.pause = function pause (): void {}
}

if (globalThis.visualViewport === undefined) {
  Object.defineProperty(globalThis, 'visualViewport', {
    configurable: true,
    value: {
      width: globalThis.innerWidth ?? 1024,
      height: globalThis.innerHeight ?? 768,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener (): void {},
      removeEventListener (): void {},
      dispatchEvent (): boolean {
        return true
      },
      onresize: null,
      onscroll: null,
    },
  })
}
