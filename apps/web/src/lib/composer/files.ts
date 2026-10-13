/**
 * Choosing attachments (client.md section 6.3): at most the backend's count per message, each within its
 * size limit, refused before uploading with a reason.
 */
import { Permission, has, type Channel, type Store } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { permissionsIn } from '$lib/view/channels.ts';
import { compose, type Chosen } from '$lib/view/compose.svelte.ts';
import { toasts } from '$lib/view/toast.svelte.ts';

let next = 0;

export function choose(files: File[], already: number, limits: { count: number; size: number }): { chosen: Chosen[]; refused: string[] } {
  const chosen: Chosen[] = [];
  const refused: string[] = [];
  for (const file of files) {
    if (file.size > limits.size) refused.push(m.files.tooLarge(file.name, m.files.size(limits.size)));
    else if (already + chosen.length >= limits.count) refused.push(m.files.tooMany(limits.count));
    else chosen.push({ key: `f${next++}`, file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined });
  }
  return { chosen, refused: [...new Set(refused)] };
}

/** Attach files to the next message in a channel: checked against permission and limits, with a notice for each refusal. */
export function attachFiles(store: Store, channel: Channel, files: File[]): void {
  if (!files.length) return;
  if (!has(permissionsIn(store, channel), Permission.UploadFiles)) return toasts.show(m.files.noPermission);
  const limits = { count: store.node?.limits.attachments ?? 5, size: store.node?.uploadLimits.attachments ?? 20_000_000 };
  const { chosen, refused } = choose(files, compose.files[channel.id]?.length ?? 0, limits);
  if (chosen.length) compose.addFiles(channel.id, chosen);
  for (const r of refused) toasts.show(r);
  compose.focus();
}
