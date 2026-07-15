-- Inactivity escalation state + emergency contact fields on users
ALTER TABLE users
    ADD COLUMN inactivity_threshold_hours INT NOT NULL DEFAULT 3,
    ADD COLUMN escalation_level          INT NOT NULL DEFAULT 0,
    ADD COLUMN escalation_changed_at     TIMESTAMPTZ,
    ADD COLUMN emergency_contact_name    VARCHAR(255),
    ADD COLUMN emergency_contact_phone   VARCHAR(50);

-- Index for the escalation scheduler query (users needing escalation checks)
CREATE INDEX idx_users_escalation ON users (escalation_level, last_seen_at)
    WHERE last_seen_at IS NOT NULL;
