/**
 * The gate's AudioWorklet (client.md section 10.4): mono in, mono out, gated by gate.ts. Bundled on its own
 * through `?worker&url` so it can import the shared logic, and served from our origin under /app.
 */
import { GainRamp, Gate, Meter, SILENCE_DB, type GateConfig, type GateMessage, type GateReport, GATE_PROCESSOR } from './gate.ts';

// The AudioWorkletGlobalScope, which the DOM library doesn't describe.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
}
declare function registerProcessor(name: string, processor: new (options: { processorOptions?: unknown }) => AudioWorkletProcessor): void;

/** Reports go out about 30 times a second, not once per 2.7 ms block. */
const REPORT_MS = 33;

class GateProcessor extends AudioWorkletProcessor {
  private readonly gate: Gate;
  private readonly meter = new Meter();
  private readonly ramp = new GainRamp(sampleRate);
  private peak = SILENCE_DB;
  private sinceReport = 0;
  private stopped = false;

  constructor(options: { processorOptions?: unknown }) {
    super(options);
    this.gate = new Gate(options.processorOptions as GateConfig);
    this.port.onmessage = (e: MessageEvent<GateMessage>) => {
      const msg = e.data;
      if (msg.type === 'config') this.gate.configure(msg.config);
      else if (msg.type === 'ptt') this.gate.pushToTalk(msg.down);
      else if (msg.type === 'blur') this.gate.blur();
      else this.stopped = true;
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.stopped) return false;
    const output = outputs[0]?.[0];
    if (!output) return true;
    const input = inputs[0]?.[0];
    const ms = (output.length / sampleRate) * 1000;
    // No source connected, for a moment while the microphone is replaced: silence.
    if (input) output.set(input);
    else output.fill(0);
    const level = this.meter.measure(output, ms);
    this.ramp.apply(output, this.gate.step(level, ms));

    this.peak = Math.max(this.peak, level);
    this.sinceReport += ms;
    if (this.sinceReport >= REPORT_MS) {
      const report: GateReport = { level: this.peak, open: this.gate.isOpen() };
      this.port.postMessage(report);
      this.peak = SILENCE_DB;
      this.sinceReport = 0;
    }
    return true;
  }
}

registerProcessor(GATE_PROCESSOR, GateProcessor);
