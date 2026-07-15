-- Profile photo URL (e.g. from Clerk) so family member cards can show a face.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(1000);