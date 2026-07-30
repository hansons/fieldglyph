CREATE TABLE formation_symbols (
  id INTEGER PRIMARY KEY,
  formation_report_id INTEGER NOT NULL REFERENCES formation_reports(id),
  source_image_url TEXT NOT NULL,
  model TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  svg TEXT NOT NULL,
  confidence TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  generated_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX idx_symbols_formation ON formation_symbols(formation_report_id);
CREATE INDEX idx_symbols_status ON formation_symbols(status);
