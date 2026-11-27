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
