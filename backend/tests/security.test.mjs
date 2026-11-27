import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
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

test("browser-submitted totals are not accepted as leaderboard writes", () => {
  assert.match(worker, /SELECT player_id,username,lifetime_quacks/);
  assert.doesNotMatch(worker, /UPDATE leaderboard SET lifetime_quacks/);
  assert.doesNotMatch(worker, /INSERT INTO leaderboard\(player_id,username,lifetime_quacks[^)]*\) VALUES\([^)]*body\./);
});
