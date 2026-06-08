-- 파트별 식당 현황
CREATE TABLE IF NOT EXISTS restaurants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  part        TEXT    NOT NULL,           -- 파트명
  restaurant  TEXT    NOT NULL,           -- 식당명
  category    TEXT,                       -- 메뉴/종류
  headcount   INTEGER,                    -- 인원
  url         TEXT,                       -- 위치/예약 링크
  note        TEXT,                       -- 메모
  pw_salt     TEXT    NOT NULL,
  pw_hash     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_restaurants_created_at ON restaurants (created_at);
