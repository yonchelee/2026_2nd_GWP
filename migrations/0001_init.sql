-- 2026 2분기 GWP 선물 대시보드 스키마
CREATE TABLE IF NOT EXISTS gifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  url         TEXT,
  price       INTEGER NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  registrant  TEXT,
  note        TEXT,
  pw_salt     TEXT    NOT NULL,
  pw_hash     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gifts_created_at ON gifts (created_at);
