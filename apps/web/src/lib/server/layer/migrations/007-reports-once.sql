-- One open report per person and message (m4.7 review): a second while the first is open is refused, even when sent
-- at once. Closed ones don't count, so a message can be reported again after a moderator has looked at it.
CREATE UNIQUE INDEX reports_open_once ON reports(reporter, message) WHERE status = 'open' AND message IS NOT NULL;
