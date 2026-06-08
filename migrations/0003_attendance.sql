-- 파트별 참석 현황 (7개 고정 파트, 파트당 1행)
CREATE TABLE IF NOT EXISTS attendance (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  part         TEXT    NOT NULL UNIQUE,      -- 파트명(고정 7종)
  attendance   INTEGER NOT NULL DEFAULT 0,   -- 당일 참석 인원
  absent_count INTEGER NOT NULL DEFAULT 0,   -- 미참자 인원수
  absent_names TEXT,                         -- 미참자 성명
  pw_salt      TEXT    NOT NULL,
  pw_hash      TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
