-- One-time "scheduled mode" check-in deadline (e.g. "alert my circle if I don't check in by 5 PM")
ALTER TABLE users
    ADD COLUMN scheduled_check_in_deadline TIMESTAMPTZ;
