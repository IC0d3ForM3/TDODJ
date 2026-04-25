CREATE TABLE IF NOT EXISTS tavern_stash (
  userguid TEXT PRIMARY KEY,
  stash_json JSONB NOT NULL DEFAULT '[]'
);
