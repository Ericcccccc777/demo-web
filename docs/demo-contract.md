# Demo contract — every drawer in the box

This is the build contract for the 108 demos in `site/demos/`. Each demo's individual brief is in `src/demos.json`.

## What a demo is

A small, complete, **working** website for a *fictional* Australian small business or individual. Each one proves a
different visual language, a different layout and one signature interaction, so that a real owner of that kind of
business can open it and think "I want mine to feel like this". It is not a poster and not a gimmick page: a visitor
must be able to understand the business, browse real-feeling content and use the interaction.

The hub opens demos inside an iframe (desktop, tablet 834×1112 and phone 390×844 frames) and also links to them
directly, so each demo must work in both situations.

## Files and dependencies

- One folder per demo: `site/demos/NNN-slug/index.html`. Put CSS in `<style>` and JS in `<script>` inside that file.
  Extra files only if genuinely needed, inside the same folder.
- **Zero dependencies.** No JS/CSS libraries, CDNs, npm, frameworks, icon fonts or remote images. Everything visual is
  drawn by you with HTML/CSS, inline SVG, Canvas 2D or raw WebGL. No stock photos, no hotlinked images, no emoji as the
  main imagery (small, intentional emoji use in a playful demo is fine).
- **Fonts:** Google Fonts only (`fonts.googleapis.com` / `fonts.gstatic.com`), at most **2 families**, only the weights
  you use, `&display=swap`, with `preconnect`. Always give a sensible fallback stack. Chinese text may use Noto Serif SC /
  Noto Sans SC / ZCOOL / Ma Shan Zheng; Arabic may use Noto Naskh Arabic / Cairo / Tajawal (counts toward the 2).
- Budget: aim for ≤ 70 KB for `index.html` (hard ceiling 120 KB). Canvas backing store = CSS size × min(devicePixelRatio, 2).

## Required `<head>`

```html
<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="demo:id" content="NNN">
<meta name="demo:brand" content="Exact Business Name">
<title>Exact Business Name — short descriptor</title>
<meta name="description" content="One honest sentence about the fictional business.">
<meta name="theme-color" content="#......">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=...&display=swap" rel="stylesheet">
<script src="../_kit/kit.js" defer></script>
<style>/* ... */</style>
</head>
```

## The shared kit (`../_kit/kit.js`, already written — do not edit it)

- **Try it on (brand rename).** Put `data-brand` on every element whose *entire text* is the business name (logo word
  mark, footer name, big title name, etc.). Keep those elements plain text (no child elements); style them from the
  outside. At least 2 such elements. The hub can replace the name with the visitor's own business name (up to 32
  characters, e.g. `Rosie's Bakery & Catering Co.`): **your layout must survive that** — allow wrapping
  (`overflow-wrap:anywhere` where needed), no fixed-width boxes that clip it, no text measured once and cached.
  Optional `data-brand-initials` on a monogram element gets the initials. If you draw the name on a canvas, listen for
  `window.addEventListener('hd:brandchange', e => redraw(e.detail.name))` and read `DemoKit.brand`.
- **Honest demo states.** The kit intercepts un-handled form submits, `tel:` / `mailto:` / `sms:` links and external
  links and shows a small "DEMO" toast. If you build your own booking/order/enquiry flow, finish it with a clear demo
  state and call `DemoKit.toast("…")` — e.g. "Demo only — no booking was made." Never show "Booked!", "Order placed",
  "Payment received" as if real.
- `DemoKit.reducedMotion`, `DemoKit.inFrame` (also `html.hd-in-frame` class) are available after the script runs
  (it is `defer`, so use them inside `DOMContentLoaded` or later, and guard with `window.DemoKit &&`).
- If a key handler in your demo uses **Escape**, call `e.preventDefault()` so the hub does not also close the viewer.
- The kit adds a small "Concept demo" badge at the bottom-left on standalone visits. If that would cover an important
  control (e.g. a fixed bottom-left button), set `<meta name="demo:badge" content="bottom-right">` (or `top-left`,
  `top-right`).

## Honesty rules (non-negotiable)

- The business is fictional. Invent a plausible business with specific, useful content (menu items, services, hours,
  suburbs, class names, what's included) — but **no** fake awards, "#1 in Sydney", star ratings, review counts, client
  logos, licence/accreditation numbers, years-in-business claims presented as fact, or real-looking testimonials. If
  the design genuinely needs a review block, label it visibly "Sample review" and use first name + suburb only.
- Prices may appear where a real site would show them (menus, lesson packages) — keep them plausible for Australia in
  AUD, and include a small "Sample prices" note somewhere on the page.
- Contact details: phone numbers only from the ACMA fictional ranges — mobiles `0491 570 156`, `0491 570 157`,
  `0491 570 158`, `0491 570 159`, `0491 570 110`; landlines `(02) 5550 xxxx`, `(03) 5550 xxxx`, `(07) 5550 xxxx`,
  `(08) 5550 xxxx`. Emails `@example.com`. Addresses: suburb + city/state only, never a street number.
- No real brands, logos, trademarks, products, celebrities or real people. Payment/booking platforms are not named.
- Health, legal, finance, migration, tax, fitness and childcare demos: add a one-line "general information only"
  note, no outcome promises ("guaranteed", "pain-free", "approved"). Any figures from calculators are labelled
  "illustrative". Counselling/mental-health content may include Lifeline 13 11 14 (real, public).
- Culture: do not imitate Aboriginal and Torres Strait Islander art styles or use sacred sites as decoration. Chinese,
  Japanese, Korean, Vietnamese and Arabic references must be respectful and correct (no fake characters, no
  mirrored/garbled script). If unsure of a word, leave it out.
- Language: Australian English (colour, centre, organise, favourite, metres, "arvo" only where the voice is casual),
  AUD, dates as `Sat 4 Oct`, 24h or am/pm consistently. Bilingual demos: every visible string exists in both languages
  (toggle button with `lang` attributes updated), no machine-translation gibberish.

## Quality bar (what reviewers will check in real screenshots)

1. **Distinct.** Follow your brief's style, layout and interaction. Do not fall back to the generic
   "nav + hero + three cards + testimonial + footer" skeleton unless the brief asks. Typography, colour, spacing,
   shapes and motion should all belong to the same idea. It should look like a different studio could have made it
   compared with the other demos — but equally polished.
2. **Complete.** 4–8 meaningful sections or states with specific copy (no lorem ipsum, no "Lorem", no "Your text
   here"). Real-feeling details: opening hours, service areas, what's included, FAQs where natural.
3. **The signature interaction works** with mouse, touch and keyboard: real `<button>`s / inputs / `<a href>`, visible
   `:focus-visible` styles, `aria-pressed` / `aria-expanded` / `aria-live` where state changes. Result text is in the
   DOM (not only on a canvas). It should feel delightful and be understandable without instructions (add a short hint).
4. **Responsive by design, not by shrinking.** Must look intentional at **390×844** and **1440×900**, and not break at
   320, 768, 1024. No unexpected horizontal page scroll. Intentionally horizontal layouts: convert vertical wheel to
   horizontal movement on desktop and provide a natural touch/vertical fallback on phones. Tap targets ≥ 40px on phones.
   Fixed bars must not cover content (add padding) and must respect `env(safe-area-inset-*)`.
5. **Motion with manners.** `@media (prefers-reduced-motion: reduce)`: all content visible, no continuous loops, no
   parallax. Stop `requestAnimationFrame` loops when the canvas is off-screen (`IntersectionObserver`) or the tab is
   hidden. Never flash more than 3 times per second.
6. **Sound** only after a user gesture, off by default, with a clear mute/stop control (WebAudio synthesis only — no
   audio files).
7. **Accessibility basics.** One `<h1>`. `header` / `main` / `footer` landmarks (or a sensible equivalent). Decorative
   SVG `aria-hidden="true"`; meaningful graphics have a text equivalent. Body text contrast ≥ 4.5:1, large text ≥ 3:1.
   Inputs have labels. Don't rely on hover alone.
8. **Robust.** No console errors. No `alert` / `confirm` / `prompt`. `localStorage` optional and wrapped in `try/catch`.
   Works from `http://` inside an iframe and standalone. Don't read `window.top`. No external links that would leave
   the demo (use `#` anchors or kit-intercepted links).

## `meta.json` (write one per demo, next to `index.html`)

This is the "feature truth" the hub displays, so it must describe what you actually built:

```json
{
  "id": "NNN",
  "tech": ["Canvas 2D", "SVG", "Pointer Events"],
  "features": ["booking"],
  "interaction": "One sentence describing what the visitor can do, as built.",
  "fonts": ["Fraunces", "Inter"],
  "notes": "Anything not finished or intentionally simplified (empty string if none)."
}
```

`tech` vocabulary (use only what you really used): `CSS Grid`, `CSS 3D`, `CSS Scroll Snap`, `Scroll-driven`, `SVG`,
`SVG animation`, `Canvas 2D`, `WebGL`, `Web Audio`, `Pointer Events`, `Drag & drop`, `IntersectionObserver`,
`View Transitions`, `Keyboard shortcuts`, `RTL layout`, `Bilingual toggle`, `Generative art`, `Physics`, `Form logic`,
`Date logic`, `Clipboard`.
`features` vocabulary (what a real business would recognise): `booking`, `ordering`, `quote`, `customiser`, `map`,
`game`, `story`, `sound`, `bilingual`, `accessibility`.

## Self-check before you hand back (required)

From the project root run, for your ids:

```bash
node tools/qa.mjs --ids 019,031 --out evidence/qa-agents
```

It prints ✓/✗ per viewport and writes screenshots (`evidence/qa-agents/NNN-390x844.jpg`, `-1440x900.jpg`,
`-390x844-brand.jpg` with the long test name). **Open the screenshots with your image-reading tool and look at them.**
Fix every ✗ and anything that looks broken, cramped, empty, clipped or generic. To check a state after an interaction:
`--eval "document.querySelector('#start').click()" --label started`. For reduced motion: `--reduced`.

## Boundaries

- Only create/modify files inside your assigned `site/demos/NNN-slug/` folders (and your report). Do not edit the kit,
  the tools, other demos, or project documents.
- No network access other than what a page itself loads from Google Fonts during QA. No installs, no git commits.

## Lean self-check (same quality bar, less repetition)

Check smart rather than often:

- Design and write the demo completely first, then run QA once: `node tools/qa.mjs --ids NNN --out evidence/qa-agents`.
- Look at exactly these images: `NNN-1440x900.jpg`, `NNN-390x844.jpg`, `NNN-390x844-brand.jpg`, plus ONE screenshot of the signature interaction's result state (`--eval ... --label state`). Use `--full` only when a specific lower section needs checking, never routinely.
- Fix what is actually wrong, re-run once, look again. Stop polishing after two rounds unless something is broken.
- A phone screenshot with the top of the page repeated is a load artefact — re-run it before touching code.
