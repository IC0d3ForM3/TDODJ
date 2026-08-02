-- Holds the available subscription plans (e.g. month, year) and their prices.
-- Add more rows via INSERT as new plans are introduced.

CREATE TABLE IF NOT EXISTS subscriptions (
  id     SERIAL PRIMARY KEY,
  type   TEXT           NOT NULL UNIQUE,
  price  NUMERIC(10, 2) NOT NULL
);

INSERT INTO subscriptions (type, price) VALUES
  ('month', 9.99),
  ('year',  99.99)
ON CONFLICT (type) DO NOTHING;
