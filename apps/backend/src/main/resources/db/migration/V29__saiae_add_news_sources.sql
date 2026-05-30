-- Add GDELT and NewsData to the source registry.
-- GDELT: T1 aggregator, broad global coverage, real-time, no key.
-- NewsData: T2 news aggregator, structured filtering, free tier.
-- Both are treated as non-instrument, non-authoritative — they require
-- corroboration in the Police Engine to score above the LOW tier alone.

INSERT INTO saiae_source_registry (id, name, tier, base_weight, is_instrument, is_authoritative, solo_floor, typically_republishes) VALUES
('gdelt',    'GDELT Project',    1, 28, false, false, NULL, NULL),
('newsdata', 'NewsData.io',      2, 20, false, false, NULL, ARRAY['reuters','ap','bbc']);
