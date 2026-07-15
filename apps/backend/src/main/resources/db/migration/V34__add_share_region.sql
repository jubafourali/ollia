-- Privacy: members can hide city-level region from their circle.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS share_region BOOLEAN NOT NULL DEFAULT TRUE;
