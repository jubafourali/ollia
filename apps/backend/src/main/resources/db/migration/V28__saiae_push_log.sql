CREATE TABLE saiae_push_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    event_type          VARCHAR(50) NOT NULL,
    city                VARCHAR(255),
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    risk_level_at_send  VARCHAR(30) NOT NULL,
    confidence_at_send  INT NOT NULL,
    user_status_at_send VARCHAR(20) NOT NULL
);

-- Indexed for fast dedup lookup: userId + eventType + city within time window
CREATE INDEX idx_push_log_dedup ON saiae_push_log(user_id, event_type, city, sent_at DESC);
