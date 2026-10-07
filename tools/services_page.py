"""Bilingual service page, using the hub's shared layout and design tokens."""
import html
import posixpath
from urllib.parse import urlsplit
from seo import LANGS, head_links, json_ld, robots_meta


def live_internal_href(registry, href, base_slug=""):
    """Keep a relative internal link only when its destination is registered live."""
    if not isinstance(href, str) or not href:
        return None
    target = urlsplit(href)
    if target.scheme or target.netloc:
        return None
    path = (target.path.lstrip("/") if target.path.startswith("/")
            else posixpath.join(base_slug, target.path))
    slug = posixpath.normpath(path).strip("/")
    if slug == ".":
        slug = ""
    return href if registry.get(slug, {}).get("status") == "live" else None


def render_services(lang, studio, c, s, asset_v, header, footer, registry, slug="services", live=True):
    e = lambda value: html.escape(str(value), quote=True)
    home = "../" * len(slug.split("/"))
    prefix = home + ("../" if lang == "zh" else "")
    site_url = (studio.get("site_url") or "").rstrip("/")
    secondary_url = s.get("secondary_url", home + "#box")
    breadcrumb = (f'<a class="scope-back text-link" href="../">← {e(s["back_label"])}</a>'
                  if s.get("back_label") else "")
    title = s["title"] + " — " + studio["name"]
    fonts = ("https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700"
             "&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500")
    if lang == "zh":
        fonts += "&family=Noto+Serif+SC:wght@500;700"
    extra = head_links(site_url, slug, lang, live=live)
    items = [(item, live_internal_href(registry, item.get("href"), slug)) for item in s["items"]]
    index = "".join(
        f'<li><a href="{e(href or "#" + item["id"])}"><span class="svc-no">0{i + 1}</span>'
        f'<span>{e(item["short"])}</span><span class="arr" aria-hidden="true">↗</span></a></li>'
        for i, (item, href) in enumerate(items))
    services = "".join(
        f'<li class="svc{" svc-featured" if href else ""}" id="{e(item["id"])}"><span class="svc-no">0{i + 1}</span>'
        f'<h3>{e(item["title"])}</h3><p>{e(item["body"])}</p>'
        f'<ul class="scope-points">{"".join("<li>" + e(point) + "</li>" for point in item["points"])}</ul>'
        f'<p class="svc-good">{e(item["for"])}</p>'
        + (f'<a class="text-link" href="{e(href)}">{e(item["link_label"])} <span aria-hidden="true">→</span></a>' if href else "")
        + '</li>'
        for i, (item, href) in enumerate(items))
    steps = "".join(
        f'<li class="step"><span class="step-no">{i + 1}</span><h3>{e(item["title"])}</h3><p>{e(item["body"])}</p></li>'
        for i, item in enumerate(s["process"]["items"]))
    pricing = "".join(
        f'<li><span class="svc-no">0{i + 1}</span><div><h3>{e(item["title"])}</h3><p>{e(item["body"])}</p></div></li>'
        for i, item in enumerate(s["pricing"]["items"]))
    faqs = "".join(
        f'<details class="qa"><summary><span>{e(item["q"])}</span><span class="qa-icon" aria-hidden="true"></span></summary><p>{e(item["a"])}</p></details>'
        for item in s["faq"]["items"])
    return f'''<!doctype html>
<html lang="{LANGS[lang]['html_lang']}" data-page-lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(s['description'])}">
<meta name="robots" content="{robots_meta(site_url, live=live)}">
<meta name="theme-color" content="#F3EFE7">
<meta name="color-scheme" content="light">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(s['description'])}">
{extra}
{json_ld(studio, slug, lang, registry, s['title'], s['description'], live=live)}
<link rel="icon" href="{prefix}favicon.svg?v={asset_v['favicon']}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}&display=swap">
<link rel="stylesheet" href="{prefix}assets/hub.css?v={asset_v['css']}">
</head>
<body class="services-page">
<a class="skip" href="#main">{e(c['skip'])}</a>
{header}
<main id="main">
<section class="hero scope-hero wrap" aria-labelledby="hero-title">
  <div class="hero-copy">
{breadcrumb}
    <p class="eyebrow">{e(s['eyebrow'])}</p>
    <h1 id="hero-title">{e(s['headline'][0])}<br><em>{e(s['headline'][1])}</em></h1>
    <p class="lede">{e(s['intro'])}</p>
    <div class="hero-ctas"><a class="btn btn-accent" href="{home}#contact">{e(s['cta'])} <span aria-hidden="true">→</span></a><a class="text-link" href="{e(secondary_url)}">{e(s['work'])} <span aria-hidden="true">→</span></a></div>
    <p class="scope-caption">{e(s['caption'])}</p>
  </div>
  <nav class="scope-index" aria-label="{e(s['index_label'])}">
    <p class="eyebrow">{e(s['index_label'])}</p>
    <ol>{index}</ol>
    <p class="scope-index-note">{e(s['index_note'])}</p>
  </nav>
</section>
<section class="scope-values" aria-label="{e(s['values_label'])}"><ul class="wrap">{''.join('<li>' + e(v) + '</li>' for v in s['values'])}</ul></section>
<section class="services wrap scope-services" id="scope" aria-labelledby="scope-title">
  <div class="section-head"><p class="eyebrow">{e(s['scope_eyebrow'])}</p><h2 id="scope-title">{e(s['scope_title'])}</h2><p class="section-intro">{e(s['scope_intro'])}</p></div>
  <ol class="svc-list">{services}</ol>
</section>
<section class="process" id="process" aria-labelledby="process-title"><div class="wrap">
  <div class="section-head"><p class="eyebrow">{e(s['process']['eyebrow'])}</p><h2 id="process-title">{e(s['process']['title'])}</h2></div>
  <ol class="steps">{steps}</ol><p class="note process-note">{e(s['process']['note'])}</p>
</div></section>
<section class="scope-pricing wrap" id="approach" aria-labelledby="pricing-title">
  <div class="section-head"><p class="eyebrow">{e(s['pricing']['eyebrow'])}</p><h2 id="pricing-title">{e(s['pricing']['title'])}</h2><p class="section-intro">{e(s['pricing']['intro'])}</p></div>
  <ol class="pricing-points">{pricing}</ol>
</section>
<section class="faq wrap" id="faq" aria-labelledby="faq-title"><div class="section-head"><p class="eyebrow">{e(s['faq']['eyebrow'])}</p><h2 id="faq-title">{e(s['faq']['title'])}</h2></div><div>{faqs}</div></section>
<section class="contact scope-contact" aria-labelledby="contact-title"><div class="wrap">
  <div class="section-head"><p class="eyebrow">{e(s['closing']['eyebrow'])}</p><h2 id="contact-title">{e(s['closing']['title'])}</h2><p class="section-intro">{e(s['closing']['body'])}</p></div>
  <div class="hero-ctas"><a class="btn btn-accent" href="{home}#contact">{e(s['cta'])} <span aria-hidden="true">→</span></a><a class="text-link" href="{e(secondary_url)}">{e(s['work'])} <span aria-hidden="true">→</span></a></div>
</div></section>
</main>
{footer}
</body>
</html>
'''
