"""Shared language, URL and SEO markup for the static main site."""
import html
import json

LANGS = {
    "en": {"html_lang": "en-AU", "hreflang": "en-AU", "prefix": "/"},
    "zh": {"html_lang": "zh-Hans", "hreflang": "zh-Hans", "prefix": "/zh/"},
}

ENTITY_DESCRIPTION = (
    "emvalue is a two-person web studio in Australia. We design and build websites, apps and "
    "business tools for small businesses, in English and Chinese, and run Xiaohongshu creator "
    "campaigns in Melbourne."
)


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


def breadcrumb_node(site_url, slug, lang, registry, name):
    trail = []
    current = slug
    while current:
        trail.append(current)
        current = registry[current]["parent"]
    trail = [""] + list(reversed(trail))
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i,
             "name": name if key == "" else registry[key]["breadcrumb"][lang],
             "item": site_url + page_path(key, lang)}
            for i, key in enumerate(trail, 1)
        ],
    }


def json_ld(studio, slug, lang, registry, title="", description="", live=True):
    """Emit only facts and page types authorised for the current registered pages."""
    site_url = (studio.get("site_url") or "").rstrip("/")
    if not site_url or not live or registry[slug]["status"] != "live":
        return ""
    organization_id = site_url + "/#organization"
    if slug == "":
        organization = {
            "@type": "Organization", "@id": organization_id,
            "name": studio["name"], "url": site_url + "/",
            "logo": site_url + "/assets/brand/emvalue-wordmark-498.png",
            "image": site_url + "/assets/emvalue-social.png",
            "email": studio["email"], "description": ENTITY_DESCRIPTION,
            "areaServed": {"@type": "Country", "name": "Australia"},
            "knowsLanguage": ["en", LANGS["zh"]["html_lang"]],
        }
        profiles = [studio[key] for key in ("linkedin", "xiaohongshu", "instagram") if studio.get(key)]
        if profiles:
            organization["sameAs"] = profiles
        graph = [organization, {
            "@type": "WebSite", "@id": site_url + "/#website", "url": site_url + "/",
            "name": studio["name"], "inLanguage": [config["html_lang"] for config in LANGS.values()],
            "publisher": {"@id": organization_id},
        }]
    else:
        record = registry[slug]
        graph = []
        if record["type"] in {"service", "industry"}:
            graph.append({
                "@type": "Service", "@id": site_url + page_path(slug, lang) + "#service",
                "name": title, "serviceType": record["service_type"], "description": description,
                "provider": {"@id": organization_id}, "areaServed": record["area_served"],
                "url": site_url + page_path(slug, lang),
            })
        graph.append(breadcrumb_node(site_url, slug, lang, registry, studio["name"]))
    data = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False).replace("</", "<\\/")
    return '<script type="application/ld+json">' + data + '</script>'
