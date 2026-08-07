/**
 * The set of named sound effects the engine can play.
 */
export type SoundName = 'shoot' | 'bounce' | 'land' | 'match' | 'fall' | 'win' | 'lose' | 'alert' | 'hold' | 'swap'

/**
 * Procedural audio engine for HatTrick built entirely on the Web Audio API.
 *
 * No audio files are loaded or decoded at runtime. Every sound effect is
 * synthesised on-the-fly using oscillators, gain envelopes, and (for the
 * match "pop") a short noise burst.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private _muted = false
  private _destroyed = false

  /** Whether the engine is currently muted. */
  get muted(): boolean {
    return this._muted
  }

  /** Toggles the mute state and adjusts the master gain node accordingly. */
  toggleMute(): boolean {
    this._muted = !this._muted
    if (this.master) {
      this.master.gain.value = this._muted ? 0 : 1
    }
    return this._muted
  }

  /** Unlocks the underlying `AudioContext` in response to a user gesture. */
  resume(): void {
    if (!this._destroyed) this.getCtx()
  }

  /**
   * Plays the named sound effect.
   *
   * @param name  - The identifier of the sound effect to play.
   * @param combo - Combo level for the `'match'` sound (raises pitch). Defaults to `1`.
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
      case 'alert':  this.playAlert(ctx); break
      case 'hold':   this.playHold(ctx); break
      case 'swap':   this.playSwap(ctx); break
    }
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 1
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  private out(ctx: AudioContext): GainNode {
    const g = ctx.createGain()
    g.connect(this.master!)
    return g
  }

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

  private playMatch(ctx: AudioContext, combo: number): void {
    const t = ctx.currentTime
    const baseFreq = 300 * Math.pow(1.06, Math.min(combo - 1, 7))
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
    this.noiseShot(ctx, t, 0.06, 0.12)
  }

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

  private playWin(ctx: AudioContext): void {
    const t = ctx.currentTime
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

  private playLose(ctx: AudioContext): void {
    const t = ctx.currentTime
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

  /** Two-tone "ding-ding" warning when the grid is about to advance. */
  private playAlert(ctx: AudioContext): void {
    const t = ctx.currentTime
    const freqs = [660, 880]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = this.out(ctx)
      const start = t + i * 0.07
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.0, start)
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08)
      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.1)
    })
  }

  /** Soft low thud as a hat is stashed into the hold slot. */
  private playHold(ctx: AudioContext): void {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = this.out(ctx)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(180, t)
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.08)
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    osc.connect(gain)
    osc.start(t)
    osc.stop(t + 0.1)
  }

  /** Ascending chirp when the hold hat is swapped back into the chamber. */
  private playSwap(ctx: AudioContext): void {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = this.out(ctx)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(350, t)
    osc.frequency.exponentialRampToValueAtTime(650, t + 0.08)
    gain.gain.setValueAtTime(0.0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    osc.connect(gain)
    osc.start(t)
    osc.stop(t + 0.1)
  }

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

  /** Closes the `AudioContext` and releases all associated resources. */
  destroy(): void {
    this._destroyed = true
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
