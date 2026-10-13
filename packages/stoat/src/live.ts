import { KEPT_HEADERS, type Frame, type HttpRequest, type HttpResponse, type Socket, type Transport } from './transport.ts';

const REQUEST_TIMEOUT_MS = 20_000;

/** Talks to a real Stoat stack on the same origin layout as Caddy: /api and /ws. */
export class LiveTransport implements Transport {
  private readonly origin: string;
  constructor(origin: string) {
    this.origin = origin.replace(/\/$/, '');
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const headers: Record<string, string> = { ...req.headers };
    if (req.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${this.origin}/api${req.path}`, {
      method: req.method,
      headers,
      body: req.body === undefined ? null : JSON.stringify(req.body),
      // A request that hangs fails like a network error, which callers treat as "may have arrived".
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const kept: Record<string, string> = {};
    for (const name of KEPT_HEADERS) {
      const value = res.headers.get(name);
      if (value !== null) kept[name] = value;
    }
    return { status: res.status, headers: kept, body };
  }

  /** XMLHttpRequest rather than fetch, because only it reports upload progress. */
  upload(path: string, form: FormData, headers: Record<string, string>, onProgress?: (fraction: number) => void): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.origin}/autumn${path}`);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        let body: unknown = xhr.responseText;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // Not JSON: keep the text.
        }
        resolve({ status: xhr.status, headers: {}, body });
      };
      xhr.onerror = () => reject(new TypeError(`upload failed: ${path}`));
      xhr.ontimeout = () => reject(new TypeError(`upload timed out: ${path}`));
      xhr.send(form);
    });
  }

  connect(query = ''): Promise<Socket> {
    const url = `${this.origin.replace(/^http/, 'ws')}/ws?version=1&format=json${query ? `&${query}` : ''}`;
    const ws = new WebSocket(url);
    const frames = new Set<(f: Frame) => void>();
    const closes = new Set<(code: number) => void>();
    ws.addEventListener('message', (ev) => {
      const frame = JSON.parse(String(ev.data)) as Frame;
      for (const l of frames) l(frame);
    });
    ws.addEventListener('close', (ev) => {
      for (const l of closes) l(ev.code);
    });
    const socket: Socket = {
      send: (frame) => ws.send(JSON.stringify(frame)),
      close: () => ws.close(),
      onFrame: (l) => (frames.add(l), () => frames.delete(l)),
      onClose: (l) => (closes.add(l), () => closes.delete(l)),
    };
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve(socket), { once: true });
      ws.addEventListener('error', () => reject(new Error(`socket error: ${url}`)), { once: true });
    });
  }
}
