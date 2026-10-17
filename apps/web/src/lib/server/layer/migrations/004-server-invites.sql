CREATE TABLE server_invites (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL,
  server TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by TEXT,
  code TEXT
) STRICT;
CREATE INDEX server_invites_requester ON server_invites(requested_by, created_at);
