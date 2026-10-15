-- The store's own facts, such as when it was created. Features add their own tables in later migrations.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

INSERT INTO meta (key, value) VALUES ('created', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
