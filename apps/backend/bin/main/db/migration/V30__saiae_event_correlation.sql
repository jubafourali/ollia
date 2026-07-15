-- Event correlation support.
--
-- 1) Link merged duplicate events to the canonical sibling they were folded into.
ALTER TABLE normalized_safety_events
    ADD COLUMN IF NOT EXISTS canonical_event_id UUID REFERENCES normalized_safety_events(id);

CREATE INDEX IF NOT EXISTS idx_norm_event_canonical
    ON normalized_safety_events(canonical_event_id);

-- 2) Enforce one source-match per (event, source). Multiple articles from the same
--    source must collapse to a single origin (echo-chain protection at the data layer).
--    De-duplicate any pre-existing rows before adding the constraint.
DELETE FROM saiae_event_source_match a
USING saiae_event_source_match b
WHERE a.ctid < b.ctid
  AND a.normalized_event_id = b.normalized_event_id
  AND a.source_id = b.source_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_esm_event_source
    ON saiae_event_source_match(normalized_event_id, source_id);