// Captures mic audio and resamples to 16 kHz Float32 frames (~100ms each).
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.buf = new Float32Array(1600);
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length) {
      this.buf[this.len++] = ch[Math.floor(this.pos)];
      this.pos += this.ratio;
      if (this.len === this.buf.length) {
        this.port.postMessage(this.buf.slice(0));
        this.len = 0;
      }
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor("pcm-recorder", PcmRecorder);
