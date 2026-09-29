#!/usr/bin/env python3
"""Build the studio showcase hub (English + Chinese) from src/*.json and the demo folders.

Python 3.9+ standard library only. Nothing here runs demo code.

    python3 tools/build.py            # build site/index.html, site/zh/index.html, robots.txt (+ sitemap when site_url is set)
    python3 tools/build.py --check    # build, then exit 1 if any demo breaks the contract

Facts shown on the page (demo count, industries, typefaces, average weight, "0 stock photos") are measured here
from the files on disk, not typed by hand.
"""
import argparse
import hashlib
import html
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse, quote
from services_page import render_services

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SRC = ROOT / "src"
DEMOS_DIR = SITE / "demos"
RASTER = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp"}
TECH_OK = {"CSS Grid", "CSS 3D", "CSS Scroll Snap", "Scroll-driven", "SVG", "SVG animation", "Canvas 2D", "WebGL",
           "Web Audio", "Pointer Events", "Drag & drop", "IntersectionObserver", "View Transitions",
           "Keyboard shortcuts", "RTL layout", "Bilingual toggle", "Generative art", "Physics", "Form logic",
           "Date logic", "Clipboard"}


CONTENT = {}

INC_ICONS = [
    '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8.5 11h5"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M12 2.8 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.7 4.4-1.5 7.5-5.1 7.5-9.7V6Z"/><path d="m8.8 12.2 2.3 2.3 4.3-4.6"/></svg>',
]


def esc(value):
    return html.escape(str(value), quote=True)


def load(name):
    return json.loads((SRC / name).read_text(encoding="utf-8"))


def fill(text, **values):
    for k, v in values.items():
        text = text.replace("{" + k + "}", str(v))
    return text


# ---------------------------------------------------------------- demo scan

def google_families(markup):
    fams = []
    for href in re.findall(r'href="(https://fonts\.googleapis\.com/css2?\?[^"]+)"', markup):
        query = parse_qs(urlparse(html.unescape(href)).query)
        for fam in query.get("family", []):
            fams.append(fam.split(":")[0].replace("+", " ").strip())
    return fams


def scan_demo(d):
    folder = f"{d['id']}-{d['slug']}"
    path = DEMOS_DIR / folder
    info = {"folder": folder, "exists": (path / "index.html").is_file(), "problems": [], "warnings": []}
    if not info["exists"]:
        info["problems"].append("missing index.html")
        return info
    markup = (path / "index.html").read_text(encoding="utf-8", errors="replace")
    files = [p for p in path.rglob("*") if p.is_file() and p.name != ".DS_Store"]
    info["bytes"] = sum(p.stat().st_size for p in files)
    info["html_bytes"] = (path / "index.html").stat().st_size
    info["fonts"] = sorted(set(google_families(markup)))
    info["raster_files"] = [p.name for p in files if p.suffix.lower() in RASTER]
    ext_scripts = [s for s in re.findall(r'<script[^>]+src="([^"]+)"', markup) if s != "../_kit/kit.js"]
    ext_images = re.findall(r'<img[^>]+src="(https?:[^"]+)"', markup) + re.findall(r'url\((["\']?)https?:', markup)
    if ext_scripts:
        info["problems"].append("extra scripts: " + ", ".join(ext_scripts))
    if ext_images:
        info["problems"].append("remote images")
    if info["raster_files"]:
        info["warnings"].append("raster files: " + ", ".join(info["raster_files"]))
    if '../_kit/kit.js' not in markup:
        info["problems"].append("kit.js not referenced")
    if not re.search(r'<meta name="robots" content="[^"]*noindex', markup):
        info["problems"].append("missing noindex")
    if f'<meta name="demo:id" content="{d["id"]}"' not in markup:
        info["problems"].append("demo:id missing or wrong")
    if "data-brand" not in markup:
        info["problems"].append("no data-brand")
    if len(info["fonts"]) > 2:
        info["warnings"].append("more than 2 font families: " + ", ".join(info["fonts"]))
    if info["html_bytes"] > 120_000:
        info["warnings"].append(f"index.html is {info['html_bytes'] // 1024} KB (> 120 KB ceiling)")
    meta_path = path / "meta.json"
    meta = {}
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except ValueError as exc:
            info["problems"].append("meta.json invalid: " + str(exc))
    else:
        info["warnings"].append("no meta.json (hub falls back to the planned brief)")
    tech = [t for t in meta.get("tech", []) if isinstance(t, str)]
    unknown = [t for t in tech if t not in TECH_OK]
    if unknown:
        info["warnings"].append("unknown tech labels: " + ", ".join(unknown))
    info["tech"] = [t for t in tech if t in TECH_OK]
    feats = [f for f in meta.get("features", []) if isinstance(f, str)]
    info["features"] = feats or d["features"]
    info["interaction_built"] = meta.get("interaction") or ""
    info["notes"] = meta.get("notes") or ""
    return info


# ---------------------------------------------------------------- page parts

LOGO = ('<svg class="logo" viewBox="0 0 40 40" aria-hidden="true" focusable="false">'
        '<rect x="1" y="1" width="38" height="38" rx="9" fill="var(--accent)"/>'
        '<g fill="var(--on-accent)">'
        '<rect x="8" y="8" width="7" height="7" rx="1.6"/><rect x="16.5" y="8" width="7" height="7" rx="1.6"/><rect x="25" y="8" width="7" height="7" rx="1.6"/>'
        '<rect x="8" y="16.5" width="7" height="7" rx="1.6"/><rect x="18.5" y="18.5" width="9" height="9" rx="1.8" opacity=".92"/><rect x="25" y="16.5" width="7" height="7" rx="1.6" opacity="0"/>'
        '<rect x="8" y="25" width="7" height="7" rx="1.6"/><rect x="16.5" y="25" width="7" height="7" rx="1.6" opacity="0"/><rect x="25" y="25" width="7" height="7" rx="1.6" opacity="0"/>'
        '</g></svg>')

HEART = ('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20.3 4.6 13a4.9 4.9 0 0 1 0-7 4.8 4.8 0 0 1 6.9 0l.5.5.5-.5a4.8 4.8 0 0 1 6.9 0 4.9 4.9 0 0 1 0 7Z"/></svg>')

ARROW = '<span class="arr" aria-hidden="true">→</span>'


def drawer_card(d, scan, c, p):
    lang = "zh" if c["lang"].startswith("zh") else "en"
    name = d["name"]
    search_bits = [d["id"], name, d["type"]["en"], d["type"]["zh"], d["city"], d["style"]["en"], d["style"]["zh"],
                   d["interaction"]["en"], d["interaction"]["zh"], d["industry"]]
    content_all = CONTENT
    for L in ("en", "zh"):
        search_bits.append(content_all[L]["industries"][d["industry"]])
        search_bits += [content_all[L]["moods"][v] for v in d["moods"]]
        search_bits += [content_all[L]["features"][f] for f in scan.get("features", d["features"])]
    search = " ".join(search_bits).lower()
    kb = max(1, round(scan.get("bytes", 0) / 1024))
    palette = d.get("palette") or ["#ddd", "#999"]
    tech = " · ".join(scan.get("tech") or [])
    return (
        f'<li class="drawer" id="d-{d["id"]}" data-id="{d["id"]}" data-industry="{d["industry"]}" '
        f'data-moods="{" ".join(d["moods"])}" data-features="{" ".join(scan.get("features", d["features"]))}" '
        f'data-folder="{scan["folder"]}" data-name="{esc(name)}" data-type="{esc(d["type"][lang])}" data-city="{esc(d["city"])}" '
        f'data-style="{esc(d["style"][lang])}" data-interaction="{esc(d["interaction"][lang])}" data-tech="{esc(tech)}" '
        f'data-kb="{kb}" data-fonts="{esc(" · ".join(scan.get("fonts", [])))}" data-lang="{esc(c["langs"][d["lang"]])}" '
        f'data-search="{esc(search)}">'
        f'<a class="drawer-link" href="{p}demos/{scan["folder"]}/" data-open="{d["id"]}">'
        f'<span class="drawer-frame" style="--c1:{esc(palette[0])};--c2:{esc(palette[min(2, len(palette) - 1)])}">'
        f'<img class="drawer-img" src="{p}assets/thumbs/{d["id"]}.webp" width="720" height="450" loading="lazy" decoding="async" alt=""></span>'
        f'<span class="drawer-label"><span class="drawer-no">No. {d["id"]}</span>'
        f'<span class="drawer-name">{esc(name)}</span>'
        f'<span class="drawer-type">{esc(d["type"][lang])} · {esc(d["city"])}</span></span>'
        f'<span class="drawer-tags"><span class="tag">{esc(d["style"][lang])}</span>'
        f'<span class="tag tag-try">{esc(d["interaction"][lang])}</span></span></a>'
        f'<button class="drawer-save" type="button" aria-pressed="false" data-save="{d["id"]}" '
        f'aria-label="{esc(fill(c["box"]["save_label"], name=name))}">{HEART}</button></li>'
    )


def hero_box(demos, c, p, sprite):
    cols, rows = (sprite["cols"], sprite["rows"]) if sprite else (12, 9)
    order = sprite["order"] if sprite else [d["id"] for d in demos]
    by_id = {d["id"]: d for d in demos}
    tiles = []
    for i, did in enumerate(order):
        d = by_id.get(did)
        if not d:
            continue
        pal = d.get("palette") or ["#ccc"]
        tiles.append(f'<span class="tile" data-id="{did}" data-name="{esc(d["name"])}" '
                     f'style="--x:{i % cols};--y:{i // cols};--c:{esc(pal[min(2, len(pal) - 1)])}"></span>')
    sprite_style = f' style="--cols:{cols};--rows:{rows}"'
    last = demos[-1]["id"] if demos else "000"
    return (f'<div class="hero-box" aria-hidden="true">'
            f'<div class="case"><div class="case-inner"{sprite_style}>{"".join(tiles)}</div>'
            f'<span class="case-plate">No. 001–{last}</span></div>'
            f'<p class="case-caption">{esc(fill(c["hero"]["box_caption"], last=last))}<span class="hover-only"> · {esc(c["hero"]["box_hover"])}</span></p>'
            f'<span class="tile-tip" hidden></span></div>')


def page_chrome(lang, studio, c, services_page=False):
    """One header and footer for the showcase and services, in both languages."""
    home = "../" if services_page else ""
    services_url = "./" if services_page else "services/"
    other = ("../../services/" if lang == "zh" else "../zh/services/") if services_page else ("../" if lang == "zh" else "zh/")
    other_lang = "en-AU" if lang == "zh" else "zh-CN"
    name = (studio.get("name_zh") or studio["name"]) if lang == "zh" else studio["name"]
    brand = esc(name)
    if lang == "en" and name.endswith(" Studio"):
        brand = esc(name[:-7]) + '<span class="brand-suffix"> Studio</span>'
    links = (f'<a href="{home}#box">{esc(c["nav"]["box"])}</a>'
             f'<a href="{services_url}"' + (' aria-current="page"' if services_page else '') + f'>{esc(c["nav"]["services"])}</a>'
             f'<a href="#process">{esc(c["nav"]["process"])}</a><a href="#faq">{esc(c["nav"]["faq"])}</a>')
    header = f'''<header class="top" id="top">
  <div class="top-inner wrap">
    <a class="brand" href="{home or '#top'}" aria-label="{esc(name)}">{LOGO}<span class="brand-name">{brand}</span></a>
    <nav class="top-nav" aria-label="{esc(c['nav']['menu'])}">{links}</nav>
    <div class="top-actions">
      <a class="lang-switch" id="lang-switch" href="{other}" hreflang="{other_lang}" lang="{other_lang}" aria-label="{esc(c['nav']['lang_switch_label'])}">{esc(c['nav']['lang_switch'])}</a>
      <a class="btn btn-accent btn-small" href="{home}#contact">{esc(c['nav']['cta'])}</a>
    </div>
  </div>
</header>'''
    abn = f' · {esc(c["footer"]["abn"])} {esc(studio["abn"])}' if studio.get("abn") else ""
    footer = f'''<footer class="foot">
  <div class="wrap foot-inner">
    <div class="foot-brand"><a class="brand" href="{home or '#top'}">{LOGO}<span class="brand-name">{esc(name)}</span></a><p>{esc(c['footer']['tagline'])}</p></div>
    <nav class="foot-nav" aria-label="{'页尾导航' if lang == 'zh' else 'Footer'}">{links}<a href="{home}#contact">{esc(c['nav']['cta'])}</a><a href="{other}" hreflang="{other_lang}" lang="{other_lang}">{esc(c['nav']['lang_switch'])}</a></nav>
    <p class="foot-disclaimer">{esc(c['footer']['disclaimer'])}</p>
    <p class="foot-legal">© {date.today().year} {esc(studio['name'])}{abn} · {esc(c['footer']['made'])} <a href="#top">{esc(c['footer']['top'])} ↑</a></p>
  </div>
</footer>'''
    return header, footer


def render(lang, studio, content, demos, scans, stats, sprite, asset_v):
    c = content[lang]
    header, footer = page_chrome(lang, studio, c)
    p = "" if lang == "en" else "../"
    name = studio["name"]
    count = stats["count"]
    vals = dict(name=name, count=count, industries=stats["industries"], typefaces=stats["typefaces"], avg_kb=stats["avg_kb"])
    site_url = (studio.get("site_url") or "").rstrip("/")
    head_extra = []
    if site_url:
        self_url = site_url + ("/" if lang == "en" else "/zh/")
        head_extra += [f'<link rel="canonical" href="{esc(self_url)}">',
                       f'<link rel="alternate" hreflang="en-AU" href="{esc(site_url)}/">',
                       f'<link rel="alternate" hreflang="zh-CN" href="{esc(site_url)}/zh/">',
                       f'<link rel="alternate" hreflang="x-default" href="{esc(site_url)}/">',
                       f'<meta property="og:url" content="{esc(self_url)}">',
                       f'<meta property="og:image" content="{esc(site_url)}/assets/og.jpg">']
    robots = "index, follow" if site_url else "noindex, nofollow"
    fonts = ("https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700"
             "&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500")
    if lang == "zh":
        fonts += "&family=Noto+Serif+SC:wght@500;700"
    fonts += "&display=swap"

    industries = sorted({d["industry"] for d in demos}, key=list(c["industries"]).index)
    ind_counts = {k: sum(1 for d in demos if d["industry"] == k) for k in industries}
    chips = [f'<button class="chip" type="button" data-industry="all" aria-pressed="true">{esc(c["box"]["all"])} <span class="n">{count}</span></button>']
    chips += [f'<button class="chip" type="button" data-industry="{k}" aria-pressed="false">{esc(c["industries"][k])} <span class="n">{ind_counts[k]}</span></button>' for k in industries]
    mood_opts = "".join(f'<option value="{k}">{esc(v)}</option>' for k, v in c["moods"].items())
    used_feats = [k for k in c["features"] if any(k in scans[d["id"]].get("features", d["features"]) for d in demos)]
    feat_opts = "".join(f'<option value="{k}">{esc(c["features"][k])}</option>' for k in used_feats)
    cards = "\n".join(drawer_card(d, scans[d["id"]], c, p) for d in demos)

    services = "".join(
        f'<li class="svc"><span class="svc-no">0{i + 1}</span><h3>{esc(s["title"])}</h3><p>{esc(s["body"])}</p>'
        f'<p class="svc-good">{esc(s["good"])}</p>'
        f'<a class="text-link" href="{esc(s["link"] if s["link"].startswith("#") else s["link"] + "#box")}" data-filter-link>{esc(c["services"]["examples"])} {ARROW}</a></li>'
        for i, s in enumerate(c["services"]["items"]))
    steps = "".join(f'<li class="step"><span class="step-no">{i + 1}</span><h3>{esc(s["title"])}</h3><p>{esc(s["body"])}</p></li>'
                    for i, s in enumerate(c["process"]["steps"]))
    included = "".join(f'<li><span class="inc-icon" aria-hidden="true">{INC_ICONS[i % len(INC_ICONS)]}</span><h3>{esc(it["title"])}</h3><p>{esc(fill(it["body"], **vals))}</p></li>'
                       for i, it in enumerate(c["included"]["items"]))
    faq = "".join(f'<details class="qa"><summary><span>{esc(it["q"])}</span><span class="qa-icon" aria-hidden="true"></span></summary><p>{esc(it["a"])}</p></details>'
                  for it in c["faq"]["items"])

    ct = c["contact"]
    type_opts = "".join(f'<option value="{esc(c["industries"][k])}">{esc(c["industries"][k])}</option>' for k in c["industries"])
    type_opts += f'<option value="{esc(ct["type_other"])}">{esc(ct["type_other"])}</option>'
    needs = "".join(f'<label class="check"><input type="checkbox" name="needs" value="{esc(v)}"><span>{esc(v)}</span></label>' for v in ct["needs_items"])
    when = "".join(f'<label class="check"><input type="radio" name="when" value="{esc(v)}"><span>{esc(v)}</span></label>' for v in ct["when_items"])
    reach = "".join(f'<label class="check"><input type="radio" name="reach" value="{esc(v)}"><span>{esc(v)}</span></label>' for v in ct["reach_items"])

    channels = []
    if studio.get("email"):
        channels.append(f'<li><span>{esc(ct["email"])}</span><a href="mailto:{esc(studio["email"])}">{esc(studio["email"])}</a></li>')
    if studio.get("phone"):
        tel = re.sub(r"[^\d+]", "", studio["phone"])
        channels.append(f'<li><span>{esc(ct["phone"])}</span><a href="tel:{esc(tel)}">{esc(studio["phone"])}</a></li>')
    if studio.get("whatsapp"):
        wa = re.sub(r"\D", "", studio["whatsapp"])
        channels.append(f'<li><span>{esc(ct["whatsapp"])}</span><a href="https://wa.me/{esc(wa)}" rel="noopener">{esc(studio["whatsapp"])}</a></li>')
    if studio.get("wechat"):
        channels.append(f'<li><span>{esc(ct["wechat"])}</span><button type="button" class="copy-id" data-copy="{esc(studio["wechat"])}">{esc(studio["wechat"])}</button></li>')
    if studio.get("instagram"):
        handle = studio["instagram"].lstrip("@")
        channels.append(f'<li><span>{esc(ct["instagram"])}</span><a href="https://www.instagram.com/{esc(quote(handle))}/" rel="noopener">@{esc(handle)}</a></li>')
    channels_html = (f'<ul class="channel-list">{"".join(channels)}</ul>' if channels
                     else f'<p class="channels-preview" id="channels-preview">{esc(ct["channels_preview"])}</p>')
    email_btn = (f'<a class="btn btn-accent" id="brief-email" href="mailto:{esc(studio["email"])}">{esc(ct["email_button"])}</a>'
                 if studio.get("email") else
                 f'<button class="btn btn-accent" id="brief-email" type="button" disabled aria-describedby="channels-preview">{esc(ct["email_unavailable"])}</button>')

    v = c["viewer"]
    config = {
        "lang": lang, "prefix": p, "studio": {k: studio.get(k) for k in ("name", "email", "phone", "whatsapp", "wechat", "instagram")},
        "count": count, "box": c["box"], "viewer": v, "hero": {k: c["hero"][k] for k in ("tryon_done", "tryon_cleared")},
        "contact": {k: ct[k] for k in ("copied", "copy_failed", "emailed", "subject", "brief_empty", "remove", "email_button")},
        "brief": c["brief_labels"], "features": c["features"], "moods": c["moods"], "industries": c["industries"],
    }
    config_json = json.dumps(config, ensure_ascii=False).replace("</", "<\\/")

    return f"""<!doctype html>
<html lang="{c['lang']}" class="no-js" data-page-lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(fill(c['title'], **vals))}</title>
<meta name="description" content="{esc(fill(c['description'], **vals))}">
<meta name="robots" content="{robots}">
<meta name="theme-color" content="#F3EFE7">
<meta name="color-scheme" content="light">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(fill(c['title'], **vals))}">
<meta property="og:description" content="{esc(fill(c['description'], **vals))}">
{chr(10).join(head_extra)}
<link rel="icon" href="{p}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<link rel="stylesheet" href="{p}assets/hub.css?v={asset_v['css']}">
{('<style>.tile{background-image:url(' + p + 'assets/box-sprite.webp?v=' + sprite['v'] + ')}</style>') if sprite else ''}
<script>document.documentElement.className=document.documentElement.className.replace('no-js','js');</script>
<script src="{p}assets/hub.js?v={asset_v['js']}" defer></script>
</head>
<body>
<a class="skip" href="#main">{esc(c['skip'])}</a>
{header}
<main id="main">
<section class="hero wrap" aria-labelledby="hero-title">
  <div class="hero-copy">
    <p class="eyebrow">{esc(c['hero']['eyebrow'])}</p>
    <h1 id="hero-title">{fill(c['hero']['title_html'], **vals)}</h1>
    <p class="lede">{esc(c['hero']['lede'])}</p>
    <form class="tryon" id="tryon" autocomplete="off" data-kit-ignore>
      <label for="tryon-name">{esc(c['hero']['tryon_label'])}</label>
      <div class="tryon-row">
        <input id="tryon-name" name="brand" maxlength="32" placeholder="{esc(c['hero']['tryon_placeholder'])}" autocomplete="organization" spellcheck="false">
        <button class="btn btn-accent" type="submit">{esc(c['hero']['tryon_button'])}</button>
      </div>
      <p class="hint" id="tryon-hint" aria-live="polite">{esc(c['hero']['tryon_hint'])}</p>
    </form>
    <div class="hero-ctas">
      <a class="btn btn-ink" href="#box">{esc(c['hero']['open_box'])} <span aria-hidden="true">↓</span></a>
      <a class="text-link" href="#contact">{esc(c['hero']['start'])} {ARROW}</a>
      <a class="text-link" href="services/">{esc(c['nav']['services'])} {ARROW}</a>
    </div>
  </div>
  {hero_box(demos, c, p, sprite)}
</section>

<section class="proof" aria-label="{esc(c['proof']['label'])}">
  <ul class="proof-list wrap">
    <li><strong>{count}</strong><span>{esc(c['proof']['demos'])}</span></li>
    <li><strong>{stats['industries']}</strong><span>{esc(c['proof']['industries'])}</span></li>
    <li><strong>{stats['typefaces']}</strong><span>{esc(c['proof']['typefaces'])}</span></li>
    <li><strong>{stats['avg_kb']}</strong><span>{esc(c['proof']['avg'])}</span></li>
    {'<li><strong>0</strong><span>' + esc(c['proof']['stock']) + '</span></li>' if stats['no_stock'] else ''}
  </ul>
</section>

<section class="box" id="box" aria-labelledby="box-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">{esc(c['box']['eyebrow'])}</p>
      <h2 id="box-title">{esc(c['box']['title'])}</h2>
      <p class="section-intro">{esc(c['box']['intro'])}</p>
      <p class="note">{esc(c['box']['note'])}</p>
    </div>
  </div>
  <div class="filters" id="filters">
    <div class="wrap filters-inner">
      <div class="chips" role="group" aria-label="{esc(c['box']['industry_label'])}">{''.join(chips)}</div>
      <div class="filter-tools">
        <label class="search"><span class="sr-only">{esc(c['box']['search_label'])}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input type="search" id="search" placeholder="{esc(c['box']['search_placeholder'])}" autocomplete="off" spellcheck="false"></label>
        <label class="select"><span class="sr-only">{esc(c['box']['mood_label'])}</span><select id="mood"><option value="">{esc(c['box']['mood_any'])}</option>{mood_opts}</select></label>
        <label class="select"><span class="sr-only">{esc(c['box']['feature_label'])}</span><select id="feature"><option value="">{esc(c['box']['feature_any'])}</option>{feat_opts}</select></label>
        <button class="btn btn-small btn-line" type="button" id="saved-toggle" aria-pressed="false">{HEART}<span>{esc(c['box']['saved'])}</span> <span class="n" id="saved-count">0</span></button>
        <button class="btn btn-small btn-line" type="button" id="shuffle"><span aria-hidden="true">⤨</span> {esc(c['box']['shuffle'])}</button>
        <div class="view-toggle" role="group" aria-label="{esc(c['box']['view_label'])}">
          <button type="button" data-view="cabinet" aria-pressed="true">{esc(c['box']['view_cabinet'])}</button><button type="button" data-view="index" aria-pressed="false">{esc(c['box']['view_index'])}</button>
        </div>
      </div>
    </div>
  </div>
  <div class="wrap">
    <p class="count" id="count" aria-live="polite">{esc(fill(c['box']['count_all'], n=count))}</p>
    <ol class="drawers" id="drawers" data-view="cabinet">
{cards}
    </ol>
    <div class="empty" id="empty" hidden>
      <p class="empty-title">{esc(c['box']['empty_title'])}</p>
      <p>{esc(c['box']['empty_body'])}</p>
      <p><button class="btn btn-ink btn-small" type="button" id="clear-filters">{esc(c['box']['clear'])}</button></p>
    </div>
  </div>
</section>

<section class="services wrap" id="services" aria-labelledby="services-title">
  <div class="section-head">
    <p class="eyebrow">{esc(c['services']['eyebrow'])}</p>
    <h2 id="services-title">{esc(c['services']['title'])}</h2>
    <p class="section-intro">{esc(c['services']['intro'])}</p>
  </div>
  <ol class="svc-list">{services}</ol>
  <p class="services-more"><a class="btn btn-line" href="services/">{esc(c['services']['more'])} {ARROW}</a></p>
</section>

<section class="process" id="process" aria-labelledby="process-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">{esc(c['process']['eyebrow'])}</p>
      <h2 id="process-title">{esc(c['process']['title'])}</h2>
    </div>
    <ol class="steps">{steps}</ol>
    <p class="note process-note">{esc(c['process']['note'])}</p>
  </div>
</section>

<section class="included wrap" aria-labelledby="included-title">
  <div class="section-head">
    <p class="eyebrow">{esc(c['included']['eyebrow'])}</p>
    <h2 id="included-title">{esc(c['included']['title'])}</h2>
  </div>
  <ul class="inc-list">{included}</ul>
</section>

<section class="faq wrap" id="faq" aria-labelledby="faq-title">
  <div class="section-head">
    <p class="eyebrow">{esc(c['faq']['eyebrow'])}</p>
    <h2 id="faq-title">{esc(c['faq']['title'])}</h2>
  </div>
  <div class="qa-list">{faq}</div>
</section>

<section class="contact" id="contact" aria-labelledby="contact-title">
  <div class="wrap contact-grid">
    <div class="contact-main">
      <div class="section-head">
        <p class="eyebrow">{esc(ct['eyebrow'])}</p>
        <h2 id="contact-title">{esc(ct['title'])}</h2>
        <p class="section-intro">{esc(ct['intro'])}</p>
      </div>
      <form class="brief-form" id="brief-form" novalidate data-kit-ignore>
        <div class="field-row">
          <div class="field"><label for="f-name">{esc(ct['your_name'])}</label><input id="f-name" name="name" autocomplete="name"></div>
          <div class="field"><label for="f-business">{esc(ct['business'])}</label><input id="f-business" name="business" autocomplete="organization" maxlength="60"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="f-type">{esc(ct['type'])}</label><select id="f-type" name="type"><option value="">{esc(ct['type_placeholder'])}</option>{type_opts}</select></div>
          <div class="field"><label for="f-where">{esc(ct['where'])}</label><input id="f-where" name="where" autocomplete="address-level2"></div>
        </div>
        <fieldset class="field"><legend>{esc(ct['needs'])}</legend><div class="checks">{needs}</div></fieldset>
        <div class="field">
          <span class="label" id="liked-label">{esc(ct['liked'])}</span>
          <ul class="liked" id="liked" aria-labelledby="liked-label"></ul>
          <p class="liked-empty" id="liked-empty">{esc(ct['liked_empty'])} <a href="#box">{esc(ct['liked_add'])}</a></p>
        </div>
        <fieldset class="field"><legend>{esc(ct['when'])}</legend><div class="checks">{when}</div></fieldset>
        <fieldset class="field"><legend>{esc(ct['reach'])}</legend><div class="checks">{reach}</div>
          <label class="sub-label" for="f-reach">{esc(ct['reach_detail'])}</label><input id="f-reach" name="reach_detail" autocomplete="email"></fieldset>
        <div class="field"><label for="f-msg">{esc(ct['message'])}</label><textarea id="f-msg" name="message" rows="4" placeholder="{esc(ct['message_placeholder'])}"></textarea></div>
      </form>
    </div>
    <aside class="brief-card" aria-labelledby="brief-title">
      <div class="brief-paper">
        <h3 id="brief-title">{esc(ct['brief_title'])}</h3>
        <pre class="brief-text" id="brief-text" tabindex="0">{esc(ct['brief_empty'])}</pre>
      </div>
      <div class="brief-actions">
        {email_btn}
        <button class="btn btn-line" id="brief-copy" type="button">{esc(ct['copy_button'])}</button>
      </div>
      <p class="brief-status" id="brief-status" role="status" aria-live="polite"></p>
      <div class="channels">
        <h3>{esc(ct['channels_title'])}</h3>
        {channels_html}
      </div>
      <p class="privacy">{esc(ct['privacy'])}</p>
    </aside>
  </div>
</section>
</main>

{footer}

<dialog class="viewer" id="viewer" aria-labelledby="v-name">
  <div class="v-bar">
    <div class="v-title"><span class="v-no" id="v-no">No. 000</span><h2 class="v-name" id="v-name" tabindex="-1" autofocus>—</h2><span class="v-meta" id="v-meta"></span></div>
    <div class="v-devices" role="group" aria-label="{esc(v['device_label'])}">
      <button type="button" data-device="desktop" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg><span>{esc(v['desktop'])}</span></button>
      <button type="button" data-device="tablet" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M11 18.5h2"/></svg><span>{esc(v['tablet'])}</span></button>
      <button type="button" data-device="phone" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/></svg><span>{esc(v['phone'])}</span></button>
    </div>
    <label class="v-brand"><span>{esc(v['brand_label'])}</span><input id="v-brand" maxlength="32" placeholder="{esc(v['brand_placeholder'])}" autocomplete="organization" spellcheck="false"></label>
    <div class="v-actions">
      <button type="button" class="v-btn" id="v-save" aria-pressed="false">{HEART}<span>{esc(v['save'])}</span></button>
      <a class="v-btn" id="v-newtab" href="#" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg><span>{esc(v['newtab'])}</span></a>
      <button type="button" class="v-btn" id="v-info" aria-expanded="false" aria-controls="v-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg><span>{esc(v['about'])}</span></button>
      <button type="button" class="v-btn v-close" id="v-close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span>{esc(v['close'])}</span></button>
    </div>
  </div>
  <div class="v-stage" id="v-stage">
    <div class="v-frame" id="v-frame" data-device="desktop">
      <div class="v-screen" id="v-screen">
        <span class="v-status" aria-hidden="true"><b>9:41</b><svg viewBox="0 0 68 12"><g fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/><path d="M29 11.6 31.3 9.2a3.3 3.3 0 0 0-4.6 0ZM24.4 6.9l1.3 1.3a5.8 5.8 0 0 1 6.6 0l1.3-1.3a7.8 7.8 0 0 0-9.2 0ZM21.9 4.2l1.3 1.3a9.5 9.5 0 0 1 11.6 0l1.3-1.3a11.4 11.4 0 0 0-14.2 0Z"/><rect x="43.5" y="1.5" width="20" height="9" rx="2.6" fill="none" stroke="currentColor" stroke-opacity=".5"/><rect x="45.5" y="3.5" width="14" height="5" rx="1.4"/><rect x="64.6" y="4.3" width="1.8" height="3.4" rx=".9" fill-opacity=".5"/></g></svg></span>
        <div class="v-loading" id="v-loading"><img id="v-poster" alt="" src="data:,"><span id="v-loading-text"></span></div>
        <iframe id="v-iframe" title="" src="about:blank" referrerpolicy="same-origin"></iframe>
      </div>
    </div>
    <aside class="v-panel" id="v-panel" hidden>
      <p class="v-concept">{esc(v['concept'])}</p>
      <dl>
        <dt>{esc(v['style'])}</dt><dd id="vp-style"></dd>
        <dt>{esc(v['interaction'])}</dt><dd id="vp-interaction"></dd>
        <dt>{esc(v['built'])}</dt><dd id="vp-tech"></dd>
        <dt>{esc(v['weight'])}</dt><dd id="vp-kb"></dd>
        <dt>{esc(v['fonts'])}</dt><dd id="vp-fonts"></dd>
        <dt>{esc(v['language'])}</dt><dd id="vp-lang"></dd>
      </dl>
    </aside>
  </div>
  <div class="v-foot">
    <div class="v-nav">
      <button type="button" class="v-btn" id="v-prev"><span aria-hidden="true">←</span><span class="sr-only">{esc(v['prev'])}</span></button>
      <span class="v-pos" id="v-pos"></span>
      <button type="button" class="v-btn" id="v-next"><span class="sr-only">{esc(v['next'])}</span><span aria-hidden="true">→</span></button>
      <button type="button" class="v-btn v-play" id="v-play" aria-pressed="false"><span class="v-play-icon" aria-hidden="true"></span><span id="v-play-label">{esc(v['play'])}</span></button>
    </div>
    <div class="v-progress" aria-hidden="true"><span id="v-progress"></span></div>
    <a class="btn btn-accent btn-small v-want" id="v-want" href="#contact"><span class="want-long">{esc(v['want'])}</span><span class="want-short">{esc(v['want_short'])}</span> {ARROW}</a>
  </div>
</dialog>
<div class="hub-toast" id="hub-toast" role="status" aria-live="polite"></div>
<script type="application/json" id="hub-config">{config_json}</script>
</body>
</html>
"""


def render_404(studio, asset_v):
    name = esc(studio["name"])
    return f"""<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<script>
  /* This page is served at whatever URL was missing, so resolve its links from the site root:
     the first path segment on a GitHub Pages project site (/repo/), otherwise "/".
     Local files are written after <base> so the browser never prefetches them from the wrong folder. */
  (function () {{
    var m = /[.]github[.]io$/.test(location.hostname) && location.pathname.match(/^[/][^/]+[/]/);
    document.write('<base href="' + (m ? m[0] : "/") + '">' +
      '<link rel="icon" href="favicon.svg" type="image/svg+xml">' +
      '<link rel="stylesheet" href="assets/hub.css?v={asset_v['css']}">');
  }})();
</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — {name}</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=Instrument+Serif&display=swap">
</head>
<body>
<main id="main" class="wrap" style="min-height:100vh;display:grid;align-content:center;gap:18px;padding-block:64px">
  <a class="brand" href="./">{LOGO}<span class="brand-name">{name}</span></a>
  <p class="eyebrow">404 · Empty drawer</p>
  <h1 style="font:400 clamp(48px,8vw,112px)/.95 var(--serif);margin:0;letter-spacing:-.02em">This drawer is empty.</h1>
  <p class="lede" lang="zh-CN">这个抽屉是空的——页面不存在或已移动。</p>
  <p style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0 0"><a class="btn btn-ink" href="./#box">Open the box</a><a class="btn btn-line" href="zh/#box" lang="zh-CN">打开盒子（中文）</a></p>
</main>
</body>
</html>
"""


# ---------------------------------------------------------------- main

def asset_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10] if path.is_file() else "0"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="exit 1 when a demo breaks the contract")
    args = ap.parse_args(argv)

    studio = load("studio.json")
    content = load("content.json")
    services_content = load("services.json")
    CONTENT.update(content)
    catalogue = load("demos.json")
    scans = {d["id"]: scan_demo(d) for d in catalogue}
    demos = [d for d in catalogue if scans[d["id"]]["exists"]]
    missing = [d["id"] for d in catalogue if not scans[d["id"]]["exists"]]

    typefaces = sorted({f for d in demos for f in scans[d["id"]].get("fonts", [])})
    sizes = [scans[d["id"]]["bytes"] for d in demos]
    no_stock = bool(demos) and not any(scans[d["id"]]["raster_files"] for d in demos) and \
        not any("remote images" in scans[d["id"]]["problems"] for d in demos)
    stats = {"count": len(demos), "industries": len({d["industry"] for d in demos}), "typefaces": len(typefaces),
             "avg_kb": round(sum(sizes) / len(sizes) / 1024) if sizes else 0, "no_stock": no_stock}

    sprite = None
    sj = SITE / "assets" / "box-sprite.json"
    if sj.is_file() and (SITE / "assets" / "box-sprite.webp").is_file():
        sprite = json.loads(sj.read_text())
        sprite["v"] = asset_hash(SITE / "assets" / "box-sprite.webp")

    # kit constants follow studio.json
    kit = DEMOS_DIR / "_kit" / "kit.js"
    src = kit.read_text(encoding="utf-8")
    src = re.sub(r'var STUDIO = ".*?";', 'var STUDIO = ' + json.dumps(studio["name"]) + ';', src, count=1)
    kit.write_text(src, encoding="utf-8")

    asset_v = {"css": asset_hash(SITE / "assets" / "hub.css"), "js": asset_hash(SITE / "assets" / "hub.js")}
    (SITE / "zh").mkdir(exist_ok=True)
    (SITE / "index.html").write_text(render("en", studio, content, demos, scans, stats, sprite, asset_v), encoding="utf-8")
    (SITE / "zh" / "index.html").write_text(render("zh", studio, content, demos, scans, stats, sprite, asset_v), encoding="utf-8")

    for lang, relative in (("en", "services"), ("zh", "zh/services")):
        target = SITE / relative
        target.mkdir(parents=True, exist_ok=True)
        header, footer = page_chrome(lang, studio, content[lang], services_page=True)
        (target / "index.html").write_text(
            render_services(lang, studio, content[lang], services_content[lang], asset_v, header, footer), encoding="utf-8")

    (SITE / "404.html").write_text(render_404(studio, asset_v), encoding="utf-8")
    site_url = (studio.get("site_url") or "").rstrip("/")
    if site_url:
        (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {site_url}/sitemap.xml\n")
        today = date.today().isoformat()
        (SITE / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "".join(
                f'  <url><loc>{site_url}{path}</loc><lastmod>{today}</lastmod>'
                f'<xhtml:link rel="alternate" hreflang="en-AU" href="{site_url}{en_path}"/>'
                f'<xhtml:link rel="alternate" hreflang="zh-CN" href="{site_url}{zh_path}"/></url>\n'
                for en_path, zh_path in (("/", "/zh/"), ("/services/", "/zh/services/"))
                for path in (en_path, zh_path)) + "</urlset>\n")
    else:
        (SITE / "robots.txt").write_text("# Preview build: no production domain configured in src/studio.json yet.\nUser-agent: *\nDisallow: /\n")
        if (SITE / "sitemap.xml").exists():
            (SITE / "sitemap.xml").unlink()

    report = {"built": ["site/index.html", "site/zh/index.html", "site/services/index.html", "site/zh/services/index.html", "site/robots.txt"], "stats": stats,
              "typeface_list": typefaces, "missing_demos": missing,
              "problems": {i: s["problems"] for i, s in scans.items() if s["exists"] and s["problems"]},
              "warnings": {i: s["warnings"] for i, s in scans.items() if s["exists"] and s["warnings"]},
              "thumbs_missing": [d["id"] for d in demos if not (SITE / "assets" / "thumbs" / f"{d['id']}.webp").is_file()],
              "sprite": bool(sprite), "indexable": bool(site_url)}
    (ROOT / "evidence").mkdir(exist_ok=True)
    (ROOT / "evidence" / "build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ("stats", "missing_demos", "sprite", "indexable")}, ensure_ascii=False))
    if report["problems"]:
        print("contract problems:", json.dumps(report["problems"], ensure_ascii=False, indent=1))
    if report["warnings"]:
        print(f"warnings in {len(report['warnings'])} demo(s) — see evidence/build-report.json")
    if args.check and (report["problems"] or missing):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
