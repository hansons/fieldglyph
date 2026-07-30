CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  status TEXT NOT NULL,
  recovery_priority INTEGER,
  notes TEXT
);

CREATE TABLE fetch_log (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL,
  page_type TEXT NOT NULL,
  fetch_mode TEXT NOT NULL,
  wayback_timestamp TEXT,
  http_status INTEGER,
  fetched_at TEXT NOT NULL,
  cache_path TEXT,
  error TEXT
);
CREATE INDEX idx_fetch_log_source ON fetch_log(source_id);
CREATE INDEX idx_fetch_log_url ON fetch_log(url);

CREATE TABLE formation_reports (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  source_url TEXT NOT NULL,
  external_id TEXT,

  fetch_mode TEXT NOT NULL,
  wayback_timestamp TEXT,
  wayback_url TEXT,
  retrieved_at TEXT NOT NULL,
  raw_cache_path TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  harvest_confidence TEXT,

  title TEXT,
  description TEXT,
  reported_by TEXT,

  discovered_date TEXT,
  discovered_date_precision TEXT,
  time_observed TEXT,
  discovery_vs_witnessed TEXT,

  location_name TEXT,
  country TEXT,
  admin_region TEXT,
  latitude REAL,
  longitude REAL,
  coordinate_source TEXT,
  location_precision TEXT,
  os_grid_ref TEXT,

  crop_type TEXT,
  formation_type TEXT,
  formation_type_tags TEXT,
  diameter_meters REAL,
  verification_status TEXT NOT NULL DEFAULT 'reported',
  anomaly_notes TEXT,

  parse_warnings TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_formation_source ON formation_reports(source_id);
CREATE INDEX idx_formation_date ON formation_reports(discovered_date);
CREATE INDEX idx_formation_geo ON formation_reports(latitude, longitude);

CREATE TABLE formation_media (
  id INTEGER PRIMARY KEY,
  formation_report_id INTEGER NOT NULL REFERENCES formation_reports(id),
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  caption TEXT,
  copyright_notice TEXT,
  photographer TEXT,
  license TEXT,
  is_aerial INTEGER,
  local_thumbnail_path TEXT
);
CREATE INDEX idx_media_formation ON formation_media(formation_report_id);
