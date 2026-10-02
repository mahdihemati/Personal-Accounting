// Captures mic audio, low-pass averages + linearly resamples to 16 kHz, posts ~40ms frames.
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.prev = 0;
    this.buf = new Float32Array(640);
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const r = this.ratio;
    const half = Math.max(0, Math.floor(r / 2));
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      let v;
      if (half > 0) {
        let sum = 0, n = 0;
        for (let k = i - half; k <= i + half; k++) {
          const x = k < 0 ? this.prev : k < ch.length ? ch[k] : ch[ch.length - 1];
          sum += x; n++;
        }
        v = sum / n;
      } else {
        const a = ch[i], b = i + 1 < ch.length ? ch[i + 1] : a;
        v = a + (b - a) * frac;
      }
      this.buf[this.len++] = v;
      this.pos += r;
      if (this.len === this.buf.length) {
        this.port.postMessage(this.buf.slice(0));
        this.len = 0;
      }
    }
    this.pos -= ch.length;
    this.prev = ch[ch.length - 1];
    return true;
  }
}
registerProcessor("pcm-recorder", PcmRecorder);
