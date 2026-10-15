-- Server tags (m4.5-plan.md task 10): a server's short tag with one of its custom emoji as the badge, and which
-- tag each user wears. Only what Stoat has no place for; names, icons and membership stay Stoat's.
CREATE TABLE server_tags (
  server TEXT PRIMARY KEY,
  tag TEXT NOT NULL,
  emoji TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- Disabling a server's tag removes it from everyone wearing it.
CREATE TABLE worn_tags (
  user TEXT PRIMARY KEY,
  server TEXT NOT NULL REFERENCES server_tags (server) ON DELETE CASCADE,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX worn_tags_server ON worn_tags (server);
