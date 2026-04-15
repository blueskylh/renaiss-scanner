CREATE TABLE IF NOT EXISTS renaiss_cards (
  token_id TEXT PRIMARY KEY,
  item_id TEXT,
  name TEXT,
  set_name TEXT,
  card_number TEXT,
  character_name TEXT,
  owner_address TEXT,
  owner_username TEXT,
  vault_location TEXT,
  serial TEXT,
  serial_num INTEGER,
  grader TEXT,
  grade TEXT,
  language TEXT,
  year INTEGER,
  image_url TEXT,
  ask_price REAL,
  offer_price REAL,
  fmv REAL,
  buyback_base_value REAL,
  is_listed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_renaiss_cards_serial_num ON renaiss_cards(serial_num);
CREATE INDEX IF NOT EXISTS idx_renaiss_cards_is_listed ON renaiss_cards(is_listed);

-- 复合索引：覆盖连号查询的 WHERE + ORDER BY，减少回表读取
CREATE INDEX IF NOT EXISTS idx_renaiss_cards_listed_serial ON renaiss_cards(is_listed, ask_price, serial_num);

CREATE TABLE IF NOT EXISTS scan_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  indexed_count INTEGER NOT NULL DEFAULT 0,
  listed_count INTEGER NOT NULL DEFAULT 0,
  consecutive_pairs INTEGER NOT NULL DEFAULT 0,
  last_full_scan TEXT,
  last_listing_refresh TEXT,
  is_scanning INTEGER NOT NULL DEFAULT 0,
  scan_progress TEXT,
  last_source_total INTEGER NOT NULL DEFAULT 0
);

-- API 响应缓存表：存储预计算的连号配对 JSON，避免 /api/scanner 每次都读取整张 cards 表
CREATE TABLE IF NOT EXISTS api_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pairs_json TEXT NOT NULL DEFAULT '[]',
  total_pairs INTEGER NOT NULL DEFAULT 0,
  total_cards INTEGER NOT NULL DEFAULT 0,
  total_listed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT INTO scan_status (id, indexed_count, listed_count, consecutive_pairs, is_scanning, scan_progress, last_source_total)
VALUES (1, 0, 0, 0, 0, 'Idle', 0)
ON CONFLICT(id) DO NOTHING;

INSERT INTO api_cache (id, pairs_json, total_pairs, total_cards, total_listed, updated_at)
VALUES (1, '[]', 0, 0, 0, '1970-01-01T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING;
