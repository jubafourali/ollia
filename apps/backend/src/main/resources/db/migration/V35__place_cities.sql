-- Canonical city seed for SAIAE place resolution (documented + queryable).
-- Runtime matching uses PlaceResolver; this table keeps the seed versioned.
CREATE TABLE IF NOT EXISTS place_cities (
    city_key      VARCHAR(80) PRIMARY KEY,
    display_name  VARCHAR(120) NOT NULL,
    country       VARCHAR(120) NOT NULL,
    latitude      DOUBLE PRECISION NOT NULL,
    longitude     DOUBLE PRECISION NOT NULL
);

INSERT INTO place_cities (city_key, display_name, country, latitude, longitude) VALUES
('algiers', 'Algiers', 'Algeria', 36.75, 3.06),
('oran', 'Oran', 'Algeria', 35.7, -0.6),
('dubai', 'Dubai', 'United Arab Emirates', 25.2, 55.3),
('abu dhabi', 'Abu Dhabi', 'United Arab Emirates', 24.5, 54.4),
('paris', 'Paris', 'France', 48.86, 2.35),
('lyon', 'Lyon', 'France', 45.76, 4.84),
('marseille', 'Marseille', 'France', 43.3, 5.4),
('london', 'London', 'United Kingdom', 51.5, -0.12),
('cairo', 'Cairo', 'Egypt', 30.1, 31.2),
('casablanca', 'Casablanca', 'Morocco', 33.6, -7.6),
('beirut', 'Beirut', 'Lebanon', 33.9, 35.5),
('riyadh', 'Riyadh', 'Saudi Arabia', 24.7, 46.7),
('doha', 'Doha', 'Qatar', 25.3, 51.5),
('nairobi', 'Nairobi', 'Kenya', -1.3, 36.8),
('lagos', 'Lagos', 'Nigeria', 6.5, 3.4),
('istanbul', 'Istanbul', 'Turkey', 41.0, 29.0),
('berlin', 'Berlin', 'Germany', 52.5, 13.4),
('madrid', 'Madrid', 'Spain', 40.4, -3.7),
('rome', 'Rome', 'Italy', 41.9, 12.5),
('toronto', 'Toronto', 'Canada', 43.7, -79.4),
('montreal', 'Montreal', 'Canada', 45.5, -73.6),
('new york', 'New York', 'United States', 40.7, -74.0),
('singapore', 'Singapore', 'Singapore', 1.35, 103.8),
('sydney', 'Sydney', 'Australia', -33.9, 151.2),
('sarajevo', 'Sarajevo', 'Bosnia and Herzegovina', 43.85, 18.4),
('tokyo', 'Tokyo', 'Japan', 35.7, 139.7)
ON CONFLICT (city_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    country = EXCLUDED.country,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;
