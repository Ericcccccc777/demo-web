"""Static service and industry pages with shared chrome and factual concept cards."""
import html
import re
from seo import LANGS, head_links, json_ld, robots_meta


def render_service_detail(lang, studio, c, page, entry, asset_v, header, footer, site_url, vals):
    def e(value):
        text = str(value)
        for key, replacement in vals.items():
            text = text.replace("{" + key + "}", str(replacement))
        return html.escape(text, quote=True)

    zh = lang == "zh"
    slug = entry["slug"]
    home = "../" * len(slug.split("/"))
    prefix = home + ("../" if zh else "")
    registry = entry["_registry"]
    live = entry["status"] == "live"
    labels = {
        "scope": "项目范围" if zh else "The scope",
        "concept": "概念作品" if zh else "Concept",
        "updated": "最后更新" if zh else "Last updated",
    }
    title = page["title"] + " — " + studio["name"]
    fonts = ("https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700"
             "&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500")
    if zh:
        fonts += "&family=Noto+Serif+SC:wght@500;700"
    points = lambda items: '<ul class="scope-points">' + "".join(f'<li>{e(v)}</li>' for v in items) + '</ul>'
    sections = []
    reserved = {"main", "hero-title", "audience", "scope", "process", "pricing", "concepts", "cities", "faq", "related"}
    for section in page.get("sections", []):
        sid = section["id"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", sid) or sid in reserved:
            raise ValueError(f"Invalid or duplicate section id on {slug}: {sid}")
        reserved.add(sid)
        sections.append(f'<section class="services wrap ev-prose" id="{e(sid)}"><h2>{e(section["title"])}</h2>'
                        + "".join(f'<p>{e(p)}</p>' for p in section["body"]) + '</section>')
    steps = "".join(f'<li class="step"><span class="step-no">{i + 1}</span><h3>{e(p["title"])}</h3><p>{e(p["body"])}</p></li>'
                    for i, p in enumerate(page["process"]))
    cards = []
    for item in page.get("demos", []):
        did = item["id"]
        demo = entry["_demos"].get(did)
        scan = entry["_scans"].get(did)
        if not demo or not scan or not scan["exists"]:
            raise ValueError(f"Unknown concept {did} on {slug}")
        cards.append(f'<li class="svc"><a href="{prefix}demos/{e(scan["folder"])}/">'
                     f'<img class="ev-concept-image" src="{prefix}assets/thumbs/{e(did)}.webp" width="720" height="450" loading="lazy" decoding="async" '
                     f'alt="{e(demo["name"])} {"概念设计截图" if zh else "concept design screenshot"}"></a>'
                     f'<h3><a href="{prefix}demos/{e(scan["folder"])}/">{e(demo["name"])} · {labels["concept"]}</a></h3><p>{e(item["shows"])}</p></li>')
    concepts = (f'<section class="services wrap" id="concepts"><h2>{e(page["demos_title"])}</h2><ul class="svc-list">{"".join(cards)}</ul></section>' if cards else "")
    links = "".join(f'<li><a class="text-link" href="{home}{e(item["slug"])}/">{e(item["label"])}</a></li>'
                    for item in page.get("related", []) if registry.get(item["slug"], {}).get("status") == "live")
    related = f'<section class="services wrap" id="related"><h2>{e(page["related_title"])}</h2><ul class="scope-points">{links}</ul></section>' if links else ""
    faqs = "".join(f'<details class="qa"><summary><span>{e(p["q"])}</span><span class="qa-icon" aria-hidden="true"></span></summary><p>{e(p["a"])}</p></details>' for p in page["faq"])
    return f'''<!doctype html>
<html lang="{LANGS[lang]['html_lang']}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(page['description'])}">
<meta name="robots" content="{robots_meta(site_url, live=live)}">
<meta name="theme-color" content="#F3EFE7"><meta name="color-scheme" content="light">
<meta property="og:type" content="website"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(page['description'])}">
{head_links(site_url, slug, lang, live=live)}
{json_ld(studio, slug, lang, registry, page['title'], page['description'], live=live)}
<link rel="icon" href="{prefix}favicon.svg?v={asset_v['favicon']}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}&display=swap"><link rel="stylesheet" href="{prefix}assets/hub.css?v={asset_v['css']}">
</head><body class="services-page ev-detail">
<a class="skip" href="#main">{e(c['skip'])}</a>{header}
<main id="main">
<section class="hero scope-hero wrap" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow">{e(page['eyebrow'])}</p><h1 id="hero-title">{e(page['h1'])}</h1><p class="lede">{e(page['answer'])}</p><div class="hero-ctas"><a class="btn btn-accent" href="{home}#contact">{e(page['cta_button'])} →</a></div></div></section>
<section class="services wrap ev-prose" id="audience"><h2>{e(page['for_title'])}</h2>{points(page['for_items'])}</section>
<section class="services wrap scope-services" id="scope"><h2>{labels['scope']}</h2><ul class="svc-list"><li class="svc"><h3>{e(page['included_title'])}</h3>{points(page['included'])}</li><li class="svc"><h3>{e(page['not_included_title'])}</h3>{points(page['not_included'])}</li></ul></section>
{''.join(sections)}
<section class="process" id="process"><div class="wrap"><div class="section-head"><h2>{e(page['process_title'])}</h2></div><ol class="steps">{steps}</ol></div></section>
<section class="scope-pricing wrap" id="pricing"><h2>{e(page['pricing_title'])}</h2><ul class="pricing-points"><li><span class="svc-no">01</span><p>{e(page['pricing_body'])}</p></li></ul></section>
{concepts}
<section class="services wrap ev-prose" id="cities"><h2>{e(page['cities_title'])}</h2><p>{e(page['cities_body'])}</p></section>
<section class="faq wrap" id="faq"><div class="section-head"><h2>{e(page['faq_title'])}</h2></div>{faqs}</section>
{related}
<section class="contact scope-contact"><div class="wrap"><div class="section-head"><h2>{e(page['cta_title'])}</h2><p class="section-intro">{e(page['cta_body'])}</p></div><a class="btn btn-accent" href="{home}#contact">{e(page['cta_button'])} →</a><p class="editorial-date">{labels['updated']}: {e(entry['content_updated'])}</p></div></section>
</main>{footer}</body></html>'''
