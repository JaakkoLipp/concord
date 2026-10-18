/**
 * m4.7-plan.md task 10's drill, on the local dev stack (vps-runbook.md section 9): on a throwaway server, a channel with
 * messages and attachments is deleted, and messages are bulk-deleted from another. `history-snapshot.sh --to` took a copy
 * before; `restore-history.sh --from` brings both back, and a second run brings nothing. Restic isn't needed.
 * Usage: node tools/live/src/history-drill.ts   (needs Docker and the stack at ~/stoat)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDevStack } from '../../seed/src/vps.ts';
import { BACKEND } from '../../seed/src/config.ts';
import { upload } from '../../seed/src/http.ts';
import { person } from './people.ts';

await assertDevStack();
const failures: string[] = [];
const check = (ok: boolean, what: string, actual?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${actual === undefined ? '' : ` -> ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(what);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEPLOY = join(import.meta.dirname, '..', '..', '..', 'deploy');
const sh = (script: string, args: string[]) => execFileSync('bash', [join(DEPLOY, script), ...args], { encoding: 'utf8' });
// A 1-pixel PNG, made unique per file so each has its own hash and stored object.
const png = (n: number) => {
  const base = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  return new Uint8Array(Buffer.concat([base, Buffer.from(`drill-${n}-${Date.now()}`)]));
};

const owner = await person('dev-admin');
const member = await person('dev');
const made = await owner.call<{ server: { _id: string }; channels: { _id: string }[] }>('POST', '/servers/create', { name: `m47-drill ${Date.now() % 100000}` });
const server = made.server._id;
const keep = made.channels[0]!._id;
const gone = (await owner.call<{ _id: string }>('POST', `/servers/${server}/channels`, { type: 'Text', name: 'doomed' }))._id;
const folder = mkdtempSync(join(tmpdir(), 'concord-drill-'));
try {
  const invite = await owner.call<{ _id: string }>('POST', `/channels/${keep}/invites`);
  await member.call('POST', `/invites/${invite._id}`);
  // A category holding the doomed channel, so the restore can put it back there.
  await owner.call('PATCH', `/servers/${server}`, { categories: [{ id: 'drillcat', title: 'Drill', channels: [gone] }] });
  const files: string[] = [];
  for (let i = 0; i < 3; i++) files.push(await upload(member.auth, 'attachments', `drill-${i}.png`, png(i), 'image/png'));
  const doomed: string[] = [];
  for (let i = 0; i < 20; i++) {
    const body = i < 3 ? { content: `doomed ${i}`, attachments: [files[i]] } : { content: `doomed ${i}` };
    doomed.push((await member.call<{ _id: string }>('POST', `/channels/${gone}/messages`, body))._id);
  }
  const kept: string[] = [];
  for (let i = 0; i < 10; i++) kept.push((await member.call<{ _id: string }>('POST', `/channels/${keep}/messages`, { content: `kept ${i}` }))._id);
  const attachment = (await member.call<{ attachments?: { _id: string }[] }>('GET', `/channels/${gone}/messages/${doomed[0]}`)).attachments?.[0]?._id ?? '';
  const fileOk = async () => (await fetch(`${BACKEND}/autumn/attachments/${attachment}`)).status;
  check(await fileOk() === 200, 'an attachment opens before', await fileOk());

  // The snapshot, then the wipe: the channel, and 5 messages bulk-deleted from the other.
  console.log(sh('history-snapshot.sh', ['--to', folder]).trim());
  await owner.call('DELETE', `/channels/${gone}`);
  await owner.call('DELETE', `/channels/${keep}/messages/bulk`, { ids: kept.slice(0, 5) });
  // crond purges the files of deleted messages within about a minute.
  await sleep(75_000);
  check(await fileOk() !== 200, 'the attachment is gone after the wipe', await fileOk());

  const dry = sh('restore-history.sh', ['--channel', gone, '--from', folder, '--dry-run']);
  console.log(dry.trim());
  const counts = JSON.parse(dry.split('\n').find((l) => l.startsWith('{')) ?? '{}') as { messages?: number; channelRestored?: boolean; files?: number; filesUndeleted?: number };
  check(counts.messages === 20 && counts.channelRestored === true, 'the dry run counts the channel and its 20 messages', counts);
  check(await member.call<unknown[]>('GET', `/channels/${keep}/messages?limit=50`).then((m) => m.length === 5), 'the dry run changes nothing');

  console.log(sh('restore-history.sh', ['--channel', gone, '--from', folder]).trim());
  console.log(sh('restore-history.sh', ['--channel', keep, '--from', folder]).trim());
  const back = await member.call<{ content?: string }[]>('GET', `/channels/${gone}/messages?limit=50`).catch(() => []);
  check(back.length === 20, 'the deleted channel’s 20 messages are back', back.length);
  check((await member.call<unknown[]>('GET', `/channels/${keep}/messages?limit=50`)).length === 10, 'the 5 bulk-deleted messages are back');
  const s = await owner.call<{ channels: string[]; categories?: { id: string; channels: string[] }[] }>('GET', `/servers/${server}`);
  check(s.channels.includes(gone) && !!s.categories?.find((c) => c.id === 'drillcat')?.channels.includes(gone), 'the channel is back in its server and category');
  check(await fileOk() === 200, 'the attachment opens again', await fileOk());

  const again = sh('restore-history.sh', ['--channel', gone, '--from', folder]);
  const second = JSON.parse(again.split('\n').find((l) => l.startsWith('restored: '))?.slice(10) ?? '{}') as { messages?: number; channelRestored?: boolean; files?: number };
  check(second.messages === 0 && second.channelRestored === false && second.files === 0, 'a second run brings nothing back', second);
} finally {
  await owner.call('DELETE', `/servers/${server}`).catch(() => {});
  rmSync(folder, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
