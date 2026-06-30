/**
 * The set of named sound effects the engine can play.
 *
 * - `'shoot'`  – fired when the player launches a hat.
 * - `'bounce'` – fired when the projectile ricochets off a side wall.
 * - `'land'`   – fired when a hat lands on the grid without triggering a match.
 * - `'match'`  – fired when three or more same-type hats are cleared.
 * - `'fall'`   – fired when disconnected hats cascade off the grid.
 * - `'win'`    – fired when the player clears the board.
 * - `'lose'`   – fired when hats reach the danger line and the game ends.
 */
export type SoundName = 'shoot' | 'bounce' | 'land' | 'match' | 'fall' | 'win' | 'lose'

/**
 * Procedural audio engine for HatTrick built entirely on the Web Audio API.
 *
 * No audio files are loaded or decoded at runtime. Every sound effect is
 * synthesised on-the-fly using oscillators, gain envelopes, and (for the
 * match "pop") a short noise burst. This keeps the asset bundle lean and
 * avoids network requests entirely.
 *
 * ## Usage
 * ```ts
 * const audio = new SoundEngine()
 *
 * // Unlock the AudioContext from a user-gesture handler:
 * button.addEventListener('click', () => audio.resume())
 *
 * // Play a sound (safe to call before resume — will be a no-op if still locked):
 * audio.play('shoot')
 *
 * // Combo multiplier raises pitch on match sounds:
 * audio.play('match', 3)
 *
 * // Toggle mute without destroying state:
 * audio.toggleMute()
 *
 * // Clean up when done:
 * audio.destroy()
 * ```
 *
 * ## Architecture
 * A single shared `AudioContext` is created lazily on the first call to
 * {@link resume} or {@link play}. All oscillator/source nodes route through a
 * master `GainNode` so that {@link toggleMute} can silence everything
 * instantaneously without stopping individual nodes. The `AudioContext` is
 * never recreated; calling {@link destroy} closes it permanently.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private _muted = false
  private _destroyed = false

  /**
   * Whether the engine is currently muted.
   *
   * When `true`, calls to {@link play} are no-ops and the master gain is set
   * to `0`. The muted state persists across {@link resume} calls.
   */
  get muted(): boolean {
    return this._muted
  }

  /**
   * Toggles the mute state and adjusts the master gain node accordingly.
   *
   * Flips `_muted`, then sets the master gain to `0` (muted) or `1`
   * (unmuted). If the `AudioContext` has not yet been created the muted flag
   * is still updated; the gain will be applied when the context is eventually
   * initialised.
   *
   * @returns The new mute state — `true` if now muted, `false` if now unmuted.
   */
  toggleMute(): boolean {
    this._muted = !this._muted
    if (this.master) {
      this.master.gain.value = this._muted ? 0 : 1
    }
    return this._muted
  }

  /**
   * Unlocks the underlying `AudioContext` in response to a user gesture.
   *
   * Browsers require a user interaction (click, keydown, etc.) before audio
   * can play. Call this method inside any such event handler early in the
   * game lifecycle to ensure the context is in the `'running'` state before
   * the first sound is needed. Subsequent calls are safe but have no effect
   * once the context is already running.
   */
  resume(): void {
    if (!this._destroyed) this.getCtx()
  }

  /**
   * Plays the named sound effect, optionally scaled by a combo multiplier.
   *
   * The call is a no-op when {@link muted} is `true` or after {@link destroy}
   * has been called. Each sound is synthesised immediately using Web Audio API
   * nodes that are scheduled to auto-stop; no cleanup is required by the caller.
   *
   * @param name  - The identifier of the sound effect to play.
   * @param combo - Combo level passed to the `'match'` sound to raise its
   *   pitch with each successive multi-match. Values above 8 are clamped
   *   internally. Ignored for all other sound names. Defaults to `1`.
   */
  play(name: SoundName, combo = 1): void {
    if (this._muted || this._destroyed) return
    const ctx = this.getCtx()

    switch (name) {
      case 'shoot':  this.playShoot(ctx); break
      case 'bounce': this.playBounce(ctx); break
      case 'land':   this.playLand(ctx); break
      case 'match':  this.playMatch(ctx, combo); break
      case 'fall':   this.playFall(ctx); break
      case 'win':    this.playWin(ctx); break
      case 'lose':   this.playLose(ctx); break
    }
  }

  /**
   * Returns the shared `AudioContext`, creating and connecting the master
   * gain node on first call. If the context is suspended (e.g., before a
   * user gesture has been received) it is resumed automatically.
   *
   * @returns The active `AudioContext` instance.
   */
  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 1
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* browser autoplay policy — safe to ignore */ })
    }
    return this.ctx
  }

  /**
   * Creates a new `GainNode` connected to the master output and returns it.
   *
   * Every synthesised sound creates its own gain node through this helper so
   * that individual volume envelopes can be applied without affecting the
   * master level.
   *
   * @param ctx - The active `AudioContext`.
   * @returns A `GainNode` wired to `this.master`.
   */
  private out(ctx: AudioContext): GainNode {
    const g = ctx.createGain()
    g.connect(this.master!)
    return g
  }

  // --- Individual sounds ---

  /** Quick upward "pew" as the hat is fired */
  private playShoot(ctx: AudioContext): void {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = this.out(ctx)

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, t)
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.06)
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.14)

    gain.gain.setValueAtTime(0.0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)

    osc.connect(gain)
    osc.start(t)
    osc.stop(t + 0.15)
  }

  /** Soft "tick" on wall bounce */
  private playBounce(ctx: AudioContext): void {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = this.out(ctx)

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(900, t)
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.04)

    gain.gain.setValueAtTime(0.12, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)

    osc.connect(gain)
    osc.start(t)
    osc.stop(t + 0.05)
  }

  /** Low "dunk" when a hat lands without a match */
  private playLand(ctx: AudioContext): void {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = this.out(ctx)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, t)
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.1)

    gain.gain.setValueAtTime(0.22, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)

    osc.connect(gain)
    osc.start(t)
    osc.stop(t + 0.12)
  }

  /**
   * Satisfying "pop" chord when hats match.
   * Combo level raises the pitch for escalating feedback.
   */
  private playMatch(ctx: AudioContext, combo: number): void {
    const t = ctx.currentTime
    const baseFreq = 300 * Math.pow(1.06, Math.min(combo - 1, 7))

    // Three staggered "pop" tones forming a major chord
    const intervals = [1, 1.26, 1.5]
    intervals.forEach((ratio, i) => {
      const osc = ctx.createOscillator()
      const gain = this.out(ctx)
      const start = t + i * 0.04

      osc.type = 'sine'
      osc.frequency.setValueAtTime(baseFreq * ratio, start)
      osc.frequency.exponentialRampToValueAtTime(baseFreq * ratio * 1.5, start + 0.02)
      osc.frequency.exponentialRampToValueAtTime(baseFreq * ratio * 0.5, start + 0.18)

      gain.gain.setValueAtTime(0.0, start)
      gain.gain.linearRampToValueAtTime(0.25, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22)

      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.25)
    })

    // Noise burst for the "pop" crunch
    this.noiseShot(ctx, t, 0.06, 0.12)
  }

  /** Descending cascade when disconnected hats fall */
  private playFall(ctx: AudioContext): void {
    const t = ctx.currentTime
    const notes = [520, 420, 300, 200]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = this.out(ctx)
      const start = t + i * 0.055

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, start + 0.1)

      gain.gain.setValueAtTime(0.14, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12)

      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.14)
    })
  }

  /** Ascending C-major arpeggio fanfare */
  private playWin(ctx: AudioContext): void {
    const t = ctx.currentTime
    // C4 E4 G4 C5
    const freqs = [261.6, 329.6, 392.0, 523.2]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = this.out(ctx)
      const start = t + i * 0.1

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0.0, start)
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02)
      gain.gain.setValueAtTime(0.25, start + 0.1)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22)

      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.25)
    })
  }

  /** Descending sad tones for game over */
  private playLose(ctx: AudioContext): void {
    const t = ctx.currentTime
    // C4 A3 F3 C3
    const freqs = [261.6, 220.0, 174.6, 130.8]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = this.out(ctx)
      const start = t + i * 0.18

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(freq, start)
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, start + 0.18)

      gain.gain.setValueAtTime(0.0, start)
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02)
      gain.gain.setValueAtTime(0.2, start + 0.1)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2)

      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.22)
    })
  }

  /** Short filtered noise burst for percussive crack */
  private noiseShot(ctx: AudioContext, t: number, duration: number, volume: number): void {
    const bufLen = Math.ceil(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2000
    filter.Q.value = 0.5

    const gain = this.out(ctx)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

    src.connect(filter)
    filter.connect(gain)
    src.start(t)
    src.stop(t + duration)
  }

  /**
   * Closes the `AudioContext` and releases all associated resources.
   *
   * After calling `destroy()`, further calls to {@link play} or {@link resume}
   * will throw because the context is permanently closed. Create a new
   * `SoundEngine` instance if audio is needed again.
   */
  destroy(): void {
    this._destroyed = true
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
