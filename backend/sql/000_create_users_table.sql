-- Creates the core users table that all other tables reference via key (UUID).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  isactive BOOLEAN NOT NULL DEFAULT FALSE,
  isconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
  isadmin BOOLEAN NOT NULL DEFAULT FALSE,
  ismasteradmin BOOLEAN NOT NULL DEFAULT FALSE,
  iscreator BOOLEAN NOT NULL DEFAULT FALSE,
  key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_users_key ON users (key);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
