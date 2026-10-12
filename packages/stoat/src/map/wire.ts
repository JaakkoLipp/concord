/** Shorthands for Stoat's generated wire types. Only packages/stoat imports these. */
import type { components } from '../api/types.ts';

type S = components['schemas'];
export type WFile = S['File'];
export type WUser = S['User'];
export type WServer = S['Server'];
export type WRole = S['Role'];
export type WChannel = S['Channel'];
export type WMember = S['Member'];
export type WEmoji = S['Emoji'];
export type WMessage = S['Message'];
export type WEmbed = S['Embed'];
export type WSystemMessage = S['SystemMessage'];
export type WUnread = S['ChannelUnread'];
export type WOverride = { a: number; d: number };

/** Stoat sends 64-bit masks as JSON numbers. Bits above 2^53 can't survive JSON.parse; Stoat defines none. */
export const big = (n: number | undefined | null): bigint => BigInt(n ?? 0);
export const override = (o: WOverride | undefined | null) => ({ allow: big(o?.a), deny: big(o?.d) });

/** Drop undefined values, so optional properties stay absent under exactOptionalPropertyTypes. */
export function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined || o[k] === null) delete o[k];
  return o;
}
