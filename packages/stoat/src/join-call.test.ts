/** `join_call` (m4-plan.md task 4): the request, and Stoat's refusals mapped to reasons the UI can toast. */
import { JoinCallError, isFinalJoinFailure, joinFailure } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { StoatBackend } from './backend.ts';
import type { HttpRequest, HttpResponse, Transport } from './transport.ts';

const C = '01M4WPBMZW1D977DMJNR76RZQE';
const LIMITS = { 'x-ratelimit-bucket': 'c', 'x-ratelimit-limit': '15', 'x-ratelimit-remaining': '14', 'x-ratelimit-reset-after': '10000' };

function backend(answer: (req: HttpRequest) => HttpResponse) {
  const seen: HttpRequest[] = [];
  const transport: Transport = {
    request: async (req) => {
      seen.push(req);
      return answer(req);
    },
    connect: () => Promise.reject(new Error('no socket')),
  };
  const b = new StoatBackend(transport);
  b.setToken('t');
  return { b, seen };
}

describe('joinCall', () => {
  it('asks for a token on the node, ending the call on other devices, and ignores the URL', async () => {
    const { b, seen } = backend(() => ({ status: 200, headers: LIMITS, body: { token: 'jwt', url: 'wss://elsewhere/livekit' } }));
    expect(await b.joinCall(C, 'worldwide')).toEqual({ token: 'jwt' });
    expect(seen).toMatchObject([{ method: 'POST', path: `/channels/${C}/join_call`, body: { node: 'worldwide', force_disconnect: true } }]);
  });

  it.each([
    [400, 'CannotJoinCall', 'full'],
    [400, 'NotAVoiceChannel', 'not-voice'],
    [400, 'AlreadyConnected', 'already-connected'],
    [400, 'LiveKitUnavailable', 'unavailable'],
    [400, 'UnknownNode', 'unavailable'],
    [403, 'MissingPermission', 'no-permission'],
    [404, 'NotFound', 'not-found'],
    [500, 'InternalError', 'unavailable'],
    [400, 'IsBot', 'unknown'],
  ] as const)('maps %i %s to %s', async (status, type, reason) => {
    const { b } = backend(() => ({ status, headers: LIMITS, body: { type, location: 'x' } }));
    const e = await b.joinCall(C, 'worldwide').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(JoinCallError);
    expect(joinFailure(e)).toBe(reason);
  });

  it('calls a network failure a network failure', async () => {
    const { b } = backend(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(joinFailure(await b.joinCall(C, 'worldwide').catch((x: unknown) => x))).toBe('network');
  });

  it('stops rejoining only for what retrying cannot fix', () => {
    expect(isFinalJoinFailure('no-permission')).toBe(true);
    expect(isFinalJoinFailure('not-voice')).toBe(true);
    expect(isFinalJoinFailure('full')).toBe(false);
    expect(isFinalJoinFailure('unavailable')).toBe(false);
    expect(isFinalJoinFailure('network')).toBe(false);
  });
});
