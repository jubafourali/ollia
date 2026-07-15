-- Add travel mode and travel destination to users
ALTER TABLE users ADD COLUMN travel_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN travel_destination VARCHAR(255);

-- Add relation label to family_members (alongside existing role)
ALTER TABLE family_members ADD COLUMN relation VARCHAR(100) NOT NULL DEFAULT 'Family';

-- Add plan to family_circles
ALTER TABLE family_circles ADD COLUMN plan VARCHAR(50) NOT NULL DEFAULT 'free';

-- Create safety_events table
CREATE TABLE safety_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    region VARCHAR(255),
    severity VARCHAR(50) NOT NULL,
    source VARCHAR(50),
    source_url VARCHAR(1000),
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    event_time TIMESTAMP WITH TIME ZONE NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_safety_events_region ON safety_events(region);
CREATE INDEX idx_safety_events_fetched_at ON safety_events(fetched_at);
CREATE INDEX idx_safety_events_type ON safety_events(type);
