#!/usr/bin/env python3
"""Check production and preview SEO in a disposable copy; Python 3.9+, no dependencies."""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "https://emvalue.com.au"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
FORBIDDEN = {"LocalBusiness", "FAQPage", "AggregateRating", "Review", "Person", "Event", "Product"}
HARD_CLAIMS = re.compile(
    r"award[- ]winning|number one|#1\b|voted best|"
    r"best in (?:sydney|melbourne|brisbane|perth|adelaide|hobart|australia)\b|"
    r"top[- ]rated|rated \d|★{3,}|google reviews|trustpilot|"
    r"guarantee[sd]? (?:rankings?|results|first page|page one)\b|"
    r"排名第一|全澳第一|最便宜|包上首页|保证.{0,4}(?:排名|首页|效果)", re.I)
SOFT_CLAIMS = re.compile(r"\bbest\b|cheapest|lowest|guarantee|第一|最|保证", re.I)
PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.raw = path.read_text(encoding="utf-8")
        self.stack = []
        self.tags = []
        self.ids = set()
        self.text = []
        self.main_text = []
        self.title = []
        self.json_ld = []
        self.script_text = []
        self.feed(self.raw)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "script":
            self.script_text = []
        if tag not in VOID:
            self.stack.append((tag, attrs))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                if tag == "script" and self.stack[i][1].get("type", "").lower() == "application/ld+json":
                    self.json_ld.append("".join(self.script_text))
                del self.stack[i:]
                break

    def handle_data(self, data):
        names = [tag for tag, _ in self.stack]
        if "script" in names:
            self.script_text.append(data)
            return
        if "title" in names:
            self.title.append(data)
        if any(tag in {"head", "style", "template"} or "hidden" in attrs or
               attrs.get("aria-hidden") == "true" for tag, attrs in self.stack):
            return
        self.text.append(data)
        # Language controls are intentionally bilingual; they are not page copy.
        if "main" in names and not any("hreflang" in attrs or
                "brand" in attrs.get("class", "").split() for _, attrs in self.stack):
            self.main_text.append(data)

    def select(self, tag, **attrs):
        return [a for t, a in self.tags if t == tag and all(a.get(k) == v for k, v in attrs.items())]


class Report:
    def __init__(self):
        self.counts = defaultdict(lambda: [0, 0, 0])
        self.details = []

    def check(self, code, good, detail):
        self.counts[code][0 if good else 1] += 1
        if not good:
            self.details.append(("FAIL", code, detail))

    def warn(self, code, detail):
        self.counts[code][2] += 1
        self.details.append(("WARN", code, detail))

    def show(self):
        for code in ("BUILD", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "W7", "F8", "F9", "F9S", "F10", "F11", "F12", "W12", "F13", "W14", "PREVIEW", "WORKTREE"):
            passed, failed, warned = self.counts[code]
            print(f"{code}: PASS={passed} FAIL={failed} WARN={warned}")
        for level, code, detail in self.details:
            print(f"{level} {code}: {detail}")
        totals = [sum(v[i] for v in self.counts.values()) for i in range(3)]
        print(f"SUMMARY: PASS={totals[0]} FAIL={totals[1]} WARN={totals[2]}")
        return 1 if totals[1] else 0


def page_url(path, site):
    relative = path.relative_to(site).as_posix()
    return DOMAIN + "/" + (relative[:-10] if relative.endswith("index.html") else relative)


def page_slug(path, site):
    relative = path.relative_to(site).as_posix()
    if relative.startswith("zh/"):
        relative = relative[3:]
    return relative[:-10].rstrip("/") if relative.endswith("index.html") else relative


def main_pages(site):
    return {p: Page(p) for p in sorted(site.rglob("*.html"))
            if p.relative_to(site).parts[0] != "demos"}


def local_target(url, source, site):
    resolved = urlsplit(urljoin(page_url(source, site), url))
    if (resolved.scheme, resolved.netloc) != ("https", "emvalue.com.au"):
        return None, ""
    target = (site / unquote(resolved.path).lstrip("/")).resolve()
    if site.resolve() not in (target, *target.parents):
        return None, ""
    if resolved.path.endswith("/") or target.is_dir():
        target /= "index.html"
    return target, unquote(resolved.fragment)


def walk_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_json(child)


def is_negated(text, start):
    if any(word in text[max(0, start - 6):start] for word in ("不", "无法", "不能", "没有", "不会")):
        return True
    words = re.findall(r"[a-z]+(?:['’][a-z]+)?", text[:start].lower())[-3:]
    return bool(set(words) & {"no", "not", "never", "can't", "cannot", "don't", "won't", "can’t", "don’t", "won’t"})


def check_structure(values, slug, label, registry, report):
    """F9S: require the page's graph, rather than merely accepting valid JSON."""
    nodes = []
    allowed = {"Organization", "WebSite", "Service", "BreadcrumbList", "Article"}
    for value in values:
        graph = value.get("@graph") if isinstance(value, dict) else None
        valid = isinstance(graph, list) and all(isinstance(node, dict) and
                    isinstance(node.get("@type"), str) and node["@type"] in allowed for node in graph)
        report.check("F9S", valid, f"{label}: JSON-LD needs an @graph with allowed top-level types")
        if valid:
            nodes.extend(graph)
    grouped = defaultdict(list)
    for node in nodes:
        grouped[node["@type"]].append(node)
    if slug == "":
        report.check("F9S", len(grouped["Organization"]) == 1 and len(grouped["WebSite"]) == 1,
                     f"{label}: homepage needs one Organization and one WebSite")
    else:
        report.check("F9S", len(grouped["BreadcrumbList"]) == 1,
                     f"{label}: non-home page needs one BreadcrumbList")
        report.check("F9S", not grouped["Organization"], f"{label}: reference Organization without redeclaring it")
    for breadcrumb in grouped["BreadcrumbList"]:
        items = breadcrumb.get("itemListElement")
        report.check("F9S", isinstance(items, list) and bool(items) and all(
            isinstance(item, dict) and item.get("@type") == "ListItem" and
            type(item.get("position")) is int and item["position"] == position
            for position, item in enumerate(items, 1)), f"{label}: breadcrumb positions must start at 1 and be continuous")
    if registry.get(slug, {}).get("type") in {"service", "industry"}:
        report.check("F9S", len(grouped["Service"]) == 1, f"{label}: registered service needs one Service")
    for service in grouped["Service"]:
        provider = service.get("provider")
        report.check("F9S", isinstance(provider, dict) and provider.get("@id") == DOMAIN + "/#organization",
                     f"{label}: Service provider must reference the Organization @id")
        report.check("F9S", bool(service.get("areaServed")), f"{label}: Service needs areaServed")
        if slug == "services/xiaohongshu":
            report.check("F9S", service.get("areaServed") == {"@type": "City", "name": "Melbourne"},
                         f"{label}: Xiaohongshu areaServed must be City Melbourne")
    for value in values:
        for node in walk_json(value):
            if "offers" in node:
                report.check("F9S", slug == "services/web-design", f"{label}: offers allowed only on services/web-design")


def check_links(page, pages, registry, site, report):
    references = []
    for tag, attrs in page.tags:
        if tag == "a" and attrs.get("href"):
            references.append((attrs["href"], True))
        if tag == "link" and attrs.get("rel") in {"stylesheet", "icon", "preload"}:
            references.append((attrs.get("href", ""), False))
        if tag in {"img", "script", "source", "video", "audio", "iframe", "embed", "input"} and attrs.get("src"):
            references.append((attrs["src"], False))
        if attrs.get("poster"):
            references.append((attrs["poster"], False))
        if attrs.get("srcset") and not attrs["srcset"].startswith("data:"):
            references.extend((item.strip().split()[0], False) for item in attrs["srcset"].split(",") if item.strip())
        references.extend((match[1], False) for match in re.findall(r"url\(\s*(['\"]?)(.*?)\1\s*\)", attrs.get("style", "")))
    label = page.path.relative_to(site).as_posix()
    source_live = registry.get(page_slug(page.path, site), {}).get("status", "live") == "live"
    for url, is_link in references:
        target, anchor = local_target(url, page.path, site)
        if target is None:
            continue
        exists = target.is_file()
        report.check("F13", exists, f"{label}: missing target {url}")
        if not exists or not is_link:
            continue
        if anchor and anchor != "top":
            target_page = pages.get(target)
            if target_page is None and target.suffix == ".html":
                target_page = Page(target)
                pages[target] = target_page
            report.check("F13", target_page is not None and anchor in target_page.ids,
                         f"{label}: missing anchor {url}")
        if target in pages and target.relative_to(site).parts[0] != "demos" and source_live:
            report.check("F13", registry.get(page_slug(target, site), {}).get("status", "live") == "live",
                         f"{label}: live page links to draft {url}")


def check_sitemap(site, pages, registry, report):
    if registry is None:
        report.warn("F10", "SKIP: src/site_pages.json does not exist yet (before WP-03).")
        return
    path = site / "sitemap.xml"
    report.check("F10", path.is_file(), "production sitemap.xml is missing")
    if not path.is_file():
        return
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        report.check("F10", False, f"invalid sitemap XML: {exc}")
        return
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "x": "http://www.w3.org/1999/xhtml"}
    found = []
    for entry in root.findall("s:url", ns):
        url = entry.findtext("s:loc", "", ns)
        found.append(url)
        target, _ = local_target(url, site / "index.html", site)
        record = registry.get(page_slug(target, site)) if target else None
        report.check("F10", target in pages and record is not None and record["status"] == "live" and "/demos/" not in url,
                     f"sitemap loc is not an existing live main page: {url}")
        if record:
            report.check("F10", entry.findtext("s:lastmod", "", ns) == record.get("content_updated"),
                         f"{url}: lastmod differs from registry")
            en = DOMAIN + "/" + (record["slug"] + "/" if record["slug"] else "")
            zh = DOMAIN + "/zh/" + (record["slug"] + "/" if record["slug"] else "")
            links = entry.findall("x:link", ns)
            report.check("F10", len(links) == 3 and {link.get("hreflang"): link.get("href") for link in links} ==
                         {"en-AU": en, "zh-Hans": zh, "x-default": en} and all(link.get("rel") == "alternate" for link in links),
                         f"{url}: sitemap alternates must include en-AU, zh-Hans and x-default")
    expected = {DOMAIN + prefix + (p["slug"] + "/" if p["slug"] else "")
                for p in registry.values() if p["status"] == "live" for prefix in ("/", "/zh/")}
    report.check("F10", set(found) == expected and len(found) == len(expected), "sitemap must contain every live language URL exactly once")


def check_production(site, registry, legacy, report):
    pages = main_pages(site)
    records = registry or {}
    chinese_code = "zh-CN" if legacy else "zh-Hans"
    for path, page in list(pages.items()):
        label = path.relative_to(site).as_posix()
        zh = label.startswith("zh/")
        is_404 = label == "404.html"
        live = not is_404 and records.get(page_slug(path, site), {}).get("status", "live") == "live"
        robots = page.select("meta", name="robots")
        report.check("F1", len(robots) == 1 and (robots[0].get("content") == "index, follow" if live else
                     "noindex" in robots[0].get("content", "").split(", ")), f"{label}: incorrect robots meta")
        canonicals = [a for t, a in page.tags if t == "link" and "canonical" in a.get("rel", "").split()]
        report.check("F2", len(canonicals) == 1 and canonicals[0].get("href") == page_url(path, site) if live else not canonicals,
                     f"{label}: canonical must equal its own absolute URL on live pages only")
        alternates = page.select("link", rel="alternate")
        if live:
            slug = page_slug(path, site)
            en = DOMAIN + "/" + (slug + "/" if slug else "")
            zh_url = DOMAIN + "/zh/" + (slug + "/" if slug else "")
            expected = {"en-AU": en, chinese_code: zh_url, "x-default": en}
            actual = {a.get("hreflang"): a.get("href") for a in alternates}
            # Legacy mode accepts either Chinese code, without accepting duplicates.
            if legacy and "zh-Hans" in actual:
                expected = {"en-AU": en, "zh-Hans": zh_url, "x-default": en}
            report.check("F3", len(alternates) == 3 and actual == expected, f"{label}: wrong or missing hreflang trio")
            for code, url in actual.items():
                target, _ = local_target(url or "", path, site)
                report.check("F3", target in pages, f"{label}: hreflang target missing: {url}")
                if target in pages and code != "x-default":
                    reciprocal = {a.get("hreflang"): a.get("href") for a in pages[target].select("link", rel="alternate")}
                    self_code = chinese_code if zh else "en-AU"
                    if legacy and zh and "zh-Hans" in reciprocal:
                        self_code = "zh-Hans"
                    report.check("F3", reciprocal.get(self_code) == page_url(path, site), f"{label}: hreflang target does not link back: {url}")
        else:
            report.check("F3", not alternates, f"{label}: non-live page has hreflang")
        html_tags = page.select("html")
        allowed = {"zh-Hans", "zh-CN"} if zh and legacy else {"zh-Hans" if zh else "en-AU"}
        report.check("F4", len(html_tags) == 1 and html_tags[0].get("lang") in allowed, f"{label}: html lang does not match path")
        report.check("F5", "zh-TW" not in page.raw and (legacy or "zh-CN" not in page.raw), f"{label}: legacy Chinese language code")
        report.check("F6", len(page.select("h1")) == 1, f"{label}: must contain exactly one h1")
        title = "".join(page.title).strip()
        descriptions = page.select("meta", name="description")
        description = descriptions[0].get("content", "").strip() if len(descriptions) == 1 else ""
        report.check("F7", bool(title) and (is_404 or bool(description)), f"{label}: missing title or description")
        if len(title) > (30 if zh else 60):
            report.warn("W7", f"{label}: title length {len(title)}")
        if not is_404 and not ((25 if zh else 50) <= len(description) <= (85 if zh else 170)):
            report.warn("W7", f"{label}: description length {len(description)}")
        attribute_text = " ".join(str(v) for _, attrs in page.tags for v in attrs.values() if v is not None)
        placeholders = PLACEHOLDER.findall(" ".join(page.text + page.title + page.json_ld) + " " + attribute_text)
        report.check("F8", not placeholders, f"{label}: unresolved placeholders {sorted(set(placeholders))}")
        report.check("F9", live or not page.json_ld, f"{label}: non-live page contains JSON-LD")
        structured = []
        for script in page.json_ld:
            try:
                value = json.loads(script)
            except ValueError as exc:
                report.check("F9", False, f"{label}: invalid JSON-LD: {exc}")
                continue
            report.check("F9", True, "")
            structured.append(value)
            for node in walk_json(value):
                types = node.get("@type", [])
                types = [types] if isinstance(types, str) else types
                report.check("F9", isinstance(types, list) and not (set(types) & FORBIDDEN), f"{label}: forbidden JSON-LD type {types}")
                if isinstance(types, list) and "Organization" in types:
                    report.check("F9", node.get("@id") == DOMAIN + "/#organization", f"{label}: inconsistent Organization @id")
        if live:
            check_structure(structured, page_slug(path, site), label, records, report)
        if not is_404:
            letters = [char for char in " ".join(page.main_text) if char.isalpha()]
            chinese = sum("\u4e00" <= char <= "\u9fff" for char in letters)
            ratio = chinese / len(letters) if letters else 0
            report.check("F11", ratio >= 0.3 if zh else ratio <= 0.05, f"{label}: Chinese ratio {ratio:.3f} outside threshold")
        visible = re.sub(r"\s+", " ", " ".join(page.text + [title, description])).strip()
        claims = [m for m in HARD_CLAIMS.finditer(visible) if not is_negated(visible, m.start())]
        report.check("F12", not claims, f"{label}: prohibited claims {[m.group() for m in claims]}")
        for match in SOFT_CLAIMS.finditer(visible):
            report.warn("W12", f"{label}: {visible[max(0, match.start() - 35):match.end() + 55]}")
        check_links(page, pages, records, site, report)
        for image in page.select("img"):
            missing = [key for key in ("width", "height", "alt") if key not in image]
            if missing:
                report.warn("W14", f"{label}: image {image.get('src', '')} missing {', '.join(missing)}")
    sitemap = site / "sitemap.xml"
    if sitemap.is_file():
        raw = sitemap.read_text(encoding="utf-8")
        report.check("F5", "zh-TW" not in raw and (legacy or "zh-CN" not in raw), "sitemap.xml: legacy Chinese language code")
    check_sitemap(site, pages, registry, report)
    robots = site / "robots.txt"
    report.check("F1", robots.is_file() and "Allow: /" in robots.read_text() and "Disallow: /" not in robots.read_text(), "production robots.txt must allow crawling")
    print(f"Production: {len(main_pages(site))} main HTML files (including 404).")


def build(root, production, report):
    env = os.environ.copy()
    env.pop("EMVALUE_FORMS_ENABLED", None)
    env.pop("EMVALUE_SITE_URL", None)
    if production:
        env["EMVALUE_SITE_URL"] = DOMAIN
    result = subprocess.run([sys.executable, str(root / "tools/build.py")], cwd=root,
                            env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    label = "production" if production else "preview"
    report.check("BUILD", result.returncode == 0, f"{label} build exited {result.returncode}: {result.stdout.strip()}")
    print(f"{label.capitalize()} build: exit {result.returncode}")
    return result.returncode == 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-legacy-lang", action="store_true", help="accept zh-CN until WP-02")
    parser.add_argument("--keep-temp", action="store_true", help="keep and print the disposable copy")
    args = parser.parse_args(argv)
    report = Report()
    robots = ROOT / "site/robots.txt"
    report.check("WORKTREE", robots.is_file() and "Disallow: /" in robots.read_text(),
                 "real worktree robots.txt must contain Disallow: /")
    report.check("WORKTREE", not (ROOT / "site/sitemap.xml").exists(),
                 "real worktree sitemap.xml must not exist")
    temp = Path(tempfile.mkdtemp(prefix="emvalue-seo-check-")).resolve()
    try:
        for name in ("src", "tools", "site"):
            shutil.copytree(ROOT / name, temp / name)
        if (ROOT / "netlify.toml").is_file():
            shutil.copy2(ROOT / "netlify.toml", temp / "netlify.toml")
        registry_path = temp / "src/site_pages.json"
        registry = None
        if registry_path.is_file():
            entries = json.loads(registry_path.read_text(encoding="utf-8"))["pages"]
            registry = {entry["slug"]: entry for entry in entries}
        if build(temp, True, report):
            check_production(temp / "site", registry, args.allow_legacy_lang, report)
        else:
            return report.show()
        if build(temp, False, report):
            site = temp / "site"
            robots = site / "robots.txt"
            report.check("PREVIEW", robots.is_file() and "Disallow: /" in robots.read_text(), "preview robots.txt must contain Disallow: /")
            report.check("PREVIEW", not (site / "sitemap.xml").exists(), "preview sitemap.xml must not exist")
            for path, page in main_pages(site).items():
                meta = page.select("meta", name="robots")
                report.check("PREVIEW", len(meta) == 1 and "noindex" in meta[0].get("content", ""), f"{path.relative_to(site)}: preview missing noindex")
                report.check("PREVIEW", not page.select("link", rel="canonical") and not page.select("link", rel="alternate") and not page.json_ld,
                             f"{path.relative_to(site)}: preview contains production SEO tags")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        report.check("BUILD", False, f"check could not complete: {exc}")
    finally:
        if args.keep_temp:
            print(f"Temporary copy kept: {temp}")
        else:
            shutil.rmtree(temp)
    return report.show()


if __name__ == "__main__":
    sys.exit(main())
