ALTER TABLE users
    ADD COLUMN IF NOT EXISTS stripe_customer_id    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS plan                  VARCHAR(50) NOT NULL DEFAULT 'free';
