# Trusted backend foundation

Cloudflare Worker + D1 + Durable Objects. The backend provides anonymous player identity, recovery, custom usernames, rate-limited chat, and a server-authoritative progression ledger for leaderboard scoring.

## Anonymous identity

- `POST /api/session` creates a cryptographically random `PLY-...` ID, a 256-bit recovery key, and a 30-day session token.
- The existing Base64 recovery UI should export the returned `recoveryCode`. It is standard Base64-encoded JSON, not encryption. The high-entropy recovery key is a bearer credential: anyone holding it can recover the player.
- `POST /api/session/recover` restores the same ID and issues a new session. No signup, email, password, or ordinary player login.
- `GET/POST /api/me` reads/changes a 2-22 character custom username. Reserved privileged names are blocked.
- Session and recovery values must never enter MQTT, ntfy, chat, logs, or public roster packets.

## Routes

- GET /api/health
- POST /api/session
- POST /api/session/recover with { "recoveryCode": "..." }
- GET /api/me with bearer session
- POST /api/me with { "username": "..." } and bearer session
- GET/POST /api/chat with bearer session
- GET /api/leaderboard
- GET /api/game/state (authenticated; accrues at most 30 seconds of server-timed idle income)
- POST /api/game/click (authenticated; server-calculated click score, rate-limited to 12 per second)
- POST /api/game/upgrade with { "upgrade": "beak" } (server checks the balance and fixed upgrade catalogue)
- POST /api/game/rebirth (server checks the rebirth threshold and resets verified upgrades)

## Deploy

1. Create a Cloudflare D1 database named `duck-quack`.
2. Replace `database_id` in wrangler.toml with its ID.
3. Set FRONTEND_ORIGIN to the exact GitHub Pages origin.
4. Apply both SQL migrations in order, including `migrations/0002_authoritative_game.sql`, to the remote D1 database. With Wrangler, run `npx wrangler d1 migrations apply duck-quack --remote`.
5. Deploy using `npx wrangler deploy`.

No secret or account-specific ID is committed. The public MQTT/ntfy relays remain untrusted presentation transports.

## Important limits

Leaderboard totals are written only by authenticated server game actions. Browser-reported `lifetimeQuacks`, imported saves, MQTT, and ntfy are never accepted as score writes. The verified ledger awards server-calculated click power, rate-limits clicks, validates upgrade purchases against server-owned balance and a fixed catalogue, and accrues passive income using server time (capped to 30 seconds per request). This is a deliberately narrow verified scoring track: other client-only reward sources, temporary multipliers, promo rewards, arcade rewards, and admin gifts do not increase the trusted leaderboard. Existing local save totals are not imported into the trusted score because they cannot be verified. The leaderboard therefore starts counting verified progression after this deployment. Creator authentication and admin authorization remain disabled until a separate Creator-only server auth method is configured.

## Creator passkey and admin abuse events

Creator access is separate from anonymous player sessions. The Worker uses WebAuthn passkeys (ES256/P-256, user verification required) bound to the exact GitHub Pages origin `https://rainbowlord16.github.io` and RP ID `rainbowlord16.github.io`.

- Configure the Worker secret `CREATOR_ENROLLMENT_SECRET` before first enrollment. Never put it in source code, GitHub Pages, or a public relay.
- Open Profile → Creator Admin Vault → First-time Creator passkey setup, paste the secret, and register a passkey on the Creator device. The database enforces one Creator credential.
- After enrollment, use Unlock with Passkey. The Worker verifies the WebAuthn challenge, origin, RP ID hash, user-presence/user-verification flags, ES256 signature, and authenticator counter. Creator sessions expire after 8 hours and can be revoked by locking the vault.
- Admin commands are accepted only with a valid Creator session, validated against a fixed command allowlist, rate limited, and written to the D1 admin event ledger. Clients poll that server-owned ledger; public MQTT/ntfy event topics are not trusted.
- Apply `migrations/0003_creator_admin.sql` after the previous migrations.
- The passkey implementation currently supports ES256/P-256 authenticators. The relying-party ID and origin must be updated in the Worker if the public frontend hostname changes.

This passkey authorizes the existing local visual/effect command engine. It does not turn client-only currencies or imported local saves into verified server balances. Creator gifting/administrative changes to authoritative player data require dedicated server-side handlers before those economy operations can be treated as authoritative.


## Creator infinite server-side game stats

The passkey-bound Creator player is identified only by the D1 `creator_passkeys.player_id` association written after successful Creator passkey authentication. The game API returns the maximum safe integer for verified Quacks, lifetime Quacks, rebirths, click power, and passive income, plus maximum upgrade levels. Creator click, upgrade, and rebirth requests keep those stats maxed and do not spend or reset them. Other players continue through the normal rate-limited, server-validated progression path. The leaderboard separately pins the verified Creator player above ordinary entries; it does not accept a client-supplied score.


## Leaderboard score labels

The leaderboard API returns both current server-verified Quacks from `player_game_state.quacks` and lifetime Quacks from `leaderboard.lifetime_quacks`. The frontend labels current balance as "Current Quacks" and shows lifetime total separately, avoiding confusion between spendable balance and cumulative earned Quacks.
