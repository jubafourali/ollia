CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE raw_safety_events
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(100) NOT NULL,
    external_id VARCHAR(500),
    title VARCHAR(1000),
    description TEXT,
    source_url TEXT,
    country VARCHAR(255),
    city VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    event_occurred_at TIMESTAMP WITH TIME ZONE,
    collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    category VARCHAR(100),
    severity_hint VARCHAR(100),
    language VARCHAR(20),
    content_hash VARCHAR(255) NOT NULL,
    raw_payload JSONB NOT NULL
);

CREATE INDEX idx_signal_source
    ON raw_safety_events(source);

CREATE INDEX idx_signal_collected_at
    ON raw_safety_events(collected_at DESC);

CREATE INDEX idx_signal_external_id
    ON raw_safety_events(external_id);

CREATE INDEX idx_signal_event_occurred_at
    ON raw_safety_events(event_occurred_at DESC);

CREATE INDEX idx_signal_country
    ON raw_safety_events(country);

CREATE INDEX idx_signal_city
    ON raw_safety_events(city);

CREATE INDEX idx_signal_category
    ON raw_safety_events(category);

CREATE INDEX idx_signal_severity
    ON raw_safety_events(severity_hint);

CREATE INDEX idx_signal_payload_gin
    ON raw_safety_events
    USING GIN(raw_payload);