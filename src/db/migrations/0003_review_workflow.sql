-- Unify the glyph review vocabulary (pending/acceptable/unacceptable/enhancement_proposed)
-- and add submitter/reviewer lineage so a human can submit a replacement glyph that a
-- *different* human must independently validate.
UPDATE formation_symbols SET status = 'acceptable'   WHERE status = 'approved';
UPDATE formation_symbols SET status = 'unacceptable' WHERE status = 'rejected';

ALTER TABLE formation_symbols ADD COLUMN source TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE formation_symbols ADD COLUMN submitted_by TEXT;
ALTER TABLE formation_symbols ADD COLUMN reviewed_by TEXT;
ALTER TABLE formation_symbols ADD COLUMN replaces_symbol_id INTEGER REFERENCES formation_symbols(id);
CREATE INDEX idx_symbols_source ON formation_symbols(source);

-- Human-submitted corrections to formation_reports.formation_type_tags. Kept as a
-- separate table (not a direct overwrite of formation_type_tags) because `enrich`
-- unconditionally recomputes that column from deriveTags(description) on every run
-- and has no way to know a value was human-set; export prefers the latest accepted
-- proposal for a formation over the auto-derived tags instead.
CREATE TABLE tag_proposals (
  id INTEGER PRIMARY KEY,
  formation_report_id INTEGER NOT NULL REFERENCES formation_reports(id),
  proposed_tags TEXT NOT NULL,
  rationale TEXT,
  submitted_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  review_notes TEXT,
  replaces_proposal_id INTEGER REFERENCES tag_proposals(id),
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX idx_tag_proposals_formation ON tag_proposals(formation_report_id);
CREATE INDEX idx_tag_proposals_status ON tag_proposals(status);
