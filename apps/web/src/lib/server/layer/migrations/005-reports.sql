-- Reports (m4.7-plan.md task 9). `content` is a copy of the reported message's text, kept as evidence: the one exception
-- to the layer's rule of storing no Stoat data. It is dropped 90 days after the report is closed.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('message', 'user')),
  -- The server a message was in. NULL for a DM or group message and for a user: those go to the app's admins.
  server TEXT,
  channel TEXT,
  message TEXT,
  reported TEXT NOT NULL,
  content TEXT,
  reason TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  closed_by TEXT,
  closed_at INTEGER,
  close_note TEXT
) STRICT;
CREATE INDEX reports_server ON reports(server, status, created_at);
CREATE INDEX reports_reporter ON reports(reporter, created_at);
