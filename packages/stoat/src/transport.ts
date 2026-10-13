/**
 * The lowest layer of the Stoat adapter: raw HTTP exchanges and WebSocket frames, nothing Stoat-specific.
 * The live transport talks to a real stack. The recording transport wraps it to capture fixtures, and the
 * replay transport plays fixtures back, so tests and the UI gallery see exactly what the code saw.
 */

export interface HttpRequest {
  method: string;
  /** Path under the API root, with query string: `/channels/{id}/messages?limit=50`. */
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  /** Lower-case names. Only headers the adapter reads are kept in fixtures. */
  headers: Record<string, string>;
  body: unknown;
}

export interface Frame {
  type: string;
  [key: string]: unknown;
}

export interface Socket {
  send(frame: Frame): void;
  close(): void;
  onFrame(listener: (frame: Frame) => void): () => void;
  onClose(listener: (code: number) => void): () => void;
}

export interface Transport {
  request(req: HttpRequest): Promise<HttpResponse>;
  /** `query` is the socket URL's query string after `version=1&format=json`, such as `ready=users&ready=servers`. */
  connect(query?: string): Promise<Socket>;
  /** A multipart upload to Autumn at `/autumn{path}`, reporting progress as a fraction. Only the live transport has it. */
  upload?(path: string, form: FormData, headers: Record<string, string>, onProgress?: (fraction: number) => void): Promise<HttpResponse>;
}

/** Ready fields the client requests: every field except synced settings, which Stoat's Ready never delivers. */
export const READY_FIELDS = ['users', 'servers', 'channels', 'members', 'emojis', 'voice_states', 'channel_unreads', 'policy_changes'];
export const readyQuery = (fields = READY_FIELDS) => fields.map((f) => `ready=${f}`).join('&');

/** Response headers worth keeping: rate limits and content type. */
export const KEPT_HEADERS = ['content-type', 'x-ratelimit-limit', 'x-ratelimit-bucket', 'x-ratelimit-remaining', 'x-ratelimit-reset-after'];
