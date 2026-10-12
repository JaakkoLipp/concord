import { BACKEND } from './config.ts';

export type Auth = { session: string } | { bot: string } | null;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, method: string, path: string, body: unknown) {
    super(`${method} ${path} -> ${status} ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authHeaders(auth: Auth): Record<string, string> {
  if (!auth) return {};
  return 'session' in auth ? { 'x-session-token': auth.session } : { 'x-bot-token': auth.bot };
}

/**
 * One Stoat request with rate-limit pacing: a 429 waits `retry_after` and retries, and a response that
 * empties its bucket waits out `X-RateLimit-Reset-After` before returning, so the caller's next request fits.
 */
export async function api<T = unknown>(
  method: string,
  path: string,
  opts: { auth?: Auth; body?: unknown; form?: FormData; base?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const url = (opts.base ?? `${BACKEND}/api`) + path;
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { ...authHeaders(opts.auth ?? null), ...opts.headers };
    let body: BodyInit | null = null;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : null;
    if (res.status === 429 && attempt < 20) {
      const after = Number((parsed as { retry_after?: number } | null)?.retry_after ?? res.headers.get('x-ratelimit-reset-after') ?? 1000);
      await sleep(after + 50);
      continue;
    }
    if (!res.ok) throw new ApiError(res.status, method, path, parsed);
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      await sleep(Number(res.headers.get('x-ratelimit-reset-after') ?? 0) + 50);
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Upload a file to Autumn under a tag such as avatars, backgrounds, icons, banners, emojis or attachments. */
export async function upload(auth: Auth, tag: string, name: string, data: Uint8Array, type: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([data as Uint8Array<ArrayBuffer>], { type }), name);
  const res = await api<{ id: string }>('POST', `/${tag}`, { auth, form, base: `${BACKEND}/autumn` });
  return res.id;
}
