// Синтезированные звуки через WebAudio — без внешних файлов.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  toggle() { this.enabled = !this.enabled; return this.enabled; }

  _noise(dur, freq, type = 'lowpass', vol = 0.5, sweepTo = null) {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }
  _tone(freq, dur, type = 'square', vol = 0.3, sweepTo = null) {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(t + dur);
  }

  shoot()      { this._noise(0.35, 900, 'lowpass', 0.6, 120); this._tone(140, 0.18, 'square', 0.25, 50); }
  enemyShoot() { this._noise(0.3, 700, 'lowpass', 0.35, 100); }
  hit()        { this._noise(0.15, 1800, 'bandpass', 0.4); this._tone(220, 0.1, 'sawtooth', 0.2, 90); }
  explosion()  { this._noise(0.9, 500, 'lowpass', 0.8, 40); this._tone(90, 0.7, 'sine', 0.5, 30); }
  reload()     { this._tone(600, 0.07, 'square', 0.15); setTimeout(() => this._tone(900, 0.07, 'square', 0.15), 120); }
  wave()       { this._tone(440, 0.15, 'square', 0.2); setTimeout(() => this._tone(660, 0.2, 'square', 0.2), 150); }
  gameOver()   { this._tone(300, 0.4, 'sawtooth', 0.3, 60); setTimeout(() => this._tone(150, 0.8, 'sawtooth', 0.3, 40), 350); }
}
