-- Creates normalized_safety_events (was never created by a prior migration)
-- and saiae_event_source_match which references it.
-- All SAIAE scoring columns included from the start — no ALTER needed.

CREATE TABLE IF NOT EXISTS normalized_safety_events
(
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_signal_id     UUID          NOT NULL,
    source            VARCHAR(100)  NOT NULL,
    category          VARCHAR(100)  NOT NULL,
    severity          VARCHAR(50)   NOT NULL,
    title             VARCHAR(1000) NOT NULL,
    description       VARCHAR(5000),
    country           VARCHAR(255),
    city              VARCHAR(255),
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    radius_km         DOUBLE PRECISION,
    event_occurred_at TIMESTAMPTZ,
    normalized_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    status            VARCHAR(50)   NOT NULL DEFAULT 'PENDING_VERIFICATION',
    risk_level        VARCHAR(30),
    risk_score        INT,
    floor_applied     BOOLEAN       NOT NULL DEFAULT false,
    expires_at        TIMESTAMPTZ
    );

CREATE INDEX IF NOT EXISTS idx_event_country      ON normalized_safety_events(country);
CREATE INDEX IF NOT EXISTS idx_event_city         ON normalized_safety_events(city);
CREATE INDEX IF NOT EXISTS idx_event_category     ON normalized_safety_events(category);
CREATE INDEX IF NOT EXISTS idx_event_status       ON normalized_safety_events(status);
CREATE INDEX IF NOT EXISTS idx_norm_event_risk    ON normalized_safety_events(risk_level);
CREATE INDEX IF NOT EXISTS idx_norm_event_expires ON normalized_safety_events(expires_at);

-- Which sources confirmed each normalized event, with origin-chain tracking
CREATE TABLE IF NOT EXISTS saiae_event_source_match (
                                                        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_event_id  UUID NOT NULL REFERENCES normalized_safety_events(id) ON DELETE CASCADE,
    source_id            VARCHAR(50) NOT NULL REFERENCES saiae_source_registry(id),
    reported_at          TIMESTAMPTZ NOT NULL,
    origin_source_id     VARCHAR(50) REFERENCES saiae_source_registry(id)
    );

CREATE INDEX IF NOT EXISTS idx_esm_event  ON saiae_event_source_match(normalized_event_id);
CREATE INDEX IF NOT EXISTS idx_esm_source ON saiae_event_source_match(source_id);