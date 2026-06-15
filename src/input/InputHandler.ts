/**
 * Centralises all player input for the game canvas into three semantic
 * callbacks: aim, shoot, and key press.
 *
 * `InputHandler` attaches event listeners to both the canvas element
 * (mouse and touch) and the global `window` (keyboard) on construction,
 * and removes every listener when {@link destroy} is called. This keeps the
 * game loop decoupled from DOM event wiring and makes cleanup straightforward.
 *
 * Mouse and touch coordinates reported by the browser are in CSS-pixel
 * client space. {@link getCanvasPos} converts them to logical canvas-pixel
 * space so callers never have to account for CSS scaling or device pixel
 * ratios directly.
 *
 * Touch events are registered as `{ passive: true }` to avoid blocking the
 * browser's scroll compositor thread.
 *
 * @example
 * ```ts
 * const handler = new InputHandler(
 *   canvas,
 *   (x, y) => game.shoot(x, y),
 *   (x, y) => game.aim(x, y),
 *   (key)  => game.handleKey(key),
 * )
 * // Later, when the game is torn down:
 * handler.destroy()
 * ```
 */
export class InputHandler {
  /** The canvas element that receives mouse and touch events. */
  private readonly canvas: HTMLCanvasElement

  /**
   * Callback invoked when the player fires (mouse click or touch-end).
   * Receives the logical canvas coordinates of the input point.
   */
  private readonly onShoot: (x: number, y: number) => void

  /**
   * Callback invoked when the player moves the pointer (mouse-move or
   * touch-move). Receives the logical canvas coordinates so the caller can
   * update the aim direction.
   */
  private readonly onAim: (x: number, y: number) => void

  /**
   * Callback invoked on every key-down event. The key string is normalised
   * to lower-case before being forwarded.
   */
  private readonly onKey: (key: string) => void

  /**
   * Creates an `InputHandler` and immediately registers all event listeners.
   *
   * @param canvas   - The `<canvas>` element to listen on for pointer events.
   * @param onShoot  - Called with logical canvas (x, y) when the player fires.
   * @param onAim    - Called with logical canvas (x, y) when the player aims.
   * @param onKey    - Called with the lower-cased `KeyboardEvent.key` string
   *                   on every key-down event fired anywhere in the window.
   */
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

  /**
   * Converts a client-space coordinate pair into logical canvas-pixel space,
   * accounting for any CSS scaling applied to the canvas element.
   *
   * The scale factors are computed as the ratio of the canvas's intrinsic
   * pixel dimensions (`canvas.width` / `canvas.height`) to its rendered CSS
   * dimensions (`getBoundingClientRect`), so the mapping remains correct even
   * when the canvas is stretched or shrunk via CSS.
   *
   * @param clientX - Horizontal position in CSS client-space px (e.g. from `MouseEvent.clientX`).
   * @param clientY - Vertical position in CSS client-space px (e.g. from `MouseEvent.clientY`).
   * @returns An `{ x, y }` pair in logical canvas-pixel coordinates.
   */
  private getCanvasPos(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / rect.width
    const scaleY = this.canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  /** Handles `mousemove` events by forwarding canvas coordinates to {@link onAim}. */
  private handleMouseMove(e: MouseEvent): void {
    const { x, y } = this.getCanvasPos(e.clientX, e.clientY)
    this.onAim(x, y)
  }

  /** Handles `click` events by forwarding canvas coordinates to {@link onShoot}. */
  private handleClick(e: MouseEvent): void {
    const { x, y } = this.getCanvasPos(e.clientX, e.clientY)
    this.onShoot(x, y)
  }

  /**
   * Handles `touchmove` events by forwarding the first active touch point's
   * canvas coordinates to {@link onAim}. Ignores the event if no touches are
   * present in the `touches` list.
   */
  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length > 0) {
      const touch = e.touches[0]
      const { x, y } = this.getCanvasPos(touch.clientX, touch.clientY)
      this.onAim(x, y)
    }
  }

  /**
   * Handles `touchend` events by forwarding the last changed touch point's
   * canvas coordinates to {@link onShoot}. Uses `changedTouches` (rather than
   * `touches`) because the ending finger is no longer present in the active
   * touch list at the time the event fires.
   */
  private handleTouchEnd(e: TouchEvent): void {
    if (e.changedTouches.length > 0) {
      const touch = e.changedTouches[0]
      const { x, y } = this.getCanvasPos(touch.clientX, touch.clientY)
      this.onShoot(x, y)
    }
  }

  /**
   * Handles `keydown` events by forwarding the lower-cased key string to
   * {@link onKey}, normalising case so callers can compare against string
   * literals without worrying about Caps Lock state.
   */
  private handleKeyDown(e: KeyboardEvent): void {
    this.onKey(e.key.toLowerCase())
  }

  /**
   * Removes all event listeners registered by this instance.
   *
   * Must be called when the game or the canvas element is torn down to
   * prevent memory leaks and stale callbacks firing after the game ends.
   */
  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove)
    this.canvas.removeEventListener('click', this.handleClick)
    this.canvas.removeEventListener('touchmove', this.handleTouchMove)
    this.canvas.removeEventListener('touchend', this.handleTouchEnd)
    window.removeEventListener('keydown', this.handleKeyDown)
  }
}
