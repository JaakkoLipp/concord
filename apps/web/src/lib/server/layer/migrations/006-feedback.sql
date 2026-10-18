CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  reporter TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'feedback')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  closed_by TEXT,
  closed_at INTEGER
) STRICT;
CREATE INDEX feedback_status ON feedback(status, created_at);
CREATE INDEX feedback_reporter ON feedback(reporter, created_at);
