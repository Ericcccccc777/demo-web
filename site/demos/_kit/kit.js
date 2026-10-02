/* Demo kit — shared by every demo in the box.
 * - "Try it on": replaces [data-brand] text with a visitor's business name (from the hub viewer or ?brand=).
 * - Honest demo states: forms, tel:/mailto: and external links never pretend to work.
 * - Standalone visits get a small "concept demo" badge that links back to the box.
 * STUDIO and HUB are rewritten by tools/build.py from src/studio.json — do not edit by hand.
 */
(function () {
  "use strict";
  var STUDIO = "emvalue";
  var HUB = "../../index.html";
  var MAX = 32;

  var doc = document;
  var root = doc.documentElement;
  var inFrame = false;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  if (inFrame) root.classList.add("hd-in-frame");

  function meta(name) {
    var m = doc.querySelector('meta[name="' + name + '"]');
    return m ? m.getAttribute("content") || "" : "";
  }
  var demoId = meta("demo:id");
  var originalBrand = meta("demo:brand");
  var originalTitle = doc.title;
  var currentBrand = originalBrand;
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function clean(name) {
    if (typeof name !== "string") return "";
    return name.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX);
  }

  function initials(name) {
    var words = name.split(" ").filter(Boolean);
    var out = words.slice(0, 2).map(function (w) { return Array.from(w)[0] || ""; }).join("");
    return out.toUpperCase();
  }

  function setBrand(name) {
    var next = clean(name) || originalBrand;
    currentBrand = next;
    doc.querySelectorAll("[data-brand]").forEach(function (el) {
      if (!el.hasAttribute("data-brand-original")) el.setAttribute("data-brand-original", el.textContent);
      el.textContent = next === originalBrand ? el.getAttribute("data-brand-original") : next;
    });
    doc.querySelectorAll("[data-brand-initials]").forEach(function (el) {
      if (!el.hasAttribute("data-brand-original")) el.setAttribute("data-brand-original", el.textContent);
      el.textContent = next === originalBrand ? el.getAttribute("data-brand-original") : initials(next);
    });
    if (originalBrand && originalTitle.indexOf(originalBrand) !== -1) {
      doc.title = originalTitle.split(originalBrand).join(next);
    }
    try {
      window.dispatchEvent(new CustomEvent("hd:brandchange", { detail: { name: next, original: originalBrand } }));
    } catch (e) { /* old browsers */ }
    return next;
  }

  /* ---------- isolated UI (shadow DOM so demo CSS can't break it) ---------- */
  var host, shadow, toastEl, toastTimer;
  function ui() {
    if (shadow) return shadow;
    host = doc.createElement("div");
    host.setAttribute("data-hd-kit", "");
    host.style.cssText = "position:fixed;inset:auto;z-index:2147483646;";
    (doc.body || root).appendChild(host);
    shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var style = doc.createElement("style");
    style.textContent =
      ":host{all:initial}" +
      ".toast{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translate(-50%,16px);opacity:0;" +
      "width:max-content;max-width:min(92vw,460px);box-sizing:border-box;padding:11px 16px 11px 12px;border-radius:14px;background:rgba(18,17,14,.94);color:#f6f3ec;" +
      "font:500 14px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.28);display:flex;gap:10px;align-items:flex-start;" +
      "transition:opacity .22s ease,transform .22s ease;pointer-events:none;z-index:2147483647}" +
      ".toast.on{opacity:1;transform:translate(-50%,0)}" +
      ".toast.lift{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 52px)}" +
      ".tag{flex:none;font:700 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;background:#f6f3ec;color:#12110e;border-radius:6px;padding:4px 6px;margin-top:1px}" +
      ".badge{position:fixed;display:flex;align-items:center;gap:2px;box-sizing:border-box;max-width:calc(100vw - 24px);" +
      "font:500 12px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#17150f;background:rgba(251,249,244,.96);" +
      "border:1px solid rgba(23,21,15,.14);border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.14);padding:4px;z-index:2147483646}" +
      ".badge a,.badge button{all:unset;cursor:pointer;border-radius:999px;padding:7px 10px;white-space:nowrap}" +
      ".badge a:hover,.badge button:hover{background:rgba(23,21,15,.07)}" +
      ".badge a:focus-visible,.badge button:focus-visible{outline:2px solid #c4381a;outline-offset:1px}" +
      ".badge .dot{display:inline-block;width:7px;height:7px;border-radius:2px;background:#c4381a;margin-right:6px;transform:translateY(-1px)}" +
      ".badge .x{padding:7px 9px;color:#686256}" +
      "@media (prefers-reduced-motion:reduce){.toast{transition:none}}";
    shadow.appendChild(style);
    return shadow;
  }

  function toast(message, ms) {
    var s = ui();
    if (!toastEl) {
      toastEl = doc.createElement("div");
      toastEl.className = "toast" + (inFrame || meta("demo:badge") === "none" || (meta("demo:badge") || "").indexOf("top") === 0 ? "" : " lift");
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      var tag = doc.createElement("span");
      tag.className = "tag";
      tag.textContent = "DEMO";
      var text = doc.createElement("span");
      text.className = "msg";
      toastEl.appendChild(tag);
      toastEl.appendChild(text);
      s.appendChild(toastEl);
    }
    toastEl.querySelector(".msg").textContent = String(message || "This is a demo — nothing was sent.");
    // restart the transition so repeated toasts are noticed
    toastEl.classList.remove("on");
    void toastEl.offsetWidth;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, ms || 3400);
  }

  function badge() {
    if (inFrame || meta("demo:badge") === "none") return;
    var s = ui();
    var pos = meta("demo:badge") || "bottom-left";
    var el = doc.createElement("div");
    el.className = "badge";
    var v = pos.indexOf("top") === 0 ? "top:max(12px,env(safe-area-inset-top))" : "bottom:max(12px,env(safe-area-inset-bottom))";
    var h = pos.indexOf("right") !== -1 ? "right:12px" : "left:12px";
    el.setAttribute("style", v + ";" + h);
    var link = doc.createElement("a");
    link.href = HUB + (demoId ? "#demo-" + demoId : "");
    link.innerHTML = '<span class="dot" aria-hidden="true"></span>';
    link.appendChild(doc.createTextNode((root.lang.indexOf("zh") === 0 ? "概念作品 · " : "Concept design · ") + STUDIO));
    link.setAttribute("aria-label", "Concept demo for a fictional business, made by " + STUDIO + ". Back to the box.");
    var close = doc.createElement("button");
    close.className = "x";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Hide demo label");
    close.addEventListener("click", function () { el.remove(); });
    el.appendChild(link);
    el.appendChild(close);
    s.appendChild(el);
  }

  /* ---------- honest demo behaviour ---------- */
  doc.addEventListener("submit", function (e) {
    var form = e.target;
    if (e.defaultPrevented || (form && form.hasAttribute && form.hasAttribute("data-kit-ignore"))) return;
    e.preventDefault();
    toast((form && form.getAttribute("data-demo-message")) || "Demo only — nothing was sent. On a real site this would reach the business.");
  });

  doc.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || e.defaultPrevented || a.hasAttribute("data-kit-ignore")) return;
    var href = a.getAttribute("href") || "";
    if (/^(tel|sms|mailto):/i.test(href)) {
      e.preventDefault();
      toast("Contact details in demos are fictional — nothing was dialled or sent.");
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      try {
        if (new URL(href).origin !== location.origin) {
          e.preventDefault();
          toast("Demo link — this would open the business's real page.");
        }
      } catch (err) { /* ignore */ }
    }
  });

  doc.addEventListener("keydown", function (e) {
    if (!inFrame || e.key !== "Escape" || e.defaultPrevented) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    try { window.parent.postMessage({ type: "hd:key", key: "Escape", id: demoId }, "*"); } catch (err) { /* ignore */ }
  });

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "hd:brand") setBrand(d.name);
  });

  function start() {
    var q = null;
    try { q = new URLSearchParams(location.search).get("brand"); } catch (e) { q = null; }
    if (q) setBrand(q);
    badge();
    if (inFrame) {
      try { window.parent.postMessage({ type: "hd:ready", id: demoId }, "*"); } catch (e) { /* ignore */ }
    }
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start);
  else start();

  window.DemoKit = {
    id: demoId,
    studio: STUDIO,
    inFrame: inFrame,
    toast: toast,
    setBrand: setBrand,
    get brand() { return currentBrand; },
    get originalBrand() { return originalBrand; },
    get reducedMotion() { return !!(mq && mq.matches); }
  };
})();
