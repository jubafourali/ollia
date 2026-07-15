-- Official non-US weather instruments (solo floors match USGS/NOAA so Police can verify alone)
INSERT INTO saiae_source_registry (id, name, tier, base_weight, is_instrument, is_authoritative, solo_floor, typically_republishes) VALUES
('meteoalarm',  'MeteoAlarm / EUMETNET', 1, 38, true, true, 88, NULL),
('open_meteo',  'Open-Meteo Extremes',   1, 38, true, true, 88, NULL)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    base_weight = EXCLUDED.base_weight,
    is_instrument = EXCLUDED.is_instrument,
    is_authoritative = EXCLUDED.is_authoritative,
    solo_floor = EXCLUDED.solo_floor;
