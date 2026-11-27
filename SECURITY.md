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
