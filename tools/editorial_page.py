"""Shared, bilingual studio and policy pages."""
import html
import re
from pathlib import PurePosixPath
from urllib.parse import urlparse
from seo import LANGS, head_links, json_ld, robots_meta


def render_editorial(lang, slug, studio, content, page, asset_v, header, footer, registry, live=True):
    e = lambda value: html.escape(str(value), quote=True)
    home = "../" * len(slug.split("/"))
    prefix = home + ("../" if lang == "zh" else "")
    title = page["title"] + " — " + studio["name"]
    site_url = (studio.get("site_url") or "").rstrip("/")
    extra = head_links(site_url, slug, lang, live=live)
    fonts = ("https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700"
             "&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500")
    if lang == "zh":
        fonts += "&family=Noto+Serif+SC:wght@500;700"
    contents = "".join(f'<li><a href="#{e(s["id"])}">{e(s["title"])}</a></li>' for s in page["sections"])
    def links(items, external=False):
        rendered = []
        for item in items:
            if external:
                url = item["url"]
                parsed = urlparse(url)
                if (not url.startswith("https://") or parsed.hostname not in {"www.tokenforest.com.au", "tokenforest.com.au"}
                        or parsed.username or parsed.password):
                    raise ValueError(f"Unauthorised external URL on {slug}: {url}")
                rendered.append(f'<a class="btn btn-accent" href="{e(url)}" rel="noopener">{e(item["label"])}</a>')
            elif registry.get(item["slug"], {}).get("status") == "live":
                rendered.append(f'<a class="text-link" href="{home}{e(item["slug"])}/">{e(item["label"])}</a>')
        return '<p>' + ' · '.join(rendered) + '</p>' if rendered else ""

    def body(item):
        if isinstance(item, str):
            return f'<p>{e(item)}</p>'
        if not isinstance(item, dict):
            raise ValueError(f"Invalid editorial body on {slug}")
        if "img" in item:
            path = PurePosixPath(item["img"])
            if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] != "assets":
                raise ValueError(f"Invalid image path on {slug}")
            for key in ("width", "height"):
                if type(item[key]) is not int or item[key] <= 0:
                    raise ValueError(f"Invalid image {key} on {slug}")
            caption = f'<figcaption>{e(item["caption"])}</figcaption>' if item.get("caption") else ""
            return (f'<figure><img class="ev-concept-image" src="{prefix}{e(item["img"])}" alt="{e(item["alt"])}" '
                    f'width="{item["width"]}" height="{item["height"]}" loading="lazy" decoding="async">{caption}</figure>')
        if "links" in item:
            return links(item["links"])
        if "external" in item:
            return links(item["external"], external=True)
        raise ValueError(f"Unknown editorial body node on {slug}")

    ids = [s["id"] for s in page["sections"]]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", sid) for sid in ids):
        raise ValueError(f"Invalid or duplicate editorial section id on {slug}")
    sections = "".join(
        f'<section class="editorial-section" id="{e(s["id"])}"><h2>{e(s["title"])}</h2>'
        + "".join(body(p) for p in s["body"]) + '</section>' for s in page["sections"])
    new_page = registry[slug]["source"].partition("#")[0] != "pages.json"
    updated = registry[slug]["content_updated"] if new_page else page.get("updated")
    date_line = (f'<p class="editorial-date">{"最后更新" if lang == "zh" and new_page else "更新日期" if lang == "zh" else "Last updated"}: {e(updated)}</p>' if updated else "")
    related_links = links(page.get("related", []))
    related = (f'<section class="editorial-section"><h2>{"相关页面" if lang == "zh" else "Related pages"}</h2>{related_links}</section>' if related_links else "")
    description = page.get("description", page["intro"])
    form_note = ""
    if slug == "privacy":
        form_note = '<p class="editorial-note">' + e(page["form_live"] if studio.get("forms_enabled") else page["form_pending"]) + '</p>'
    return f'''<!doctype html>
<html lang="{LANGS[lang]['html_lang']}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(description)}">
<meta name="robots" content="{robots_meta(site_url, live=live)}">
<meta name="theme-color" content="#F3EFE7"><meta name="color-scheme" content="light">
<meta property="og:type" content="website"><meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">{extra}
{json_ld(studio, slug, lang, registry, page['title'], description, live=live)}
<link rel="icon" href="{prefix}favicon.svg?v={asset_v['favicon']}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}&display=swap"><link rel="stylesheet" href="{prefix}assets/hub.css?v={asset_v['css']}">
</head><body class="editorial-page">
<a class="skip" href="#main">{e(content['skip'])}</a>{header}
<main id="main" class="wrap editorial">
  <div class="editorial-head"><p class="eyebrow">{e(page['eyebrow'])}</p><h1>{e(page['title'])}</h1>
    <p class="lede">{e(page['intro'])}</p>{'' if new_page else date_line}{form_note}</div>
  <div class="editorial-layout"><nav class="editorial-index" aria-label="{'本页内容' if lang == 'zh' else 'On this page'}"><p class="eyebrow">{'本页内容' if lang == 'zh' else 'On this page'}</p><ol>{contents}</ol></nav>
    <div class="editorial-body">{sections}{related}
      <div class="editorial-contact"><h2>{e(page['contact_title'])}</h2><p>{e(page['contact_body'])}</p>
        <a class="text-link" href="mailto:{e(studio['email'])}">{e(studio['email'])}</a>
        <p><a class="btn btn-ink" href="{home}#contact">{e(content['nav']['cta'])} →</a></p>
      </div>{chr(10) + '      ' + date_line if new_page else ''}
    </div>
  </div>
</main>{footer}</body></html>'''
