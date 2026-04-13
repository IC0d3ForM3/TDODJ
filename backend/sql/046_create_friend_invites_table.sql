CREATE TABLE IF NOT EXISTS friend_invites (
  id SERIAL PRIMARY KEY,
  inviterkey UUID NOT NULL REFERENCES users(key) ON DELETE CASCADE,
  inviteekey UUID NOT NULL REFERENCES users(key) ON DELETE CASCADE,
  code VARCHAR(16) NOT NULL UNIQUE,
  isused BOOLEAN NOT NULL DEFAULT FALSE,
  createdat TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (inviterkey <> inviteekey)
);

CREATE INDEX IF NOT EXISTS idx_friend_invites_inviterkey ON friend_invites(inviterkey);
CREATE INDEX IF NOT EXISTS idx_friend_invites_code ON friend_invites(code);
