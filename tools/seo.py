"""Shared language, URL and SEO markup for the static main site."""
import html

LANGS = {
    "en": {"html_lang": "en-AU", "hreflang": "en-AU", "prefix": "/"},
    "zh": {"html_lang": "zh-Hans", "hreflang": "zh-Hans", "prefix": "/zh/"},
}


def page_path(slug, lang):
    return LANGS[lang]["prefix"] + (slug + "/" if slug else "")


def other_lang(lang):
    return LANGS["en" if lang == "zh" else "zh"]["hreflang"]


def robots_meta(site_url, live=True):
    return "index, follow" if site_url and live else "noindex, nofollow"


def head_links(site_url, slug, lang, live=True):
    if not site_url or not live:
        return ""
    site_url = site_url.rstrip("/")
    e = lambda value: html.escape(str(value), quote=True)
    url = site_url + page_path(slug, lang)
    links = [f'<link rel="canonical" href="{e(url)}">']
    links.extend(f'<link rel="alternate" hreflang="{config["hreflang"]}" href="{e(site_url + page_path(slug, key))}">'
                 for key, config in LANGS.items())
    links.extend([
        f'<link rel="alternate" hreflang="x-default" href="{e(site_url + page_path(slug, "en"))}">',
        f'<meta property="og:url" content="{e(url)}">',
        f'<meta property="og:image" content="{e(site_url)}/assets/emvalue-social.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="emvalue — Websites, apps and digital tools">',
        '<meta name="twitter:card" content="summary_large_image">',
    ])
    return "\n".join(links)
