-- ============================================================
-- TDODJ Clean Schema  (generated from all migrations 000-063)
-- All tables in their FINAL state — no incremental ALTER TABLE noise.
-- Safe to run on a fresh database (IF NOT EXISTS guards throughout).
-- Seed data (monsters, weapons, spells, potions) is in separate
-- INSERT scripts and must be run AFTER an admin user exists.
-- ============================================================

-- ── 1. users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username    TEXT    NOT NULL UNIQUE,
  email       TEXT    NOT NULL UNIQUE,
  password    TEXT    NOT NULL,
  isactive    BOOLEAN NOT NULL DEFAULT FALSE,
  isconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
  isadmin     BOOLEAN NOT NULL DEFAULT FALSE,
  ismasteradmin BOOLEAN NOT NULL DEFAULT FALSE,
  iscreator   BOOLEAN NOT NULL DEFAULT FALSE,
  key         UUID    NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE INDEX IF NOT EXISTS idx_users_key      ON users (key);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);


-- ── 2. images ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS images (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid  UUID    NOT NULL,
  path      TEXT    NOT NULL,
  ispublic  BOOLEAN NOT NULL DEFAULT FALSE,
  isactive  BOOLEAN NOT NULL DEFAULT TRUE,
  name      TEXT    NOT NULL DEFAULT 'Unnamed Image',
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_images_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_images_userguid ON images (userguid);
CREATE INDEX IF NOT EXISTS idx_images_ispublic ON images (ispublic);
CREATE INDEX IF NOT EXISTS idx_images_isactive ON images (isactive);
CREATE INDEX IF NOT EXISTS idx_images_updatedat ON images (updatedat DESC);


-- ── 3. sounds ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sounds (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid  UUID    NOT NULL,
  path      TEXT    NOT NULL,
  ispublic  BOOLEAN NOT NULL DEFAULT FALSE,
  isactive  BOOLEAN NOT NULL DEFAULT TRUE,
  name      TEXT    NOT NULL DEFAULT 'Unnamed Sound',
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_sounds_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sounds_userguid  ON sounds (userguid);
CREATE INDEX IF NOT EXISTS idx_sounds_ispublic  ON sounds (ispublic);
CREATE INDEX IF NOT EXISTS idx_sounds_isactive  ON sounds (isactive);
CREATE INDEX IF NOT EXISTS idx_sounds_updatedat ON sounds (updatedat DESC);


-- ── 4. spells ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spells (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid         UUID    NOT NULL,
  name             VARCHAR(255) NOT NULL DEFAULT '',
  description      TEXT         NOT NULL DEFAULT '',
  range            INTEGER      NOT NULL DEFAULT 0,
  effecton         VARCHAR(255) NOT NULL DEFAULT '',
  effecton2        VARCHAR(255) NOT NULL DEFAULT '',
  lastfor          INTEGER      NOT NULL DEFAULT 0,
  damage           INTEGER      NOT NULL DEFAULT 0,
  effectamount2    INTEGER      NOT NULL DEFAULT 0,
  value            INTEGER      NOT NULL DEFAULT 0,
  sp               INTEGER      NOT NULL DEFAULT 0,
  successtestvalue INTEGER      NOT NULL DEFAULT 0,
  magiccost        INTEGER      NOT NULL DEFAULT 0,
  costtolearn      INTEGER      NOT NULL DEFAULT 0,
  imageid          INTEGER      NULL,
  soundid          INTEGER      NULL,
  ispublic         BOOLEAN      NOT NULL DEFAULT FALSE,
  createdat        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_spells_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_spells_imageid
    FOREIGN KEY (imageid) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_spells_soundid
    FOREIGN KEY (soundid) REFERENCES sounds (id)
    ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_spells_userguid ON spells (userguid);
CREATE INDEX IF NOT EXISTS idx_spells_ispublic ON spells (ispublic);


-- ── 5. potions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS potions (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid      UUID         NOT NULL,
  name          VARCHAR(255) NOT NULL DEFAULT '',
  description   TEXT         NOT NULL DEFAULT '',
  type          VARCHAR(50)  NOT NULL DEFAULT 'health',
  effectto      VARCHAR(255) NOT NULL DEFAULT 'HP',
  effectto2     VARCHAR(255) NULL,
  effecttime    INTEGER      NOT NULL DEFAULT 0,
  effectnumber  INTEGER      NOT NULL DEFAULT 0,
  effectamount2 INTEGER      NOT NULL DEFAULT 0,
  value         INTEGER      NOT NULL DEFAULT 0,
  imageid       INTEGER      NULL,
  soundid       INTEGER      NULL,
  ispublic      BOOLEAN      NOT NULL DEFAULT FALSE,
  createdat     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_potions_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_potions_imageid
    FOREIGN KEY (imageid) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_potions_soundid
    FOREIGN KEY (soundid) REFERENCES sounds (id)
    ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_potions_userguid ON potions (userguid);
CREATE INDEX IF NOT EXISTS idx_potions_ispublic ON potions (ispublic);


-- ── 6. curses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curses (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid    UUID         NOT NULL,
  name        VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT         NOT NULL DEFAULT '',
  effectto    VARCHAR(255) NOT NULL DEFAULT 'HP',
  effectto2   VARCHAR(255) NULL,
  effect      VARCHAR(255) NOT NULL DEFAULT '',
  damage      INTEGER      NOT NULL DEFAULT 0,
  damage2     INTEGER      NOT NULL DEFAULT 0,
  lastfor     INTEGER      NOT NULL DEFAULT 0,
  imageid     INTEGER      NULL,
  soundid     INTEGER      NULL,
  ispublic    BOOLEAN      NOT NULL DEFAULT FALSE,
  createdat   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_curses_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_curses_imageid
    FOREIGN KEY (imageid) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_curses_soundid
    FOREIGN KEY (soundid) REFERENCES sounds (id)
    ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_curses_userguid ON curses (userguid);
CREATE INDEX IF NOT EXISTS idx_curses_ispublic ON curses (ispublic);


-- ── 7. items ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid    UUID         NOT NULL,
  name        VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT         NOT NULL DEFAULT '',
  type        VARCHAR(50)  NOT NULL DEFAULT 'other'
              CHECK (type IN ('weapon','armor','pick','light','ring','necklace','gem','other')),
  range       VARCHAR(255) NOT NULL DEFAULT '',
  range2      VARCHAR(255) NOT NULL DEFAULT '',
  value       INTEGER      NOT NULL DEFAULT 0,
  weight      INTEGER      NOT NULL DEFAULT 0,
  curseid     INTEGER      NULL,
  effectto    VARCHAR(255) NOT NULL DEFAULT '',
  effectto2   VARCHAR(255) NOT NULL DEFAULT '',
  damage      INTEGER      NOT NULL DEFAULT 0,
  damage2     INTEGER      NOT NULL DEFAULT 0,
  effectvalue INTEGER      NOT NULL DEFAULT 0,
  effecton    TEXT         DEFAULT NULL,
  armorslot   TEXT         DEFAULT NULL,
  istwohanded BOOLEAN      NOT NULL DEFAULT FALSE,
  imageid     INTEGER      NULL,
  soundid     INTEGER      NULL,
  ispublic    BOOLEAN      NOT NULL DEFAULT FALSE,
  createdat   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_items_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_items_imageid
    FOREIGN KEY (imageid) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_items_soundid
    FOREIGN KEY (soundid) REFERENCES sounds (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_items_curseid
    FOREIGN KEY (curseid) REFERENCES curses (id)
    ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_items_userguid ON items (userguid);
CREATE INDEX IF NOT EXISTS idx_items_ispublic ON items (ispublic);
CREATE INDEX IF NOT EXISTS idx_items_type     ON items (type);


-- ── 8. treshers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treshers (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid    UUID         NOT NULL,
  name        VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT         NOT NULL DEFAULT '',
  type        VARCHAR(50)  NOT NULL DEFAULT 'OtherTresher'
              CHECK (type IN ('Weapon','Armor','Coins','Potion','OtherTresher')),
  ispublic    BOOLEAN      NOT NULL DEFAULT FALSE,
  spreward    INTEGER      NOT NULL DEFAULT 0,
  isquest     BOOLEAN      NOT NULL DEFAULT FALSE,
  -- coins
  gold        INTEGER      NOT NULL DEFAULT 0,
  silver      INTEGER      NOT NULL DEFAULT 0,
  copper      INTEGER      NOT NULL DEFAULT 0,
  zinc        INTEGER      NOT NULL DEFAULT 0,
  -- item slots
  item1id     INTEGER      NULL,
  item2id     INTEGER      NULL,
  item3id     INTEGER      NULL,
  item4id     INTEGER      NULL,
  -- spell slots
  spell1id    INTEGER      NULL,
  spell2id    INTEGER      NULL,
  spell3id    INTEGER      NULL,
  spell4id    INTEGER      NULL,
  -- curse slots
  curse1id    INTEGER      NULL,
  curse2id    INTEGER      NULL,
  -- potion slots
  potion1id   INTEGER      NULL,
  potion2id   INTEGER      NULL,
  potion3id   INTEGER      NULL,
  -- media
  imageid     INTEGER      NULL,
  soundid     INTEGER      NULL,
  createdat   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_treshers_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_treshers_imageid
    FOREIGN KEY (imageid) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_treshers_soundid
    FOREIGN KEY (soundid) REFERENCES sounds (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_treshers_item1id  FOREIGN KEY (item1id)  REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_item2id  FOREIGN KEY (item2id)  REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_item3id  FOREIGN KEY (item3id)  REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_item4id  FOREIGN KEY (item4id)  REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_spell1id FOREIGN KEY (spell1id) REFERENCES spells (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_spell2id FOREIGN KEY (spell2id) REFERENCES spells (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_spell3id FOREIGN KEY (spell3id) REFERENCES spells (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_spell4id FOREIGN KEY (spell4id) REFERENCES spells (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_curse1id FOREIGN KEY (curse1id) REFERENCES curses (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_curse2id FOREIGN KEY (curse2id) REFERENCES curses (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_potion1id FOREIGN KEY (potion1id) REFERENCES potions (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_potion2id FOREIGN KEY (potion2id) REFERENCES potions (id) ON DELETE SET NULL,
  CONSTRAINT fk_treshers_potion3id FOREIGN KEY (potion3id) REFERENCES potions (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_treshers_userguid ON treshers (userguid);
CREATE INDEX IF NOT EXISTS idx_treshers_ispublic  ON treshers (ispublic);
CREATE INDEX IF NOT EXISTS idx_treshers_spreward  ON treshers (spreward);


-- ── 9. monsters ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monsters (
  id                         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid                   UUID         NOT NULL,
  name                       VARCHAR(255) NOT NULL DEFAULT '',
  type                       VARCHAR(50)  NOT NULL DEFAULT 'Beast',
  description                TEXT         NOT NULL DEFAULT '',
  hp                         INTEGER      NOT NULL DEFAULT 1,
  movmenteconomy             INTEGER      NOT NULL DEFAULT 3,
  ac                         INTEGER      NOT NULL DEFAULT 10,
  runat                      INTEGER      NOT NULL DEFAULT 0,
  numberofattacks            INTEGER      NOT NULL DEFAULT 1,
  magic                      INTEGER      NOT NULL DEFAULT 0,
  magicresistance            INTEGER      NOT NULL DEFAULT 0,
  spreward                   INTEGER      NOT NULL DEFAULT 0,
  tohitplusneeded            INTEGER      NOT NULL DEFAULT 0,
  callsreinforcements        BOOLEAN      NOT NULL DEFAULT FALSE,
  reinforcementcount         INTEGER      NOT NULL DEFAULT 0,
  reinforcementmonstername   TEXT,
  ispublic                   BOOLEAN      NOT NULL DEFAULT FALSE,
  imageid                    INTEGER      NULL,
  soundid                    INTEGER      NULL,
  tresherids                 JSONB        NOT NULL DEFAULT '[]'::jsonb,
  keyids                     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  -- NPC fields
  npc_greeting               TEXT,
  npc_info_1                 TEXT,
  npc_info_2                 TEXT,
  npc_info_3                 TEXT,
  npc_only_attack_when_attacked   BOOLEAN NOT NULL DEFAULT FALSE,
  npc_gives_info_after_damaged    BOOLEAN NOT NULL DEFAULT FALSE,
  npc_attacks_after_info          BOOLEAN NOT NULL DEFAULT FALSE,
  npc_can_trade                   BOOLEAN NOT NULL DEFAULT FALSE,
  createdat                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_monsters_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_monsters_imageid
    FOREIGN KEY (imageid) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_monsters_soundid
    FOREIGN KEY (soundid) REFERENCES sounds (id)
    ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_monsters_userguid   ON monsters (userguid);
CREATE INDEX IF NOT EXISTS idx_monsters_ispublic   ON monsters (ispublic);
CREATE INDEX IF NOT EXISTS idx_monsters_spreward   ON monsters (spreward);
CREATE INDEX IF NOT EXISTS idx_monsters_tresherids ON monsters USING GIN (tresherids);
CREATE INDEX IF NOT EXISTS idx_monsters_keyids     ON monsters USING GIN (keyids);


-- ── 10. dungons ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dungons (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid         UUID         NOT NULL,
  name             VARCHAR(255) NOT NULL DEFAULT '',
  description      TEXT         NOT NULL DEFAULT '',
  intro            TEXT         NOT NULL DEFAULT '',
  dungonJson       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  squaresJson      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  ispublished      BOOLEAN      NOT NULL DEFAULT FALSE,
  isapproved       BOOLEAN      NOT NULL DEFAULT FALSE,
  ispublic         BOOLEAN      NOT NULL DEFAULT TRUE,
  issample         BOOLEAN      NOT NULL DEFAULT FALSE,
  ismaingame       BOOLEAN      NOT NULL DEFAULT FALSE,
  resettable_per_pc BOOLEAN     NOT NULL DEFAULT FALSE,
  minsplifetime    INTEGER      NOT NULL DEFAULT 0,
  maxsplifetime    INTEGER      NOT NULL DEFAULT 1000000,
  spreward         INTEGER      NOT NULL DEFAULT 0,
  doorsprreward    JSONB        DEFAULT NULL,
  imageid          INTEGER      NULL REFERENCES images (id) ON DELETE SET NULL,
  createdat        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_dungons_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dungons_userguid       ON dungons (userguid);
CREATE INDEX IF NOT EXISTS idx_dungons_ispublished    ON dungons (ispublished);
CREATE INDEX IF NOT EXISTS idx_dungons_isapproved     ON dungons (isapproved);
CREATE INDEX IF NOT EXISTS idx_dungons_ispublic       ON dungons (ispublic);
CREATE INDEX IF NOT EXISTS idx_dungons_issample       ON dungons (issample) WHERE issample = TRUE;
CREATE INDEX IF NOT EXISTS idx_dungons_ismaingame     ON dungons (ismaingame);
CREATE INDEX IF NOT EXISTS idx_dungons_sp_requirements ON dungons (minsplifetime, maxsplifetime);
CREATE INDEX IF NOT EXISTS idx_dungons_spreward       ON dungons (spreward);


-- ── 11. dungonfriends ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dungonfriends (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dungonid        INTEGER  NOT NULL,
  friendurid      UUID     NOT NULL,
  isactivefriend  BOOLEAN  NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_dungonfriends_dungonid
    FOREIGN KEY (dungonid) REFERENCES dungons (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_dungonfriends_friendurid
    FOREIGN KEY (friendurid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT uq_dungonfriends_dungonid_friendurid
    UNIQUE (dungonid, friendurid)
);
CREATE INDEX IF NOT EXISTS idx_dungonfriends_dungonid      ON dungonfriends (dungonid);
CREATE INDEX IF NOT EXISTS idx_dungonfriends_friendurid    ON dungonfriends (friendurid);
CREATE INDEX IF NOT EXISTS idx_dungonfriends_isactivefriend ON dungonfriends (isactivefriend);


-- ── 12. pcs ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcs (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid             UUID         NOT NULL,
  name                 VARCHAR(255) NOT NULL DEFAULT '',
  species              VARCHAR(255) NOT NULL DEFAULT '',
  type                 VARCHAR(255) NOT NULL DEFAULT '',
  description          TEXT         NOT NULL DEFAULT '',
  -- core stats
  maxHP                INTEGER      NOT NULL DEFAULT 10,
  currentHP            INTEGER      NOT NULL DEFAULT 10,
  ac                   INTEGER      NOT NULL DEFAULT 10,
  actioneconomy        INTEGER      NOT NULL DEFAULT 3,
  strength             INTEGER      NOT NULL DEFAULT 1,
  stamina              INTEGER      NOT NULL DEFAULT 1,
  mind                 INTEGER      NOT NULL DEFAULT 1,
  magicpower           INTEGER      NOT NULL DEFAULT 0,
  numberofattacks      INTEGER      NOT NULL DEFAULT 1,
  numberofdefends      INTEGER      NOT NULL DEFAULT 1 CHECK (numberofdefends >= 1),
  rangeofview          INTEGER      NOT NULL DEFAULT 3,
  sp                   INTEGER      NOT NULL DEFAULT 0 CHECK (sp >= 0),
  -- flags
  issample             BOOLEAN      NOT NULL DEFAULT FALSE,
  ismaingame           BOOLEAN      NOT NULL DEFAULT FALSE,
  -- equipment slots (item FKs added below after items table exists)
  primarytresherid     INTEGER      NULL,
  weapontresherid      INTEGER      NULL,
  headarmortresherid   INTEGER      NULL,
  bodyarmortresherid   INTEGER      NULL,
  leftarmarmortresherid  INTEGER    NULL,
  rightarmarmortresherid INTEGER    NULL,
  leftlegarmortresherid  INTEGER    NULL,
  rightlegarmortresherid INTEGER    NULL,
  hand1itemid          INTEGER      NULL,
  hand2itemid          INTEGER      NULL,
  ring1itemid          INTEGER      NULL,
  ring2itemid          INTEGER      NULL,
  ring3itemid          INTEGER      NULL,
  ring4itemid          INTEGER      NULL,
  ring5itemid          INTEGER      NULL,
  necklaceitemid       INTEGER      NULL,
  -- extra json storage
  tresherids           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  imageid              INTEGER      NULL,
  createdat            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updatedat            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_pcs_userguid
    FOREIGN KEY (userguid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_pcs_imageid
    FOREIGN KEY (imageid) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_primarytresherid
    FOREIGN KEY (primarytresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_weapontresherid
    FOREIGN KEY (weapontresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_headarmortresherid
    FOREIGN KEY (headarmortresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_bodyarmortresherid
    FOREIGN KEY (bodyarmortresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_leftarmarmortresherid
    FOREIGN KEY (leftarmarmortresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_rightarmarmortresherid
    FOREIGN KEY (rightarmarmortresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_leftlegarmortresherid
    FOREIGN KEY (leftlegarmortresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_rightlegarmortresherid
    FOREIGN KEY (rightlegarmortresherid) REFERENCES treshers (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pcs_hand1itemid
    FOREIGN KEY (hand1itemid) REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_pcs_hand2itemid
    FOREIGN KEY (hand2itemid) REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_pcs_ring1itemid
    FOREIGN KEY (ring1itemid) REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_pcs_ring2itemid
    FOREIGN KEY (ring2itemid) REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_pcs_ring3itemid
    FOREIGN KEY (ring3itemid) REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_pcs_ring4itemid
    FOREIGN KEY (ring4itemid) REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_pcs_ring5itemid
    FOREIGN KEY (ring5itemid) REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_pcs_necklaceitemid
    FOREIGN KEY (necklaceitemid) REFERENCES items (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pcs_userguid   ON pcs (userguid);
CREATE INDEX IF NOT EXISTS idx_pcs_updatedat  ON pcs (updatedat DESC);
CREATE INDEX IF NOT EXISTS idx_pcs_tresherids ON pcs USING GIN (tresherids);


-- ── 13. games ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dungonid     INTEGER      NOT NULL,
  userkey      UUID         NOT NULL,
  pcid         INTEGER      DEFAULT NULL,
  gamesession  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  lastupdated  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  createdat    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_games_dungonid
    FOREIGN KEY (dungonid) REFERENCES dungons (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_games_userkey
    FOREIGN KEY (userkey) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_games_pcid
    FOREIGN KEY (pcid) REFERENCES pcs (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT uq_games_dungonid_userkey_pcid
    UNIQUE NULLS NOT DISTINCT (dungonid, userkey, pcid)
);
CREATE INDEX IF NOT EXISTS idx_games_userkey    ON games (userkey);
CREATE INDEX IF NOT EXISTS idx_games_dungonid   ON games (dungonid);
CREATE INDEX IF NOT EXISTS idx_games_lastupdated ON games (lastupdated DESC);
CREATE INDEX IF NOT EXISTS idx_games_createdat  ON games (createdat DESC);


-- ── 14. friends ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friends (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userurid        UUID    NOT NULL,
  friendurid      UUID    NOT NULL,
  isactivefriend  BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_friends_userurid
    FOREIGN KEY (userurid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_friends_friendurid
    FOREIGN KEY (friendurid) REFERENCES users (key)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_friends_not_self
    CHECK (userurid <> friendurid),
  CONSTRAINT uq_friends_userurid_friendurid
    UNIQUE (userurid, friendurid)
);
CREATE INDEX IF NOT EXISTS idx_friends_userurid       ON friends (userurid);
CREATE INDEX IF NOT EXISTS idx_friends_friendurid     ON friends (friendurid);
CREATE INDEX IF NOT EXISTS idx_friends_isactivefriend ON friends (isactivefriend);


-- ── 15. friend_invites ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friend_invites (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inviterkey  UUID         NOT NULL REFERENCES users (key) ON DELETE CASCADE,
  inviteekey  UUID         NOT NULL REFERENCES users (key) ON DELETE CASCADE,
  code        VARCHAR(16)  NOT NULL UNIQUE,
  isused      BOOLEAN      NOT NULL DEFAULT FALSE,
  createdat   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (inviterkey <> inviteekey)
);
CREATE INDEX IF NOT EXISTS idx_friend_invites_inviterkey ON friend_invites (inviterkey);
CREATE INDEX IF NOT EXISTS idx_friend_invites_code       ON friend_invites (code);


-- ── 16. tavern_stash ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tavern_stash (
  userguid   TEXT  PRIMARY KEY,
  stash_json JSONB NOT NULL DEFAULT '[]'
);
