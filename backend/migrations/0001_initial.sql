PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS players(player_id TEXT PRIMARY KEY,username TEXT NOT NULL,recovery_hash TEXT NOT NULL,banned INTEGER NOT NULL DEFAULT 0 CHECK(banned IN(0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_player_idx ON sessions(player_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS chat_messages(message_id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(player_id),username TEXT NOT NULL,body TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 280),created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS chat_created_idx ON chat_messages(created_at DESC);
CREATE TABLE IF NOT EXISTS leaderboard(player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,username TEXT NOT NULL,lifetime_quacks INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_quacks>=0),rebirths INTEGER NOT NULL DEFAULT 0 CHECK(rebirths>=0),updated_at INTEGER NOT NULL);
