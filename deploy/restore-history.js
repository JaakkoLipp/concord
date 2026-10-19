// The database half of restore-history.sh (m4.7-plan.md task 10), run by mongosh against Stoat's database with the
// snapshot restored beside it as `concord_restore`. Inserts only documents whose IDs are missing, so running it twice is
// harmless. Prints one JSON line of counts, then one `FILE <bucket> <key>` line per stored object the restored files need.
// Set by the caller with --eval: CHANNEL (the channel's ID) and DRY (true for a dry run).
/* global db, CHANNEL, DRY */
const live = db.getSiblingDB('revolt');
const snap = db.getSiblingDB('concord_restore');
const out = { channel: CHANNEL, channelRestored: false, messages: 0, files: 0, filesUndeleted: 0, hashes: 0, serverList: false, category: null };

const channel = snap.channels.findOne({ _id: CHANNEL });
if (!channel) {
  print(JSON.stringify({ ...out, error: 'the channel is not in this snapshot' }));
  quit(2);
}
if (!live.channels.findOne({ _id: CHANNEL }, { _id: 1 })) {
  out.channelRestored = true;
  if (!DRY) live.channels.insertOne(channel);
}

// Its messages missing now, by ID, a page at a time so the shell's memory stays small.
const missing = [];
snap.messages.find({ channel: CHANNEL }, { _id: 1 }).forEach((m) => {
  missing.push(m._id);
  if (missing.length >= 1000) flush();
});
flush();
function flush() {
  if (!missing.length) return;
  const have = new Set(live.messages.find({ _id: { $in: missing } }, { _id: 1 }).toArray().map((m) => m._id));
  const gone = missing.filter((id) => !have.has(id));
  if (gone.length) {
    const docs = snap.messages.find({ _id: { $in: gone } }).toArray();
    out.messages += docs.length;
    if (!DRY) live.messages.insertMany(docs, { ordered: false });
    for (const m of docs) for (const a of m.attachments ?? []) restoreFile(a._id);
  }
  missing.length = 0;
}

// A message's files. Stoat 0.15.5 marks a singly deleted message's file deleted, and crond then removes its record, hash
// and object within seconds (the drill, 2026-10-19). Bulk and channel deletion leave the files untouched.
function restoreFile(id) {
  const file = snap.attachments.findOne({ _id: id });
  if (!file) return;
  const now = live.attachments.findOne({ _id: id });
  if (!now) {
    out.files++;
    if (!DRY) live.attachments.insertOne(file);
  } else if (now.deleted || now.reported) {
    out.filesUndeleted++;
    if (!DRY) live.attachments.updateOne({ _id: id }, { $unset: { deleted: '', reported: '' } });
  } else return;
  // Stoat 0.15 stores a file's bytes once per hash, with the key and IV in attachment_hashes. Older files are keyed by ID.
  if (file.hash) {
    const hash = snap.attachment_hashes.findOne({ _id: file.hash });
    if (hash && !live.attachment_hashes.findOne({ _id: file.hash }, { _id: 1 })) {
      out.hashes++;
      if (!DRY) live.attachment_hashes.insertOne(hash);
    }
    print(`FILE ${hash?.bucket_id ?? 'revolt-uploads'} ${hash?.path ?? file.hash}`);
  } else print(`FILE ${file.tag ?? 'attachments'} ${file._id}`);
}

// A deleted channel goes back in its server's list, and in its category if that still exists.
const server = live.servers.findOne({ _id: channel.server });
const was = snap.servers.findOne({ _id: channel.server });
if (server) {
  if (!(server.channels ?? []).includes(CHANNEL)) {
    out.serverList = true;
    if (!DRY) live.servers.updateOne({ _id: server._id }, { $addToSet: { channels: CHANNEL } });
  }
  const category = (was?.categories ?? []).find((c) => (c.channels ?? []).includes(CHANNEL));
  const liveCategory = category && (server.categories ?? []).find((c) => c.id === category.id);
  if (liveCategory && !(liveCategory.channels ?? []).includes(CHANNEL)) {
    out.category = category.title ?? category.id;
    if (!DRY) live.servers.updateOne({ _id: server._id, 'categories.id': category.id }, { $addToSet: { 'categories.$.channels': CHANNEL } });
  }
}
print(JSON.stringify(out));
