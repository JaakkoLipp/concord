CREATE TABLE beta_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'claiming', 'used', 'failed')),
  reviewed_by TEXT,
  expires_at INTEGER,
  token_hash TEXT UNIQUE
) STRICT;
CREATE INDEX beta_invitations_requester ON beta_invitations(requested_by, created_at);
CREATE UNIQUE INDEX beta_invitations_open_email ON beta_invitations(email) WHERE status IN ('pending', 'approved', 'claiming');

