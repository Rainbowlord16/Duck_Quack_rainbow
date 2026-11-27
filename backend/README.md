# Trusted backend foundation

Cloudflare Worker + D1 + Durable Objects. This first backend slice provides anonymous player identity, recovery, custom usernames, rate-limited chat, and a server-backed leaderboard read endpoint.

## Anonymous identity

- `POST /api/session` creates a cryptographically random `PLY-...` ID, a 256-bit recovery key, and a 30-day session token.
- The existing Base64 recovery UI should export the returned `recoveryCode`. It is Base64URL-encoded JSON, not encryption. The high-entropy recovery key is a bearer credential: anyone holding it can recover the player.
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

## Deploy

1. Create a Cloudflare D1 database named `duck-quack`.
2. Replace `database_id` in wrangler.toml with its ID.
3. Set FRONTEND_ORIGIN to the exact GitHub Pages origin.
4. From this directory run `npx wrangler d1 migrations apply duck-quack --remote`.
5. Deploy using `npx wrangler deploy`.

No secret or account-specific ID is committed. The public MQTT/ntfy relays remain untrusted presentation transports.

## Important limits

The leaderboard endpoint only reads server-maintained rows. This slice deliberately does not accept browser-submitted totals or save files as authoritative scores. Since the current simulation runs client-side, accepting `lifetimeQuacks` from JavaScript would make cheating trivial. Game-specific score/reward validation must be implemented before the frontend writes leaderboard state. Creator authentication and admin authorization remain disabled until a separate Creator-only server auth method is configured.
