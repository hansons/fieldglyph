-- Private preservation cache for formation photos: distinct from the
-- still-unused local_thumbnail_path (reserved for a possible future
-- *public* thumbnail feature, gated behind mediaPolicy.cacheThumbnails).
-- local_archive_path is never exported, committed, or served -- it exists
-- purely so a source site going offline doesn't mean losing the photo. See
-- core/mediaCache.ts and commands/archiveMedia.ts.
ALTER TABLE formation_media ADD COLUMN local_archive_path TEXT;
ALTER TABLE formation_media ADD COLUMN archived_at TEXT;
CREATE INDEX idx_media_unarchived ON formation_media(local_archive_path);
