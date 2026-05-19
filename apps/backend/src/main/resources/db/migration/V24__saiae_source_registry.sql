-- Mark raw signals as processed by the normalizer
ALTER TABLE raw_safety_events ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_raw_signal_processed ON raw_safety_events(processed);

-- SAIAE source registry: defines trust, weight, and echo-chain patterns per source
CREATE TABLE saiae_source_registry (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    tier            INT NOT NULL,
    base_weight     INT NOT NULL,
    is_instrument   BOOLEAN NOT NULL DEFAULT false,
    is_authoritative BOOLEAN NOT NULL DEFAULT false,
    solo_floor      INT,
    typically_republishes VARCHAR[]
);

INSERT INTO saiae_source_registry (id, name, tier, base_weight, is_instrument, is_authoritative, solo_floor, typically_republishes) VALUES
('usgs',         'USGS',                      1, 38, true,  true,  88,   NULL),
('noaa',         'NOAA',                      1, 38, true,  true,  88,   NULL),
('gdacs',        'GDACS',                     1, 38, true,  true,  88,   NULL),
('government',   'Government / Emergency',    1, 38, false, true,  64,   NULL),
('reuters',      'Reuters',                   1, 32, false, false, NULL, NULL),
('ap',           'Associated Press',          1, 32, false, false, NULL, NULL),
('police',       'Police feed',               2, 26, false, true,  61,   NULL),
('bbc',          'BBC',                       2, 20, false, false, NULL, ARRAY['reuters','ap']),
('local_media',  'Local trusted media',       3, 12, false, false, NULL, NULL);
