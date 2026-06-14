export type SoundName = 'shoot' | 'bounce' | 'land' | 'match' | 'fall' | 'win' | 'lose'

export class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private _muted = false

  get muted(): boolean {
    return this._muted
  }

  toggleMute(): boolean {
    this._muted = !this._muted
    if (this.master) {
      this.master.gain.value = this._muted ? 0 : 1
    }
    return this._muted
  }

  /** Must be called from a user-gesture handler to unlock AudioContext */
  resume(): void {
    this.getCtx()
  }

  play(name: SoundName, combo = 1): void {
    const ctx = this.getCtx()
    if (this._muted) return

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

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 1
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

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

  destroy(): void {
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
