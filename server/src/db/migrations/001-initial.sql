CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE images (
  id          TEXT PRIMARY KEY,
  mime        TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  byte_size   INTEGER NOT NULL,
  uploaded_by TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE card_sets (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  forked_from_set_id TEXT REFERENCES card_sets(id),
  revision           INTEGER NOT NULL DEFAULT 1,
  archived_at        INTEGER,
  created_by         TEXT REFERENCES users(id),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE cards (
  id          TEXT PRIMARY KEY,
  set_id      TEXT NOT NULL REFERENCES card_sets(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  body        TEXT NOT NULL,
  image_id    TEXT NOT NULL REFERENCES images(id),
  metadata    TEXT,
  position    INTEGER NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1,
  archived_at INTEGER,
  created_by  TEXT REFERENCES users(id),
  updated_by  TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (id, set_id)
);

CREATE TABLE decks (
  id          TEXT PRIMARY KEY,
  set_id      TEXT NOT NULL REFERENCES card_sets(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  revision    INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT REFERENCES users(id),
  updated_by  TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (id, set_id)
);

CREATE TABLE deck_cards (
  deck_id TEXT NOT NULL,
  set_id  TEXT NOT NULL,
  card_id TEXT NOT NULL,
  copies  INTEGER NOT NULL CHECK (copies BETWEEN 1 AND 99),
  PRIMARY KEY (deck_id, card_id),
  FOREIGN KEY (deck_id, set_id) REFERENCES decks(id, set_id) ON DELETE CASCADE,
  FOREIGN KEY (card_id, set_id) REFERENCES cards(id, set_id)
);

