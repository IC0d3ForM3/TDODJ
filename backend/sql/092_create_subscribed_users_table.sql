-- Tracks which users have (or had) a subscription and whether it is currently paid.

CREATE TABLE IF NOT EXISTS subscribed_users (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER                  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER                  NOT NULL REFERENCES subscriptions(id),
  is_paid         BOOLEAN                  NOT NULL DEFAULT FALSE,
  last_paid_on    TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscribed_users_user_id ON subscribed_users (user_id);
CREATE INDEX IF NOT EXISTS idx_subscribed_users_subscription_id ON subscribed_users (subscription_id);
