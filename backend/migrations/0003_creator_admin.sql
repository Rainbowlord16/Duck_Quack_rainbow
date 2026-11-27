CREATE TABLE IF NOT EXISTS creator_passkeys(credential_id TEXT PRIMARY KEY,slot INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK(slot=1),public_key_json TEXT NOT NULL,sign_count INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_challenges(challenge_hash TEXT PRIMARY KEY,purpose TEXT NOT NULL CHECK(purpose IN('register','login')),expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS admin_challenges_expiry_idx ON admin_challenges(expires_at);
CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,type TEXT NOT NULL,arg TEXT NOT NULL DEFAULT '',target_player_id TEXT REFERENCES players(player_id),target_label TEXT NOT NULL,message TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS admin_events_created_idx ON admin_events(id);