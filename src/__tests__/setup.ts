// Polyfill OffscreenCanvas for jsdom test environment
if (typeof OffscreenCanvas === 'undefined') {
  class MockOffscreenCanvas {
    width: number
    height: number
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
    }
    getContext() {
      return {
        translate: () => {},
        scale: () => {},
        clearRect: () => {},
        fillRect: () => {},
        fill: () => {},
        stroke: () => {},
        beginPath: () => {},
        arc: () => {},
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        setLineDash: () => {},
        moveTo: () => {},
        lineTo: () => {},
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        globalAlpha: 1,
        shadowColor: '',
        shadowBlur: 0,
        font: '',
        textAlign: '',
        textBaseline: '',
        fillText: () => {},
        measureText: () => ({ width: 0 }),
      }
    }
    transferToImageBitmap() {
      return {} as ImageBitmap
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).OffscreenCanvas = MockOffscreenCanvas
}

if (typeof Path2D === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Path2D = class {
    constructor(_d?: string) {}
  }
}

if (typeof createImageBitmap === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).createImageBitmap = async () => ({} as ImageBitmap)
}
