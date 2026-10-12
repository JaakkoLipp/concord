import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, HttpRequest, HttpResponse, Socket, Transport } from '../transport.ts';

export interface RestFixture {
  step: string;
  actor: string;
  request: HttpRequest;
  response: HttpResponse;
}

export type WsLine =
  | { step: string }
  | { socket: number; actor: string; open: string }
  | { socket: number; t: number; frame: Frame }
  | { socket: number; t: number; sent: Frame }
  | { socket: number; t: number; closed: number };

export interface Scenario {
  rest: RestFixture[];
  ws: WsLine[];
}

export function loadScenario(fixturesDir: string, name: string): Scenario {
  const dir = join(fixturesDir, name);
  const files = readdirSync(dir).sort();
  const rest = files.filter((f) => f.includes('.rest.')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RestFixture);
  const ws = readFileSync(join(dir, 'ws.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as WsLine);
  return { rest, ws };
}

/** Route template used to match requests to fixtures: IDs and query values don't have to match. */
export const routeOf = (method: string, path: string) =>
  `${method} ${path.split('?')[0]!.replace(/[0-9A-HJKMNP-TV-Z]{26}/g, ':id')}`;

/**
 * Plays a scenario back. Each request takes the next unused exchange with the same method and route.
 * Each `connect` takes the next recorded socket and delivers its frames, in order, once a listener is attached.
 */
export class ReplayTransport implements Transport {
  private readonly used = new Set<number>();
  private nextSocket = 0;
  private readonly socketIds: number[];
  private readonly scenario: Scenario;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.socketIds = scenario.ws.filter((l): l is Extract<WsLine, { open: string }> => 'open' in l).map((l) => l.socket);
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const want = routeOf(req.method, req.path);
    const i = this.scenario.rest.findIndex((r, n) => !this.used.has(n) && routeOf(r.request.method, r.request.path) === want);
    if (i < 0) throw new Error(`no recorded exchange for ${want}`);
    this.used.add(i);
    return structuredClone(this.scenario.rest[i]!.response);
  }

  async connect(_query?: string): Promise<Socket> {
    const id = this.socketIds[this.nextSocket++];
    if (id === undefined) throw new Error('no more recorded sockets');
    const frames = this.scenario.ws.filter((l): l is Extract<WsLine, { frame: Frame }> => 'frame' in l && l.socket === id).map((l) => l.frame);
    const listeners = new Set<(f: Frame) => void>();
    const closes = new Set<(code: number) => void>();
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      queueMicrotask(() => {
        for (const f of frames) for (const l of listeners) l(structuredClone(f));
      });
    };
    return {
      send: () => {},
      close: () => { for (const l of closes) l(1000); },
      onFrame: (l) => { listeners.add(l); start(); return () => listeners.delete(l); },
      onClose: (l) => (closes.add(l), () => closes.delete(l)),
    };
  }
}
