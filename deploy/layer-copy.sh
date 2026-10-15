#!/usr/bin/env bash
# A consistent copy of Concord's own layer's store (architecture section 11.5), for backup.sh: VACUUM INTO, taken by
# a one-off node process in concord-web, so the server keeps running and no HTTP endpoint is involved. It writes
# concord/data/layer-backup.db, replaced only once the new copy passes its integrity check, and exits non-zero
# on any failure, leaving the previous copy. The live layer.db, its -wal and -shm are never what gets saved.
set -euo pipefail
cd "$(dirname "$0")/.."
exec concord/dc exec -T concord-web node -e '
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const src = "/srv/data/layer.db", tmp = "/srv/data/layer-backup.db.tmp", out = "/srv/data/layer-backup.db";
if (!fs.existsSync(src)) { console.error("layer copy: no store at " + src); process.exit(1); }
fs.rmSync(tmp, { force: true });
const db = new DatabaseSync(src);
db.exec("PRAGMA busy_timeout = 5000");
db.exec("VACUUM INTO \x27" + tmp + "\x27");
db.close();
const copy = new DatabaseSync(tmp, { readOnly: true });
const check = copy.prepare("PRAGMA integrity_check").get().integrity_check;
const version = copy.prepare("PRAGMA user_version").get().user_version;
copy.close();
if (check !== "ok") { console.error("layer copy: integrity check said " + check); process.exit(1); }
fs.renameSync(tmp, out);
console.log("layer copy: ok, version " + version + ", " + fs.statSync(out).size + " bytes");
'
