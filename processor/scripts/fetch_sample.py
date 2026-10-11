#!/usr/bin/env python3
"""Find/download a redistributable sports clip from Wikimedia Commons and record its licence.

Usage:
  python scripts/fetch_sample.py search "gaelic football"        # list candidate videos + licences
  python scripts/fetch_sample.py get "File:Some clip.webm"       # download to samples/ + samples/<name>.source.json
Downloads are NOT committed (samples/ is gitignored).
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = "gaa-video-analytics-sample-fetch/0.1 (open-source; Apache-2.0)"
OUT = Path(__file__).resolve().parent.parent / "samples"
OK_LICENCE = re.compile(r"(CC[- ]BY|CC0|public domain|PD)", re.I)


def call(url: str, retries: int = 12) -> bytes:
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(max(int(e.headers.get("retry-after", 0) or 0), 15 + 10 * i) + 1)  # shared egress IPs get 429s
                continue
            raise
    raise RuntimeError("rate limited too many times")


def api(**params) -> dict:
    params.update(format="json")
    return json.loads(call(API + "?" + urllib.parse.urlencode(params)))


def info(title: str) -> dict:
    d = api(action="query", titles=title, prop="imageinfo", iiprop="url|extmetadata|size|mime")
    page = next(iter(d["query"]["pages"].values()))
    ii = page["imageinfo"][0]
    m = ii["extmetadata"]
    strip = lambda s: re.sub(r"<[^>]+>", "", s or "").strip()
    return {"title": page["title"], "url": ii["url"], "descriptionUrl": ii["descriptionurl"], "mime": ii["mime"],
            "bytes": ii["size"], "author": strip(m.get("Artist", {}).get("value")),
            "licence": strip(m.get("LicenseShortName", {}).get("value")),
            "licenceUrl": m.get("LicenseUrl", {}).get("value", ""),
            "credit": strip(m.get("Credit", {}).get("value"))}


def search(q: str, limit: int = 20):
    d = api(action="query", list="search", srsearch=f"{q} filetype:video", srnamespace=6, srlimit=limit)
    for hit in d["query"]["search"]:
        try:
            i = info(hit["title"])
        except Exception as e:  # noqa
            print(hit["title"], "?", e)
            continue
        flag = "OK " if OK_LICENCE.search(i["licence"]) else "-- "
        print(f"{flag}{i['title']} | {i['licence']} | {i['bytes'] / 1e6:.1f} MB | {i['author'][:50]}")


def get(title: str):
    i = info(title)
    if not OK_LICENCE.search(i["licence"]):
        sys.exit(f"licence '{i['licence']}' not clearly redistributable; refusing")
    OUT.mkdir(exist_ok=True)
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", i["title"].removeprefix("File:"))
    dest = OUT / name
    dest.write_bytes(call(i["url"]))
    (OUT / (name + ".source.json")).write_text(json.dumps(i, indent=2))
    print(f"saved {dest}\n{json.dumps(i, indent=2)}")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("search", "get"):
        sys.exit(__doc__)
    (search if sys.argv[1] == "search" else get)(sys.argv[2])
