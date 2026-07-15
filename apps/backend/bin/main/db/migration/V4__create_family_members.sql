CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    circle_id UUID NOT NULL REFERENCES family_circles(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    UNIQUE(circle_id, user_id)
);

CREATE INDEX idx_family_members_circle_id ON family_members(circle_id);
CREATE INDEX idx_family_members_user_id ON family_members(user_id);
