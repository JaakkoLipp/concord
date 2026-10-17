/**
 * The TOTP setup's QR code (M4.8 task 9). `uqr` (MIT, from Project Nayuki's generator) is imported here only, when
 * the setup step opens (m4.8-plan.md decision 1), and gives the modules; TwoFactor.svelte draws them as SVG.
 */
import { m } from '$lib/i18n/index.ts';

/** The key URI authenticator apps read: the issuer and the account's email label the entry. */
export function otpauthUri(secret: string, account: string): string {
  const issuer = m.app.name;
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

/** The QR code's modules, row by row, true for dark, with the quiet zone included. */
export async function qrModules(text: string): Promise<boolean[][]> {
  const { encode } = await import('uqr');
  return encode(text, { ecc: 'M', border: 4 }).data;
}
