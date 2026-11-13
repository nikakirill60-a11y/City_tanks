// Синтезированные звуки через WebAudio — без внешних файлов
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
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? 0.45 : 0;
  }

  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  _noise(dur, freq, type = 'lowpass', vol = 0.5, sweepTo = null) {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
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

  click()       { this._tone(520, 0.05, 'square', 0.12); }
  shoot()       { this._noise(0.35, 900, 'lowpass', 0.55, 120); this._tone(140, 0.18, 'square', 0.22, 50); }
  enemyShoot()  { this._noise(0.3, 700, 'lowpass', 0.28, 100); }
  hit()         { this._noise(0.18, 1600, 'bandpass', 0.35); this._tone(180, 0.12, 'sawtooth', 0.18, 80); }
  penetration() { this._noise(0.22, 2400, 'bandpass', 0.3); this._tone(900, 0.09, 'square', 0.12, 500); }
  ricochet()    { this._tone(1400, 0.16, 'triangle', 0.16, 2600); }
  impact()      { this._noise(0.14, 500, 'lowpass', 0.28, 200); }
  explosion()   { this._noise(0.9, 500, 'lowpass', 0.7, 40); this._tone(90, 0.7, 'sine', 0.4, 30); }
  reload()      { this._tone(600, 0.07, 'square', 0.12); setTimeout(() => this._tone(900, 0.07, 'square', 0.12), 110); }
  wave()        { this._tone(440, 0.15, 'square', 0.16); setTimeout(() => this._tone(660, 0.2, 'square', 0.16), 150); }
  victory()     { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.24, 'triangle', 0.22), i * 130)); }
  defeat()      { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 'sawtooth', 0.2), i * 150)); }
  gameOver()    { this.defeat(); }
}
