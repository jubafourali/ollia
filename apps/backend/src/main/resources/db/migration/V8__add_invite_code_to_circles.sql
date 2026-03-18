-- Add invite_code directly on family_circles (reference contract)
ALTER TABLE family_circles ADD COLUMN invite_code VARCHAR(255);

-- Generate invite codes for existing circles
UPDATE family_circles SET invite_code = gen_random_uuid()::text WHERE invite_code IS NULL;

ALTER TABLE family_circles ALTER COLUMN invite_code SET NOT NULL;
CREATE UNIQUE INDEX idx_family_circles_invite_code ON family_circles(invite_code);
