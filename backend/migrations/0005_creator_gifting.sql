PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gift_transactions (
  gift_id TEXT PRIMARY KEY,
  actor_player_id TEXT NOT NULL REFERENCES players(player_id),
  target_player_id TEXT NOT NULL REFERENCES players(player_id),
  resource TEXT NOT NULL CHECK(resource IN ('quacks')),
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 1000000000),
  created_at INTEGER NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1))
);

CREATE INDEX IF NOT EXISTS gift_transactions_target_idx
  ON gift_transactions(target_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_transactions_actor_idx
  ON gift_transactions(actor_player_id, created_at DESC);
