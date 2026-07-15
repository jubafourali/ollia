-- Data-integrity hardening.

-- 1) De-dupe raw signals at the DB layer (the app-level existsBy… checks were racy).
--    external_id is the stable per-source key; nulls are allowed to coexist.
DELETE FROM raw_safety_events a
USING raw_safety_events b
WHERE a.ctid < b.ctid
  AND a.source = b.source
  AND a.external_id IS NOT NULL
  AND a.external_id = b.external_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_source_external
    ON raw_safety_events(source, external_id)
    WHERE external_id IS NOT NULL;

-- 2) Cascade SAIAE per-user rows when a user is deleted (V9 cascades didn't cover SAIAE).
--    Remove any pre-existing orphans first so the constraints can be added.
DELETE FROM saiae_push_log        WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM saiae_context_report  WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM saiae_circle_alert_cache WHERE user_id NOT IN (SELECT id FROM users);

ALTER TABLE saiae_push_log
    ADD CONSTRAINT fk_push_log_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE saiae_context_report
    ADD CONSTRAINT fk_context_report_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE saiae_circle_alert_cache
    ADD CONSTRAINT fk_alert_cache_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;