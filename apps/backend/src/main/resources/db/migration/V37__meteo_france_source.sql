-- Météo-France vigilance as instrument (solo-capable when API key configured)
INSERT INTO saiae_source_registry (id, name, tier, base_weight, is_instrument, is_authoritative, solo_floor, typically_republishes) VALUES
('meteo_france', 'Météo-France Vigilance', 1, 40, true, true, 88, NULL)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    base_weight = EXCLUDED.base_weight,
    is_instrument = EXCLUDED.is_instrument,
    is_authoritative = EXCLUDED.is_authoritative,
    solo_floor = EXCLUDED.solo_floor;
