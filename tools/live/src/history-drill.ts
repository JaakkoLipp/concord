/**
 * m4.7-plan.md task 10's drill, on the local dev stack (vps-runbook.md section 9): on a throwaway server, a channel with
 * messages and attachments is deleted, and messages are bulk-deleted from another and deleted one by one there. Stoat
 * 0.15.5 purges only a message deleted on its own (crond, within seconds): its file record, hash and stored object go,
 * so those are what the restore must copy back. Bulk and channel deletion leave the files as they were.
 * `history-snapshot.sh --to` took a copy before; `restore-history.sh --from` brings all back, and a second run brings
 * nothing. Restic isn't needed.
 * Usage: node tools/live/src/history-drill.ts   (needs Docker and the stack at ~/stoat)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
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
const STOAT = process.env.STOAT ?? join(homedir(), 'stoat');
const mongo = (js: string) => execFileSync(join(STOAT, 'concord', 'dc'), ['exec', '-T', 'database', 'mongosh', '--quiet', 'revolt', '--eval', js], { encoding: 'utf8' }).trim();
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
// Not in /tmp: in WSL that is a tmpfs Docker Desktop can't mount, so the restore's temporary storage would see nothing.
const folder = mkdtempSync(join(homedir(), '.concord-drill-'));
try {
  const invite = await owner.call<{ _id: string }>('POST', `/channels/${keep}/invites`);
  await member.call('POST', `/invites/${invite._id}`);
  // A category holding the doomed channel, so the restore can put it back there.
  await owner.call('PATCH', `/servers/${server}`, { categories: [{ id: 'drillcat', title: 'Drill', channels: [gone] }] });
  const files: string[] = [];
  for (let i = 0; i < 5; i++) files.push(await upload(member.auth, 'attachments', `drill-${i}.png`, png(i), 'image/png'));
  const doomed: string[] = [];
  for (let i = 0; i < 20; i++) {
    const body = i < 3 ? { content: `doomed ${i}`, attachments: [files[i]] } : { content: `doomed ${i}` };
    doomed.push((await member.call<{ _id: string }>('POST', `/channels/${gone}/messages`, body))._id);
  }
  const kept: string[] = [];
  for (let i = 0; i < 10; i++) {
    const body = i < 2 ? { content: `kept ${i}`, attachments: [files[3 + i]] } : { content: `kept ${i}` };
    kept.push((await member.call<{ _id: string }>('POST', `/channels/${keep}/messages`, body))._id);
  }
  const attachmentOf = async (channel: string, message: string) =>
    (await member.call<{ attachments?: { _id: string }[] }>('GET', `/channels/${channel}/messages/${message}`)).attachments?.[0]?._id ?? '';
  const status = async (id: string) => (await fetch(`${BACKEND}/autumn/attachments/${id}`)).status;
  const inChannel = await attachmentOf(gone, doomed[0]!);
  const single = [await attachmentOf(keep, kept[0]!), await attachmentOf(keep, kept[1]!)];
  const fileOk = () => status(inChannel);
  const singleOk = async () => (await Promise.all(single.map(status))).every((s) => s === 200);
  check(await fileOk() === 200 && await singleOk(), 'the attachments open before');

  // The snapshot, then the wipe: the channel, 5 messages bulk-deleted from the other, and its 2 with images one by one.
  console.log(sh('history-snapshot.sh', ['--to', folder]).trim());
  await owner.call('DELETE', `/channels/${gone}`);
  await owner.call('DELETE', `/channels/${keep}/messages/bulk`, { ids: kept.slice(2, 7) });
  for (const id of kept.slice(0, 2)) await owner.call('DELETE', `/channels/${keep}/messages/${id}`);
  // A singly deleted message's file is marked deleted at once (autumn then answers 404), and crond's file deletion then
  // removes its record, hash and object within seconds: wait up to 3 minutes for the records to go.
  const records = () => Number(mongo(`print(db.attachments.countDocuments({ _id: { $in: ${JSON.stringify(single)} } }))`));
  for (let t = 0; t < 36 && records() > 0; t++) await sleep(5_000);
  check(records() === 0 && (await Promise.all(single.map(status))).every((s) => s !== 200), 'the singly deleted messages’ files are purged', await Promise.all(single.map(status)));
  check(await fileOk() === 200, 'the deleted channel’s file is left alone by Stoat', await fileOk());

  const dry = sh('restore-history.sh', ['--channel', gone, '--from', folder, '--dry-run']);
  console.log(dry.trim());
  const counts = JSON.parse(dry.split('\n').find((l) => l.startsWith('{')) ?? '{}') as { messages?: number; channelRestored?: boolean; files?: number; filesUndeleted?: number };
  check(counts.messages === 20 && counts.channelRestored === true, 'the dry run counts the channel and its 20 messages', counts);
  check(await member.call<unknown[]>('GET', `/channels/${keep}/messages?limit=50`).then((m) => m.length === 3), 'the dry run changes nothing');
  const keepDry = sh('restore-history.sh', ['--channel', keep, '--from', folder, '--dry-run']);
  console.log(keepDry.trim());
  check(/files to copy back: 2$/m.test(keepDry) && /"files":2,/.test(keepDry), 'the dry run for the other channel counts 2 purged files to copy back');

  console.log(sh('restore-history.sh', ['--channel', gone, '--from', folder]).trim());
  const keepRun = sh('restore-history.sh', ['--channel', keep, '--from', folder]);
  console.log(keepRun.trim());
  check(/objects copied: 2, not in the snapshot: 0/.test(keepRun), 'the 2 purged objects are copied back');
  const back = await member.call<{ content?: string }[]>('GET', `/channels/${gone}/messages?limit=50`).catch(() => []);
  check(back.length === 20, 'the deleted channel’s 20 messages are back', back.length);
  check((await member.call<unknown[]>('GET', `/channels/${keep}/messages?limit=50`)).length === 10, 'the 7 messages deleted from the other channel are back');
  const s = await owner.call<{ channels: string[]; categories?: { id: string; channels: string[] }[] }>('GET', `/servers/${server}`);
  check(s.channels.includes(gone) && !!s.categories?.find((c) => c.id === 'drillcat')?.channels.includes(gone), 'the channel is back in its server and category');
  check(await fileOk() === 200, 'the deleted channel’s attachment opens', await fileOk());
  check(await singleOk(), 'the purged attachments open again', await Promise.all(single.map(status)));

  const again = sh('restore-history.sh', ['--channel', gone, '--from', folder]);
  const second = JSON.parse(again.split('\n').find((l) => l.startsWith('restored: '))?.slice(10) ?? '{}') as { messages?: number; channelRestored?: boolean; files?: number };
  check(second.messages === 0 && second.channelRestored === false && second.files === 0, 'a second run brings nothing back', second);
  const third = sh('restore-history.sh', ['--channel', keep, '--from', folder]);
  check(/"messages":0,/.test(third) && !/objects copied/.test(third), 'nor for the other channel', third.split('\n').find((l) => l.startsWith('restored: ')));
} finally {
  await owner.call('DELETE', `/servers/${server}`).catch(() => {});
  rmSync(folder, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
