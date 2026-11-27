/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Send cumulative 16 kHz mono PCM so each preview can correct earlier words.
class CommandCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(8 * 16000);
    this.length = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.done = false;
    this.port.onmessage = ({ data }) => {
      if (data === "finish" || data === "limit") this.finish(data);
    };
  }

  publish(kind) {
    const buffer = this.samples.slice(0, this.length).buffer;
    this.port.postMessage({ kind, buffer }, [buffer]);
  }

  finish(kind) {
    if (this.done) return;
    this.done = true;
    this.publish(kind);
  }

  process(inputs) {
    if (this.done) return false;
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      this.sum += sample;
      this.count++;
      this.phase += 16000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      this.samples[this.length++] = Math.round(Math.max(-1, Math.min(1, this.sum / this.count)) * 32767);
      this.sum = 0;
      this.count = 0;
      if (this.length === this.samples.length) {
        this.finish("limit");
        return false;
      }
      if (this.length % 20000 === 0) this.publish("preview");
    }
    return true;
  }
}
registerProcessor("nps-command-capture", CommandCapture);
