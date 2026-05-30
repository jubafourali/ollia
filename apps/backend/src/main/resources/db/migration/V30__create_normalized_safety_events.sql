-- normalized_safety_events was never created by a prior migration.
-- V25 assumed it existed and failed. This migration creates it now,
-- including all SAIAE columns already added via V25 ALTER statements
-- (which never ran), so everything is in one clean CREATE.

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

    -- SAIAE columns (were in V25 ALTER statements that never ran)
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
