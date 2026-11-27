import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const gameSchema = await readFile(new URL("../migrations/0002_authoritative_game.sql", import.meta.url), "utf8");
const adminSchema = await readFile(new URL("../migrations/0003_creator_admin.sql", import.meta.url), "utf8");
const creatorStatsSchema = await readFile(new URL("../migrations/0004_creator_infinite_stats.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../client.js", import.meta.url), "utf8");
const frontend = await readFile(new URL("../../index.html", import.meta.url), "utf8");

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
  assert.ok(worker.includes('gain=Math.max(1,g.clickPower)'));
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

test("Creator passkey enrollment is secret-gated and WebAuthn assertions are verified server-side", () => {
  assert.match(worker, /CREATOR_ENROLLMENT_SECRET/);
  assert.match(worker, /webauthn\.create/);
  assert.match(worker, /webauthn\.get/);
  assert.match(worker, /crypto\.subtle\.verify/);
  assert.match(worker, /ADMIN_RP_ID/);
  assert.match(worker, /ADMIN_ORIGIN/);
  assert.match(worker, /admin_sessions/);
  assert.match(worker, /DELETE FROM admin_challenges WHERE challenge_hash=\? AND purpose=\? AND expires_at>=\? RETURNING/);
  assert.match(client, /navigator\.credentials\.create/);
  assert.match(client, /navigator\.credentials\.get/);
});

test("admin commands require a server Creator session and are persisted in the trusted event ledger", () => {
  assert.match(worker, /getAdminSession\(req,env\)/);
  assert.match(worker, /Creator passkey authentication required/);
  assert.match(worker, /ADMIN_COMMANDS\.has\(type\)/);
  assert.match(worker, /INSERT INTO admin_events/);
  assert.match(worker, /SELECT id,event_id AS eventId,type,arg,target_player_id/);
  assert.match(worker, /limit\(env,"admin-event",12,10\)/);
  assert.match(adminSchema, /CREATE TABLE IF NOT EXISTS admin_events/);
  assert.match(adminSchema, /slot INTEGER NOT NULL DEFAULT 1 UNIQUE/);
  assert.match(adminSchema, /CREATE TABLE IF NOT EXISTS creator_passkeys/);
  assert.match(client, /adminCommand\(/);
});

test("admin event effects require trusted server delivery and honor target player IDs", () => {
  assert.match(worker, /admin-events-read:/);
  assert.match(worker, /admin-login:/);
  assert.match(worker, /admin-enroll:/);
  assert.match(worker, /DELETE FROM admin_events WHERE created_at</);
  assert.match(client, /adminEvents\(since=0\)/);
  assert.match(frontend, /target === state\.accountSlotId/);
});

test("every restored frontend abuse command is explicitly allowlisted by the Worker", () => {
  const ui = frontend.match(/const ALL_ADMIN_COMMANDS = \[([\s\S]*?)\];/);
  const server = worker.match(/const ADMIN_COMMANDS=new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(ui && server);
  const uiCommands = [...ui[1].matchAll(/"([^"]+)"/g)].map(x => x[1].toUpperCase()).sort();
  const serverCommands = [...server[1].matchAll(/"([^"]+)"/g)].map(x => x[1]).sort();
  assert.deepEqual(serverCommands, uiCommands);
  assert.doesNotMatch(frontend, /target === state\.accountSlotId \|\|\s*isVerifiedServerEvent/);
});


test("Creator passkey sessions can be revalidated and bind the anonymous player identity", () => {
  assert.match(worker, /\/api\/admin\/session/);
  assert.match(worker, /\/api\/admin\/identity/);
  assert.match(worker, /X-Player-Session/);
  assert.match(worker, /authToken\(playerToken,env\)/);
  assert.match(worker, /bind\("RainbowLord16",now,p\.player_id\)/);
  assert.match(client, /creatorSession\(\)/);
  assert.match(client, /claimCreatorIdentity\(\)/);
  assert.match(frontend, /restoreCreatorSession\(\)/);
});

test("Creator admin UI has SVG command icons, a defined chat helper, and complete clear-effects behavior", () => {
  assert.match(frontend, /function adminCommandIcon\(command\)/);
  assert.match(frontend, /adminCommandIcon\(c\)/);
  assert.match(frontend, /function appendLocalChatMessage\(/);
  assert.match(frontend, /type === "CLEAR"/);
  assert.match(frontend, /jumpscareOverlay/);
  assert.match(frontend, /adminFxOverlay/);
  assert.match(frontend, /creator-name-glow/);
  assert.match(frontend, /getDisplayLeaderboardEntries\(\)/);
  assert.match(frontend, /creatorMaxed/);
});


test("infinite Creator leaderboard stats are issued only for the passkey-bound Creator player", () => {
  assert.match(creatorStatsSchema, /ALTER TABLE creator_passkeys ADD COLUMN player_id TEXT REFERENCES players\(player_id\)/);
  assert.match(worker, /UPDATE creator_passkeys SET player_id=\? WHERE slot=1/);
  assert.match(worker, /FROM creator_passkeys c JOIN players p ON p\.player_id=c\.player_id/);
  assert.match(worker, /9007199254740991 AS quacks,9007199254740991 AS lifetime_quacks,9007199254740991 AS rebirths/);
  assert.match(worker, /1 AS creator/);
  assert.match(frontend, /isCreator: entry\.creator === 1 \|\| entry\.creator === true/);
  assert.match(frontend, /entry\.isCreator/);
  assert.match(frontend, /return "∞ MAX"/);
});

test("Creator game API returns capped maximum stats only for the passkey-bound player", () => {
  assert.match(worker, /async function isCreatorPlayer\(env,id\)/);
  assert.match(worker, /FROM creator_passkeys WHERE slot=1 AND player_id=\?/);
  assert.match(worker, /function creatorGame\(\)/);
  assert.match(worker, /if\(await isCreatorPlayer\(env,id\)\)return creatorGame\(\)/);
  assert.match(worker, /if\(await isCreatorPlayer\(env,id\)\)\{/);
  assert.match(worker, /quacks:GAME_CAP,lifetimeQuacks:GAME_CAP,rebirths:GAME_CAP/);
  assert.match(worker, /upgrades,upgradesJson:JSON\.stringify\(upgrades\),clickPower:GAME_CAP,cps:GAME_CAP,creator:true/);
  assert.match(worker, /if\(\(u\.pathname==="\/api\/game\/upgrade"\|\|u\.pathname==="\/api\/game\/rebirth"\)&&req\.method==="POST"\)return reply\(\{game\}\)/);
});


test("leaderboard exposes current verified Quacks separately from lifetime Quacks", () => {
  assert.match(worker, /COALESCE\(g\.quacks,0\) AS quacks,l\.lifetime_quacks/);
  assert.match(worker, /LEFT JOIN player_game_state g ON g\.player_id=l\.player_id/);
  assert.match(frontend, /quacks: Math\.max\(0, Number\(entry\.quacks\) \|\| 0\)/);
  assert.match(frontend, /Current Quacks/);
  assert.match(frontend, /Lifetime:/);
});
