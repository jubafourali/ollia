-- Per-user context computed for each event
CREATE TABLE saiae_context_report (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_event_id  UUID NOT NULL REFERENCES normalized_safety_events(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL,
    effective_risk       VARCHAR(30) NOT NULL,   -- NORMAL | STAY_AWARE | IMPORTANT_DISRUPTION
    floor_applied        BOOLEAN NOT NULL DEFAULT false,
    user_status          VARCHAR(20) NOT NULL,   -- ACTIVE | QUIET | SILENT
    location_relevance   VARCHAR(20) NOT NULL,   -- SAME_CITY | SAME_COUNTRY | BORDER_REGION | DISTANT | UNKNOWN
    calm_sentence        TEXT NOT NULL,
    push_eligible        BOOLEAN NOT NULL DEFAULT false,
    computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(normalized_event_id, user_id)
);

CREATE INDEX idx_ctx_user    ON saiae_context_report(user_id);
CREATE INDEX idx_ctx_event   ON saiae_context_report(normalized_event_id);

-- Final composed output cached per circle member per event
CREATE TABLE saiae_circle_alert_cache (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_event_id  UUID NOT NULL REFERENCES normalized_safety_events(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL,
    effective_risk       VARCHAR(30) NOT NULL,
    floor_applied        BOOLEAN NOT NULL DEFAULT false,
    card_payload         JSONB NOT NULL,
    push_payload         JSONB,
    rendered_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(normalized_event_id, user_id)
);

CREATE INDEX idx_cache_user      ON saiae_circle_alert_cache(user_id);
CREATE INDEX idx_cache_event     ON saiae_circle_alert_cache(normalized_event_id);
CREATE INDEX idx_cache_risk      ON saiae_circle_alert_cache(effective_risk);
CREATE INDEX idx_cache_rendered  ON saiae_circle_alert_cache(rendered_at DESC);
