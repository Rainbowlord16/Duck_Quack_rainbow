# Security notes

## Current trust model

Duck Quack Simulator is a static browser application. It does not currently have a trusted application server.

- Browser storage and client-side game state are controlled by each player.
- Public MQTT and ntfy topics are unauthenticated and must be treated as attacker-controlled input.
- Public roster scores and account names are display data, not verified identities or authoritative scores.
- Client-side checks cannot protect creator privileges, currency, gifts, or leaderboard integrity.

## Features intentionally disabled

Until a trusted backend is deployed, this branch disables creator authentication and admin commands, rejects remote admin/gift events, and pauses player gifting. Remote co-op boss packets may update display state but cannot award local currency.

Do not re-enable these features by adding a password, secret, or privilege flag to HTML, JavaScript, localStorage, or sessionStorage.

## Required backend before restoring privileged features

A production implementation should use:
1. Server-verified identity (for example, Firebase Authentication or Supabase Auth).
2. Server-side creator authorization, never a client-provided username or boolean.
3. Signed, short-lived authorization for administrative events, with replay protection.
4. Server-authoritative score and reward mutations, rate limits, and validation.
5. Access rules that prevent anonymous clients from writing privileged roster, event, or reward records.

The public MQTT/ntfy channels should carry only non-sensitive, untrusted presentation data. Never publish credentials or bearer tokens to them.

## Credential exposure

The previous static creator passcode was committed to the repository. Removing the file from the current branch does not erase it from Git history. Treat that credential as compromised, rotate it anywhere it was reused, and consider rewriting repository history if appropriate. History rewriting does not replace credential rotation.

## Reporting

Please avoid posting exploitable details or credentials in public issues. If GitHub private vulnerability reporting is enabled for this repository, use it. Otherwise contact the repository owner privately before publishing details.

## Real-time synchronization trust boundaries

The client uses public MQTT brokers over WSS with ntfy HTTP fallback. WSS encrypts the connection but does not authenticate a player or make a public topic private. Anyone who discovers the topic names can publish forged roster, chat, weather, or boss packets.

Current client-side protections include payload size limits, schema normalization, timestamp checks, per-topic validation, bounded roster/chat caches, chat rate limiting, a bounded local chat outbox, MQTT broker failover, HTTP fallback polling, and deterministic UTC weather. Public weather packets are not accepted. Co-op boss packets can update display state but cannot grant local rewards.

These controls reduce accidental corruption, stale updates, and some abuse. They do not establish sender identity or stop a determined attacker from spoofing scores or boss state. Public roster and boss data must remain untrusted display data until a server validates it.

Before claiming secure real-time multiplayer, move the shared state to a trusted backend with authenticated player sessions, per-user write authorization, server timestamps/revisions, atomic boss damage transactions, server-side score/reward calculation, replay protection, and rate limits. MQTT/ntfy should then be treated only as delivery channels for backend-authorized events, not as the authority.
