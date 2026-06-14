export class InputHandler {
  private readonly canvas: HTMLCanvasElement
  private readonly onShoot: (x: number, y: number) => void
  private readonly onAim: (x: number, y: number) => void
  private readonly onKey: (key: string) => void

  constructor(
    canvas: HTMLCanvasElement,
    onShoot: (x: number, y: number) => void,
    onAim: (x: number, y: number) => void,
    onKey: (key: string) => void,
  ) {
    this.canvas = canvas
    this.onShoot = onShoot
    this.onAim = onAim
    this.onKey = onKey

    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleClick = this.handleClick.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleTouchMove = this.handleTouchMove.bind(this)
    this.handleTouchEnd = this.handleTouchEnd.bind(this)

    canvas.addEventListener('mousemove', this.handleMouseMove)
    canvas.addEventListener('click', this.handleClick)
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: true })
    canvas.addEventListener('touchend', this.handleTouchEnd, { passive: true })
    window.addEventListener('keydown', this.handleKeyDown)
  }

  private getCanvasPos(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / rect.width
    const scaleY = this.canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const { x, y } = this.getCanvasPos(e.clientX, e.clientY)
    this.onAim(x, y)
  }

  private handleClick(e: MouseEvent): void {
    const { x, y } = this.getCanvasPos(e.clientX, e.clientY)
    this.onShoot(x, y)
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length > 0) {
      const touch = e.touches[0]
      const { x, y } = this.getCanvasPos(touch.clientX, touch.clientY)
      this.onAim(x, y)
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.changedTouches.length > 0) {
      const touch = e.changedTouches[0]
      const { x, y } = this.getCanvasPos(touch.clientX, touch.clientY)
      this.onShoot(x, y)
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.onKey(e.key.toLowerCase())
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove)
    this.canvas.removeEventListener('click', this.handleClick)
    this.canvas.removeEventListener('touchmove', this.handleTouchMove)
    this.canvas.removeEventListener('touchend', this.handleTouchEnd)
    window.removeEventListener('keydown', this.handleKeyDown)
  }
}
