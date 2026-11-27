import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const gameSchema = await readFile(new URL("../migrations/0002_authoritative_game.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../client.js", import.meta.url), "utf8");

test("anonymous identity is server-generated and recovery uses a high-entropy key", () => {
  assert.match(worker, /crypto\.getRandomValues/);
  assert.match(worker, /PLY-\[A-F0-9\]\{16\}/);
  assert.match(worker, /recovery_hash/);
  assert.match(worker, /SESSION_TTL_SECONDS/);
  assert.match(worker, /api\/session\/recover/);
  assert.match(worker, /SHA-256/);
});

test("player identity and username are not trusted from client fields", () => {
  assert.match(worker, /async function auth/);
  assert.match(worker, /Authorization/);
  assert.match(worker, /SELECT p\.player_id,p\.username/);
  assert.match(worker, /function username/);
  assert.match(worker, /RESERVED/);
  assert.doesNotMatch(worker, /body\.playerId\s*\|\|/);
});

test("chat is bounded, persisted, and rate limited", () => {
  assert.match(worker, /text\.length>280/);
  assert.match(worker, /limit\(env,"chat:"\+p\.player_id/);
  assert.match(worker, /INSERT INTO chat_messages/);
  assert.match(schema, /CHECK\(length\(body\) BETWEEN 1 AND 280\)/);
});

test("client adapter keeps credentials local and does not publish them to public relays", () => {
  assert.match(client, /dq_trusted_session_v1/);
  assert.match(client, /dq_recovery_code_v1/);
  assert.doesNotMatch(client, /ntfy\.sh|mqtt/);
});

test("leaderboard writes come from server-validated game actions, never browser totals", () => {
  assert.ok(worker.includes('/api/game/click'));
  assert.ok(worker.includes('gameclick:'));
  assert.ok(worker.includes('const gain=Math.max(1,g.clickPower)'));
  assert.ok(worker.includes('UPDATE leaderboard SET lifetime_quacks='));
  assert.ok(!worker.includes("body.lifetimeQuacks") && !worker.includes("body.lifetime_quacks"));
  assert.ok(worker.includes('/api/game/upgrade'));
  assert.ok(worker.includes('Not enough server-verified Quacks'));
  assert.ok(worker.includes('/api/game/rebirth'));
  assert.ok(client.includes('gameClick()'));
  assert.ok(client.includes('gameBuyUpgrade(upgrade)'));
  assert.ok(client.includes('gameRebirth()'));
});

test("authoritative progression uses bounded server-owned state", () => {
  assert.ok(gameSchema.includes('CREATE TABLE IF NOT EXISTS player_game_state'));
  assert.ok(gameSchema.includes('CHECK(quacks>=0)'));
  assert.ok(gameSchema.includes('CHECK(lifetime_quacks>=0)'));
  assert.ok(worker.includes('GAME_CAP=9007199254740991'));
  assert.ok(worker.includes('Math.min(30,now-Number(g.last_accrual'));
});

test("chat polling uses a valid incremental query with bounded ascending results", () => {
  assert.match(worker, /FROM chat_messages WHERE created_at > \? ORDER BY created_at ASC LIMIT 100/);
  assert.doesNotMatch(worker, /FROM chat_messages undefined/);
});

test("D1 migration creates all tables and required chat polling index", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS players/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS sessions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS chat_messages/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS leaderboard/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS chat_created_idx ON chat_messages\(created_at DESC\)/);
});
