#!/usr/bin/env python3
"""Honesty scan of every demo: flags fake-proof patterns (awards, ratings, real contacts, outbound links) for a human to review."""
import html, json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ALLOWED_PHONES = {"0491570156", "0491570157", "0491570158", "0491570159", "0491570110", "131114", "000", "1300224636"}
RULES = {
    "award_or_rank": re.compile(r"award[- ]winning|number one|voted best|best in (sydney|melbourne|brisbane|perth|adelaide|hobart|australia)|as seen on", re.I),
    "guarantee": re.compile(r"\bguarantee[ds]?\b|100% (pass|success|satisf)|pass rate", re.I),
    "rating": re.compile(r"★{3,}|\b[45](\.\d)?\s?(/\s?5|stars?\b|-star)|rated \d|google reviews|trustpilot", re.I),
    "licence_or_abn_number": re.compile(r"(licen[cs]e|lic\.?|abn|acn|reg(istration)?)\s*(no\.?|number|#|:)?\s*\d{4,}", re.I),
}
PHONE = re.compile(r"(?<![\d.])(?:\+61\s?|0)(?:[2378]\)?\s?\d{4}\s?\d{4}|4\d{2}\s?\d{3}\s?\d{3})(?![\d])|\b1[38]00\s?\d{3}\s?\d{3}\b|\b13\s?\d{2}\s?\d{2}\b")
EMAIL = re.compile(r"[\w.+-]+@([\w-]+\.)+[a-z]{2,}", re.I)
LINK = re.compile(r'href="(https?://[^"]+)"', re.I)

def visible_text(markup):
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", markup, flags=re.S | re.I)
    return html.unescape(re.sub(r"<[^>]+>", " ", t))

out, total = {}, 0
for f in sorted((ROOT / "site/demos").glob("[0-9][0-9][0-9]-*/index.html")):
    raw = f.read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"\s+", " ", visible_text(raw) + " " + " ".join(re.findall(r'(?:aria-label|content|title|alt)="([^"]*)"', raw)))
    hits = []
    for name, rx in RULES.items():
        for m in rx.finditer(text):
            s = max(0, m.start() - 60); hits.append({"rule": name, "context": text[s:m.end() + 60].strip()})
    for m in PHONE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0)).replace("61", "0", 1) if m.group(0).startswith("+61") else re.sub(r"\D", "", m.group(0))
        if digits not in ALLOWED_PHONES and not re.fullmatch(r"0[2378]5550\d{4}", digits):
            hits.append({"rule": "phone_not_fictional_range", "context": m.group(0)})
    for m in EMAIL.finditer(raw):
        if not m.group(0).lower().endswith("example.com"):
            hits.append({"rule": "email_not_example_com", "context": m.group(0)})
    for u in LINK.findall(raw):
        if not re.match(r"https://(fonts\.(googleapis|gstatic)\.com|([\w-]+\.)*example\.com)(/|$)", u):
            hits.append({"rule": "outbound_link", "context": u})
    if hits:
        out[f.parent.name] = hits; total += len(hits)
report = {"date": "2026-09-27", "demos_scanned": len(list((ROOT / "site/demos").glob("[0-9][0-9][0-9]-*/index.html"))), "flags": total, "by_demo": out,
          "note": "Pattern scan only; every flag is reviewed by a person and resolved or explained in evidence/content-review.md."}
(ROOT / "evidence/content-scan.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n")
print(json.dumps({"demos_scanned": report["demos_scanned"], "flags": total}, ensure_ascii=False))
for k, v in out.items():
    for h in v: print(k[:3], h["rule"], "|", h["context"][:150])
