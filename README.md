# Duck_Quack_rainbow

A duck quack simulator.

## Security status

This is a static frontend, not a trusted game backend. Public sync data is untrusted, and client-side scores can be modified. Creator authentication, admin commands, and player gifting remain disabled until server-side identity, authorization, and authoritative score validation are implemented.

See [SECURITY.md](SECURITY.md) for the current trust model. A first Cloudflare backend implementation is being developed under [backend/](backend/README.md); it is not deployed or connected to the live frontend yet.

## Local regression checks

Run the static audit with Python 3 and Node.js installed:

```bash
python tests/audit_html.py
```

The GitHub Actions workflow runs the same checks on pushes to `main` and audit branches, and on pull requests targeting `main`.

## Real-time world synchronization

The browser client bridges public MQTT over WSS and ntfy HTTP in both directions. Clients publish roster, chat, and co-op boss updates to both relays and listen to both, so a player using HTTP fallback can still synchronize with players connected to MQTT. Duplicate deliveries are filtered by message IDs or monotonic timestamps. MQTT reconnect uses bounded exponential backoff and broker failover. Outgoing chat uses a bounded local outbox with separate MQTT and ntfy delivery acknowledgements. HTTP polling is bounded by response size, line count, and request timeouts.

Shared weather is derived from a common UTC 45-second schedule, so clients independently arrive at the same weather state without trusting anonymous public weather writes. Online world avatars expire after 20 seconds without a roster heartbeat.

These improvements provide more reliable best-effort synchronization, not authenticated multiplayer. Public brokers and relay topics remain writable by strangers. Roster scores and co-op boss state are unverified display data; do not use them to authorize rewards, privileges, or competitive rankings. Co-op boss progression rewards are paused until a server can verify raid outcomes. Server-side identity, authorization, and authoritative state are still required for that.
