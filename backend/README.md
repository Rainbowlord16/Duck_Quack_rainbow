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
