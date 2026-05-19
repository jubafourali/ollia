-- Add SAIAE scoring columns to normalized_safety_events
ALTER TABLE normalized_safety_events ADD COLUMN IF NOT EXISTS risk_level    VARCHAR(30);
ALTER TABLE normalized_safety_events ADD COLUMN IF NOT EXISTS risk_score    INT;
ALTER TABLE normalized_safety_events ADD COLUMN IF NOT EXISTS floor_applied BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE normalized_safety_events ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_norm_event_risk  ON normalized_safety_events(risk_level);
CREATE INDEX IF NOT EXISTS idx_norm_event_expires ON normalized_safety_events(expires_at);

-- Which sources confirmed each normalized event, with origin-chain tracking
CREATE TABLE saiae_event_source_match (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_event_id  UUID NOT NULL REFERENCES normalized_safety_events(id) ON DELETE CASCADE,
    source_id            VARCHAR(50) NOT NULL REFERENCES saiae_source_registry(id),
    reported_at          TIMESTAMPTZ NOT NULL,
    origin_source_id     VARCHAR(50) REFERENCES saiae_source_registry(id)  -- NULL = original, SET = echo
);

CREATE INDEX idx_esm_event    ON saiae_event_source_match(normalized_event_id);
CREATE INDEX idx_esm_source   ON saiae_event_source_match(source_id);
