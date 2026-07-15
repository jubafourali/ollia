-- activity_signals
ALTER TABLE activity_signals DROP CONSTRAINT IF EXISTS activity_signals_user_id_fkey;
ALTER TABLE activity_signals ADD CONSTRAINT activity_signals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- push_tokens
ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_fkey;
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- family_members (user)
ALTER TABLE family_members DROP CONSTRAINT IF EXISTS family_members_user_id_fkey;
ALTER TABLE family_members ADD CONSTRAINT family_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- family_members (circle)
ALTER TABLE family_members DROP CONSTRAINT IF EXISTS family_members_circle_id_fkey;
ALTER TABLE family_members ADD CONSTRAINT family_members_circle_id_fkey
    FOREIGN KEY (circle_id) REFERENCES family_circles(id) ON DELETE CASCADE;

-- family_invites (circle)
ALTER TABLE family_invites DROP CONSTRAINT IF EXISTS family_invites_circle_id_fkey;
ALTER TABLE family_invites ADD CONSTRAINT family_invites_circle_id_fkey
    FOREIGN KEY (circle_id) REFERENCES family_circles(id) ON DELETE CASCADE;

-- family_invites (created_by)
ALTER TABLE family_invites DROP CONSTRAINT IF EXISTS family_invites_created_by_fkey;
ALTER TABLE family_invites ADD CONSTRAINT family_invites_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- family_invites (used_by) — SET NULL since the invitee may still exist
ALTER TABLE family_invites DROP CONSTRAINT IF EXISTS family_invites_used_by_fkey;
ALTER TABLE family_invites ADD CONSTRAINT family_invites_used_by_fkey
    FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL;

-- family_circles (owner)
ALTER TABLE family_circles DROP CONSTRAINT IF EXISTS family_circles_owner_id_fkey;
ALTER TABLE family_circles ADD CONSTRAINT family_circles_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;