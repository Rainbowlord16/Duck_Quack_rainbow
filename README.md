# Duck_Quack_rainbow

A duck quack simulator.

## Security status

This is a static frontend, not a trusted game backend. Public sync data is untrusted, and client-side scores can be modified. Creator authentication, admin commands, and player gifting remain disabled until server-side identity, authorization, and authoritative score validation are implemented.

See [SECURITY.md](SECURITY.md) for the current trust model and requirements before restoring privileged features.

## Local regression checks

Run the static audit with Python 3 and Node.js installed:

```bash
python tests/audit_html.py
```

The GitHub Actions workflow runs the same checks on pushes to `main` and audit branches, and on pull requests targeting `main`.

## Real-time world synchronization

The browser client uses public MQTT over WSS as its primary transport and ntfy HTTP polling as a fallback. When MQTT is unavailable, the client polls bounded roster, chat, admin-event, and co-op boss feeds. Outgoing chat is held in a bounded local outbox and removed only after the active transport acknowledges delivery. Reconnect attempts use bounded backoff and broker failover.

Shared weather is derived from a common UTC 45-second schedule, so clients independently arrive at the same weather state without trusting anonymous public weather writes. Online world avatars expire after 20 seconds without a roster heartbeat.

These improvements provide more reliable best-effort synchronization, not authenticated multiplayer. Public brokers and relay topics remain writable by strangers. Roster scores and co-op boss state are unverified display data; do not use them to authorize rewards, privileges, or competitive rankings. Server-side identity, authorization, and authoritative state are still required for that.
