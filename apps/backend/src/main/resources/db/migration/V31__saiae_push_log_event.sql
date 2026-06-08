-- Per-event push dedup: record which event each push was about, so the same
-- alert isn't re-pushed to the same observer (while still allowing escalation).
ALTER TABLE saiae_push_log
    ADD COLUMN IF NOT EXISTS normalized_event_id UUID;

CREATE INDEX IF NOT EXISTS idx_push_log_user_event
    ON saiae_push_log(user_id, normalized_event_id, sent_at DESC);