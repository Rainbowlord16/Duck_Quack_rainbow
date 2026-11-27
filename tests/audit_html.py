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
assert parser.ids.count("buyMult1") == 1
assert parser.ids.count("buyMult10") == 1
assert parser.ids.count("buyMult50") == 1
sidebar_start = SOURCE.index("<!-- LEFT COLUMN: WORLDS & UPGRADES -->")
sidebar_end = SOURCE.index("<!-- CENTER COLUMN:", sidebar_start)
sidebar = SOURCE[sidebar_start:sidebar_end]
assert sidebar.count("<!-- Core Upgrades -->") == 1
assert sidebar.index('id="worldsList"') < sidebar.index('id="upgradesList"')
assert all(token in sidebar for token in ('id="buyMult1"', 'id="buyMult10"', 'id="buyMult50"'))

class ContainerBalanceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if tag in ("div", "section"):
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in ("div", "section"):
            assert self.stack, f"Unexpected closing </{tag}> in sidebar"
            opened = self.stack.pop()
            assert opened == tag, f"Mismatched </{tag}> for <{opened}> in sidebar"

sidebar_parser = ContainerBalanceParser()
sidebar_parser.feed(sidebar)
assert not sidebar_parser.stack, f"Unclosed sidebar containers: {sidebar_parser.stack}"
assert (ROOT / "jumpscare.png").is_file(), "Expected local jumpscare asset is missing"

workflow = (ROOT / ".github/workflows/audit.yml").read_text(encoding="utf-8")
for action in ("actions/checkout", "actions/setup-python", "actions/setup-node"):
    assert __import__("re").search(rf"uses: {action}@[0-9a-f]{{40}}", workflow), f"Workflow action is not SHA-pinned: {action}"

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

assert "ADMIN_AUTH_BACKEND_ENABLED = true" in SOURCE
assert 'state.safeVisualsMode && incomingType !== "CLEAR"' in SOURCE
assert "navigator.credentials.get" in (ROOT / "backend/client.js").read_text(encoding="utf-8")
assert "refreshVerifiedAdminEvents" in SOURCE
assert "target === state.accountSlotId" in SOURCE
assert "Photosensitive / Safe Visuals Mode" in SOURCE
assert "rememberBoundedId(seenChatIds, message.id)" in SOURCE
assert "window.DuckQuackApi.chatHistory()" in SOURCE
assert "window.DuckQuackApi.sendChat(messageText)" in SOURCE
assert "window.DuckQuackApi.leaderboard()" in SOURCE
assert "VERIFIED SERVER RANKINGS" in SOURCE
assert "refreshServerLeaderboard" in SOURCE
assert "RELAY_TOPIC_CHAT" not in SOURCE
assert "flushPendingChatOutbox" not in SOURCE
assert "defeatEventId: \"\"" in SOURCE, "Remote boss events must not grant client-side rewards"
boss_attack_start = SOURCE.index("function attackCoopBoss()")
boss_attack_end = SOURCE.index("function sendPlayerGift", boss_attack_start)
boss_attack = SOURCE[boss_attack_start:boss_attack_end]
assert "state.gems +=" not in boss_attack
assert "state.shards +=" not in boss_attack
assert "state.bossKills++" not in boss_attack
assert "Rewards are paused until a trusted server can verify the raid" in boss_attack
assert "updatedAt > now + 10000" in SOURCE
assert "incomingUpdatedAt > Date.now() + 10000" in SOURCE
assert "Creator Quack Grant" in SOURCE
assert "safeAvatarDataUrl" in SOURCE
assert "normalizePublicRosterEntry" in SOURCE
assert "Object.keys(liveHttpEntries).length >= 100" in SOURCE
assert "rawStr.length > 16384" in SOURCE
assert "storePublicRosterEntry(data, expectedSlotId)" in SOURCE
assert "function scheduleMqttReconnect" in SOURCE
assert "gag_sync_v12" in SOURCE
assert "roster_v12" in SOURCE
assert "boss_v12" in SOURCE
assert "reconnectPeriod: 0" in SOURCE
assert "mqttReconnectAttempt" in SOURCE
assert "relayPollInFlight" in SOURCE
assert "relayLastSuccessAt" in SOURCE
assert '"HTTP RELAY SYNC" : "SYNC OFFLINE"' in SOURCE
assert 'cloudSyncStatusText = "GLOBAL SYNC LIVE"' in SOURCE
assert 'cloudSyncStatusText = "SYNC OFFLINE"' in SOURCE
assert 'cloudSyncStatusText = "Reconnecting global sync..."' in SOURCE
assert "AbortController" in SOURCE
assert "response.body.getReader()" in SOURCE
assert "body.length > maxChars" in SOURCE
assert "fetchNtfyRelayMessages(RELAY_TOPIC_BOSS, bossSince, 524288)" in SOURCE
assert "if (relayPollInFlight || !navigator.onLine) return" in SOURCE
assert 'const rosterSince = "30s"' in SOURCE
assert "relaySuccessfulTopics.has(RELAY_TOPIC_BOSS)" in SOURCE
assert "if (mqttConnected) publishMqttPacket(`roster/${compactCard.accountSlotId}`, compactCard, true)" in SOURCE
assert "fetch(`https://ntfy.sh/${RELAY_TOPIC_ROSTER}`" in SOURCE
assert "function syncGlobalWeatherFromClock" in SOURCE
assert "Math.floor(now / 45000)" in SOURCE
assert "mqttClient.subscribe(`${MQTT_BASE_TOPIC}/world`" not in SOURCE
assert 'publishMqttPacket("world"' not in SOURCE
assert "now - Number(e.updatedAt) <= 20000" in SOURCE
assert "syncGlobalWeatherFromClock();" in SOURCE
assert 'publishMqttPacket("boss", coopBossState, true)' in SOURCE
for function_name, next_function in (
    ("function pushHttpCloudRoster", "async function fetchNtfyRelayMessages"),
    ("function attackCoopBoss()", "function sendPlayerGift"),
):
    start = SOURCE.index(function_name)
    end = SOURCE.index(next_function, start + len(function_name))
    body = SOURCE[start:end]
    assert "if (mqttConnected)" in body, f"{function_name} must gate HTTP fallback on MQTT state"
assert 'file.size > 5 * 1024 * 1024' in SOURCE
assert "Creator Quack Grant" in SOURCE
assert "const isCreator = false" in SOURCE
assert "Permanent Untouchable #1" not in SOURCE

assert len(parser.inline_scripts) == 1, f"Expected one inline app script, found {len(parser.inline_scripts)}"
with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8") as js:
    js.write(parser.inline_scripts[0])
    js.flush()
    subprocess.run(["node", "--check", js.name], check=True)

print("PASS: unique IDs, core panels, local asset, security guards, and JavaScript syntax.")
