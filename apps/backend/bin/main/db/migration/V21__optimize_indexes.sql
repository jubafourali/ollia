-- Optimize existing indexes and add missing ones for common query patterns

-- activity_signals: compound index for time-windowed user queries (frequent pattern analysis)
CREATE INDEX idx_activity_signals_user_id_created_at
  ON activity_signals(user_id, created_at DESC);

-- users: escalation detection queries used in background jobs
CREATE INDEX idx_users_escalation_level_last_seen_at
  ON users(escalation_level, last_seen_at);

-- users: plan filtering for premium vs free features
CREATE INDEX idx_users_plan ON users(plan);

-- users: effective plan calculation (founding member status check)
CREATE INDEX idx_users_founding_member_expires_at
  ON users(founding_member, founding_expires_at)
  WHERE founding_member = true;

-- family_circles: list circles by owner (single circle per user, but index improves findAllByOwnerId)
CREATE INDEX idx_family_circles_owner_id ON family_circles(owner_id);

-- family_circles: plan-based filtering
CREATE INDEX idx_family_circles_plan ON family_circles(plan);

-- family_invites: bulk deletion by circle (needed for cascade operations)
CREATE INDEX idx_family_invites_circle_id ON family_invites(circle_id);

-- family_invites: list user's sent invites
CREATE INDEX idx_family_invites_created_by ON family_invites(created_by);

-- family_invites: cleanup expired invites (periodic maintenance query)
CREATE INDEX idx_family_invites_expires_at ON family_invites(expires_at);

-- push_tokens: platform filtering for bulk platform-specific sends (iOS vs Android)
CREATE INDEX idx_push_tokens_platform ON push_tokens(platform);

-- safety_events: regional queries with time ordering (common in user interface)
CREATE INDEX idx_safety_events_fetched_at_desc_region
  ON safety_events(fetched_at DESC, region);

-- safety_events: source lookup for bulk deletion during refresh cycle
CREATE INDEX idx_safety_events_source ON safety_events(source);

-- notification_log: compound index for user's notification history with ordering
CREATE INDEX idx_notification_log_user_id_sent_at_desc
  ON notification_log(user_id, sent_at DESC);

-- notification_log: compound index for admin filtering by type with ordering
CREATE INDEX idx_notification_log_type_sent_at_desc
  ON notification_log(notification_type, sent_at DESC);

-- notification_log: status tracking for failed notifications
CREATE INDEX idx_notification_log_status ON notification_log(status);

