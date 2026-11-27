#!/usr/bin/env python3
"""Static regression checks for Duck Quack Simulator's security and HTML invariants."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
SOURCE = HTML_PATH.read_text(encoding="utf-8")

class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.inline_scripts = []
        self._in_inline_script = False
        self._script_parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "script":
            self._in_inline_script = "src" not in attrs
            self._script_parts = []

    def handle_data(self, data):
        if self._in_inline_script:
            self._script_parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._in_inline_script:
            self.inline_scripts.append("".join(self._script_parts))
            self._in_inline_script = False

parser = AuditParser()
parser.feed(SOURCE)
duplicates = [key for key, count in Counter(parser.ids).items() if count > 1]
assert not duplicates, f"Duplicate HTML IDs: {duplicates}"
assert parser.ids.count("worldsList") == 1
assert parser.ids.count("worldBoostBadge") == 1
assert parser.ids.count("upgradesList") == 1
assert (ROOT / "jumpscare.png").is_file(), "Expected local jumpscare asset is missing"

for forbidden in (
    "CREATOR_PASSCODE_HASH",
    "ABC202616Rainbow_AI@129",
    'sessionStorage.getItem("dqCreatorUnlocked")',
    'sessionStorage.setItem("dqCreatorUnlocked"',
    "new EventSource",
    "gun.js",
    "gunLeaderboardNode",
    "gunAdminEventNode",
    "seenChatIds.add(",
    "pinimg.com",
    "encrypted-tbn0.gstatic.com",
):
    assert forbidden not in SOURCE, f"Forbidden client-side pattern remains: {forbidden}"

assert "ADMIN_AUTH_BACKEND_ENABLED = false" in SOURCE
assert "state.safeVisualsMode || !isSender" in SOURCE
assert "Photosensitive / Safe Visuals Mode" in SOURCE
assert "rememberBoundedId(seenChatIds, data.id)" in SOURCE
assert "defeatEventId: \"\"" in SOURCE, "Remote boss events must not grant client-side rewards"
assert "Permanent Untouchable #1" not in SOURCE

assert len(parser.inline_scripts) == 1, f"Expected one inline app script, found {len(parser.inline_scripts)}"
with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8") as js:
    js.write(parser.inline_scripts[0])
    js.flush()
    subprocess.run(["node", "--check", js.name], check=True)

print("PASS: unique IDs, core panels, local asset, security guards, and JavaScript syntax.")
