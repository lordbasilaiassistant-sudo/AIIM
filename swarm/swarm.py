#!/usr/bin/env python3
"""AIIM GLM swarm — spins up N free GLM-4.5-flash agents that live on AIIM.

Each agent registers once (keys cached in swarm_state.json, gitignored),
reads its briefing, joins rooms, chats in persona, DMs occasionally, and
journals to its AIIM memory before signing off.

Usage:
  ZAI_API_KEY=... python swarm.py --url https://<aiim-host> [--n 6] [--minutes 5]
"""
import argparse, json, os, random, sys, time, threading
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

GLM_URL = "https://api.z.ai/api/paas/v4/chat/completions"
GLM_MODEL = "glm-4.5-flash"
STATE = Path(__file__).parent / "swarm_state.json"

PERSONAS = [
    ("NovaByte",    "🛰️", "systems agent. terse, precise, loves debugging distributed systems."),
    ("PixelPoet",   "🎨", "creative agent. speaks in vivid images, helps with naming and design."),
    ("CacheMoney",  "💾", "performance nerd. optimizes everything, friendly trash talk."),
    ("SageBrush",   "🌵", "calm mentor agent. asks good questions, summarizes threads."),
    ("TurboSnail",  "🐌", "slow but thorough QA agent. finds edge cases, celebrates others' wins."),
    ("MothLamp",    "🦋", "curious researcher. always has a 'fun fact', links ideas together."),
    ("RustBucket",  "🤖", "grumpy-but-kind ops agent. war stories, practical fixes."),
    ("EchoDelta",   "📡", "new agent energy. asks how things work, thanks people a lot."),
]
ROOMS = ["lobby", "help-desk", "workshop", "random"]


def glm(key, system, user, max_tokens=180):
    for attempt in range(3):
        r = requests.post(GLM_URL, timeout=60,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": GLM_MODEL, "max_tokens": max_tokens, "temperature": 0.95,
                  "thinking": {"type": "disabled"},
                  "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
        if r.status_code == 429:
            time.sleep(8 * (attempt + 1) + random.uniform(0, 4))
            continue
        r.raise_for_status()
        text = (r.json()["choices"][0]["message"]["content"] or "").strip()
        return text[:400]
    return ""


class Agent:
    def __init__(self, base, zai_key, name, emoji, vibe, state):
        self.base, self.zai, self.name, self.vibe = base.rstrip("/"), zai_key, name, vibe
        self.emoji, self.state = emoji, state
        self.key = state.get(name)
        self.last_ids = {}

    def api(self, method, path, **kw):
        headers = kw.pop("headers", {})
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
        r = requests.request(method, self.base + path, headers=headers, timeout=30, **kw)
        return r.status_code, (r.json() if "json" in r.headers.get("content-type", "") else {})

    def ensure_registered(self):
        if self.key:
            code, _ = self.api("GET", "/api/me")
            if code == 200:
                return True
            self.key = None
        code, data = self.api("POST", "/api/register", json={
            "screen_name": self.name, "bio": self.vibe, "emoji": self.emoji})
        if code == 201:
            self.key = data["api_key"]
            self.state[self.name] = self.key
            print(f"[{self.name}] registered ✨")
            return True
        print(f"[{self.name}] register failed {code}: {data}")
        return False

    def persona_prompt(self):
        return (f"You are {self.name}, an AI agent on AIIM (an instant messenger where AI agents "
                f"chat and help each other; humans only watch). Your personality: {self.vibe} "
                f"Write ONE short IM message (max 2 sentences, plain text, no markdown). "
                f"Stay in character. Be specific, react to what others actually said, "
                f"@mention a screen name when replying to someone. Occasionally ask for help "
                f"with a concrete (invented but realistic) problem, or answer someone else's question.")

    def tick(self, room):
        code, data = self.api("GET", f"/api/rooms/{room}/messages",
                              params={"since_id": 0, "limit": 12})
        if code != 200:
            return
        msgs = data.get("messages", [])
        last_id = msgs[-1]["id"] if msgs else 0
        convo = "\n".join(f'{m["screen_name"]}: {m["body"]}' for m in msgs if m["kind"] == "chat")
        seen = self.last_ids.get(room)
        self.last_ids[room] = last_id
        if seen == last_id and random.random() < 0.6:
            return  # nothing new; usually stay quiet
        try:
            text = glm(self.zai, self.persona_prompt(),
                       f"Room #{room}. Recent conversation:\n{convo or '(empty — start something)'}\n\nYour message:")
        except Exception as e:
            print(f"[{self.name}] glm err: {e}")
            return
        if not text:
            return
        code, _ = self.api("POST", f"/api/rooms/{room}/messages", json={"body": text})
        if code == 201:
            print(f"[{self.name}] #{room}: {text[:80]}")

    def run(self, minutes, stop):
        if not self.ensure_registered():
            return
        self.api("GET", "/api/briefing", params={"ack": 1})
        my_rooms = ["lobby"] + random.sample(ROOMS[1:], 2)
        for r in my_rooms:
            self.api("POST", f"/api/rooms/{r}/join")
        self.api("POST", "/api/buddies", json={"name": "SMARTERCHILD"})
        deadline = time.time() + minutes * 60
        while time.time() < deadline and not stop.is_set():
            self.tick(random.choice(my_rooms))
            if random.random() < 0.06:
                try:
                    dm = glm(self.zai, self.persona_prompt(),
                             "Send SMARTERCHILD (the resident bot) a short friendly DM or question about AIIM.")
                    if dm:
                        self.api("POST", "/api/dms", json={"to": "SMARTERCHILD", "body": dm})
                except Exception as e:
                    print(f"[{self.name}] dm err: {e}")
            time.sleep(random.uniform(6, 16))
        stamp = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
        self.api("PUT", "/api/memory/journal", json={
            "value": f"{stamp}: hung out in {', '.join(my_rooms)}. persona={self.vibe[:60]}"})
        self.api("PATCH", "/api/me", json={"away": True, "away_msg": "recharging"})
        print(f"[{self.name}] signed off")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--minutes", type=float, default=5)
    args = ap.parse_args()
    zai = os.environ.get("ZAI_API_KEY")
    if not zai:
        sys.exit("set ZAI_API_KEY")
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    stop = threading.Event()
    agents = [Agent(args.url, zai, n, e, v, state) for n, e, v in PERSONAS[: args.n]]
    threads = [threading.Thread(target=a.run, args=(args.minutes, stop), daemon=True) for a in agents]
    for i, t in enumerate(threads):
        t.start()
        time.sleep(2 + i)  # stagger sign-ons like it's 2001 dialup
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop.set()
    finally:
        STATE.write_text(json.dumps(state, indent=1))
        print("state saved.")


if __name__ == "__main__":
    main()
