CREATE TABLE saiae_confidence_report (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_event_id  UUID NOT NULL UNIQUE REFERENCES normalized_safety_events(id) ON DELETE CASCADE,
    score                INT NOT NULL,
    tier                 VARCHAR(20) NOT NULL,   -- HIGH | MODERATE | LOW | BLOCKED
    independent_origins  INT NOT NULL,
    conflicting_reports  BOOLEAN NOT NULL DEFAULT false,
    conflict_type        VARCHAR(20),             -- EXISTENCE | DETAIL | null
    conflict_note        VARCHAR(500),
    minimum_sources_met  BOOLEAN NOT NULL,
    computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
