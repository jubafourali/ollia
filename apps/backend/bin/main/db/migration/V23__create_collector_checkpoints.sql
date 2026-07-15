CREATE TABLE collector_checkpoints
(
    source VARCHAR(100) PRIMARY KEY,
    last_fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    cursor TEXT,
    status VARCHAR(50) NOT NULL
);