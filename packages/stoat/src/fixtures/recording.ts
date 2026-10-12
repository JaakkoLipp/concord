import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, HttpRequest, HttpResponse, Socket, Transport } from '../transport.ts';

/**
 * Wraps transports during one scenario and writes raw, unscrubbed captures to `.raw/<scenario>/`.
 * REST exchanges from every wrapped transport are kept in order. Socket frames are kept only for sockets
 * opened through a transport wrapped with `observe: true`.
 */
export class Recording {
  private seq = 0;
  private sockets = 0;
  private readonly started = Date.now();
  private readonly dir: string;
  private step = 'start';
  readonly scenario: string;

  constructor(rawRoot: string, scenario: string) {
    this.scenario = scenario;
    this.dir = join(rawRoot, scenario);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, 'ws.jsonl'), '');
  }

  /** Mark the start of a step, in both the REST sequence and the frame log. */
  mark(step: string): void {
    this.step = step;
    this.line({ step });
  }

  wrap(inner: Transport, opts: { actor: string; observe?: boolean }): Transport {
    return {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        const res = await inner.request(req);
        const n = ++this.seq;
        writeFileSync(join(this.dir, `${String(n).padStart(3, '0')}.json`),
          JSON.stringify({ step: this.step, actor: opts.actor, request: req, response: res }, null, 1));
        return res;
      },
      connect: async (query?: string): Promise<Socket> => {
        const socket = await inner.connect(query);
        if (!opts.observe) return socket;
        const id = ++this.sockets;
        this.line({ socket: id, actor: opts.actor, open: query ?? '' });
        socket.onFrame((frame) => this.line({ socket: id, t: Date.now() - this.started, frame }));
        socket.onClose((code) => this.line({ socket: id, t: Date.now() - this.started, closed: code }));
        return {
          ...socket,
          send: (frame: Frame) => {
            this.line({ socket: id, t: Date.now() - this.started, sent: frame });
            socket.send(frame);
          },
        };
      },
    };
  }

  private line(entry: object): void {
    appendFileSync(join(this.dir, 'ws.jsonl'), JSON.stringify(entry) + '\n');
  }
}
