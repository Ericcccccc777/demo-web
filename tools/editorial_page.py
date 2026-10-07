"""Shared, bilingual studio and policy pages."""
import html
from seo import LANGS, head_links, robots_meta


def render_editorial(lang, slug, studio, content, page, asset_v, header, footer):
    e = lambda value: html.escape(str(value), quote=True)
    prefix = "../../" if lang == "zh" else "../"
    title = page["title"] + " — " + studio["name"]
    site_url = (studio.get("site_url") or "").rstrip("/")
    extra = head_links(site_url, slug, lang)
    fonts = ("https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700"
             "&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500")
    if lang == "zh":
        fonts += "&family=Noto+Serif+SC:wght@500;700"
    contents = "".join(f'<li><a href="#{e(s["id"])}">{e(s["title"])}</a></li>' for s in page["sections"])
    sections = "".join(
        f'<section class="editorial-section" id="{e(s["id"])}"><h2>{e(s["title"])}</h2>'
        + "".join(f'<p>{e(p)}</p>' for p in s["body"]) + '</section>' for s in page["sections"])
    date_line = (f'<p class="editorial-date">{"更新日期" if lang == "zh" else "Last updated"}: {e(page["updated"])}</p>'
                 if page.get("updated") else "")
    form_note = ""
    if slug == "privacy":
        form_note = '<p class="editorial-note">' + e(page["form_live"] if studio.get("forms_enabled") else page["form_pending"]) + '</p>'
    return f'''<!doctype html>
<html lang="{LANGS[lang]['html_lang']}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(page['intro'])}">
<meta name="robots" content="{robots_meta(site_url)}">
<meta name="theme-color" content="#F3EFE7"><meta name="color-scheme" content="light">
<meta property="og:type" content="website"><meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(page['intro'])}">{extra}
<link rel="icon" href="{prefix}favicon.svg?v={asset_v['favicon']}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}&display=swap"><link rel="stylesheet" href="{prefix}assets/hub.css?v={asset_v['css']}">
</head><body class="editorial-page">
<a class="skip" href="#main">{e(content['skip'])}</a>{header}
<main id="main" class="wrap editorial">
  <div class="editorial-head"><p class="eyebrow">{e(page['eyebrow'])}</p><h1>{e(page['title'])}</h1>
    <p class="lede">{e(page['intro'])}</p>{date_line}{form_note}</div>
  <div class="editorial-layout"><nav class="editorial-index" aria-label="{'本页内容' if lang == 'zh' else 'On this page'}"><p class="eyebrow">{'本页内容' if lang == 'zh' else 'On this page'}</p><ol>{contents}</ol></nav>
    <div class="editorial-body">{sections}
      <div class="editorial-contact"><h2>{e(page['contact_title'])}</h2><p>{e(page['contact_body'])}</p>
        <a class="text-link" href="mailto:{e(studio['email'])}">{e(studio['email'])}</a>
        <p><a class="btn btn-ink" href="../#contact">{e(content['nav']['cta'])} →</a></p>
      </div>
    </div>
  </div>
</main>{footer}</body></html>'''
