ALTER TABLE creator_passkeys ADD COLUMN player_id TEXT REFERENCES players(player_id);
CREATE INDEX IF NOT EXISTS creator_passkeys_player_idx ON creator_passkeys(player_id);
