/* Studio showcase hub. Progressive enhancement: without this file every drawer is a normal link to its demo. */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cfgEl = $("#hub-config");
  if (!cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent);
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mqPhone = window.matchMedia("(max-width: 639px)");
  var mqNarrow = window.matchMedia("(max-width: 919px)");
  var canHover = window.matchMedia("(hover: hover)");
  function onMQ(mq, fn) { if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn); }
  var fmt = function (s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return k in o ? o[k] : m; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("hd." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("hd." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var smooth = function () { return reduce.matches ? "auto" : "smooth"; };
  var plainClick = function (e) { return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey; };
  var usable = function (el) { return !!el && document.contains(el) && el.offsetParent !== null; };

  // Browsers disagree on focus moved by script after a click or tap (Safari draws a ring where Chrome doesn't),
  // so focus rings show only while the visitor is using the keyboard (see .pointer-input in hub.css).
  document.addEventListener("pointerdown", function () { root.classList.add("pointer-input"); }, true);
  document.addEventListener("keydown", function (e) { if (!e.metaKey && !e.ctrlKey) root.classList.remove("pointer-input"); }, true);

  /* ---------------- overlays: menu, filter sheet, viewer ---------------- */
  // Native <dialog>s give focus containment and Esc. They fade in with a CSS animation (no visibility delay, so focus
  // can land at once) and fade out before close(). While one is open the page is locked, and padded by the width of
  // the scrollbar that locking hides, so nothing behind the overlay shifts.
  var overlays = [], stack = [];
  function Overlay(dlg, ms, opts) {
    opts = opts || {};
    var t = null, self = { dlg: dlg, opener: null, restore: true, then: null };
    // the attribute, not dlg.open: browsers without <dialog> have no such property (the fallback sets the attribute)
    self.shown = function () { return !!dlg && dlg.hasAttribute("open"); };
    self.isOpen = function () { return self.shown() && !dlg.classList.contains("is-closing"); };
    self.open = function (opener) {
      if (!dlg) return;
      clearTimeout(t);
      self.then = null;
      dlg.classList.remove("is-closing");
      if (!self.shown()) {
        self.opener = opener || document.activeElement;
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      }
      stack = stack.filter(function (o) { return o !== self; }).concat(self);
      sync();
    };
    // then: runs once the overlay has gone, in place of handing focus back to the opener
    self.close = function (restore, then) {
      if (!self.isOpen()) return;
      self.restore = restore !== false && !then;
      self.then = then || null;
      dlg.classList.add("is-closing");
      sync();
      t = setTimeout(function () { if (dlg.close) dlg.close(); else { dlg.removeAttribute("open"); dlg.dispatchEvent(new Event("close")); } }, reduce.matches ? 0 : ms);
    };
    if (dlg) {
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); (opts.onCancel || self.close)(); });
      dlg.addEventListener("close", function () {
        // the close event is queued: if the overlay opened again in the meantime, this one is stale
        if (self.shown()) return;
        dlg.classList.remove("is-closing");
        stack = stack.filter(function (o) { return o !== self; });
        sync();
        var o = self.opener, then = self.then;
        self.opener = null;
        self.then = null;
        if (opts.onClose) opts.onClose(o);
        else if (self.restore && usable(o)) o.focus({ preventScroll: true });
        if (then) then();
      });
      // without <dialog> there is no cancel event, so Esc is handled here
      if (!dlg.showModal) {
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && self.isOpen() && stack[stack.length - 1] === self) (opts.onCancel || self.close)();
        });
      }
    }
    overlays.push(self);
    return self;
  }
  function anyOpen() { return overlays.some(function (o) { return o.isOpen(); }); }
  function sync() {
    // locked until the overlay has gone: unlocking as the fade starts would bring the scrollbar back mid-fade
    var lock = overlays.some(function (o) { return o.shown(); });
    if (lock !== root.classList.contains("is-locked")) {
      if (lock) root.style.setProperty("--scrollbar-w", Math.max(0, window.innerWidth - root.clientWidth) + "px");
      root.classList.toggle("is-locked", lock);
    }
    if (menuBtn) menuBtn.setAttribute("aria-expanded", String(menu.isOpen()));
    barUpdate();
  }

  /* ---------------- toast ---------------- */
  // An open modal dialog sits in the top layer and makes the page inert, so a dialog that raises toasts (the viewer)
  // has its own. Each live region stays where it is: screen readers often skip one that has just been moved.
  var pageToast = $("#hub-toast"), toastEl = null, toastT;
  function frontDialog() {
    var front = null;
    stack.forEach(function (o) { if (o.isOpen()) front = o.dlg; });
    return front;
  }
  function toast(msg) {
    var front = frontDialog(), el = (front && $(".hub-toast", front)) || pageToast;
    if (toastEl && toastEl !== el) hideToast();
    toastEl = el;
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(hideToast, 3400);
  }
  function hideToast() {
    clearTimeout(toastT);
    if (toastEl) toastEl.classList.remove("on");
    toastEl = null;
  }

  /* ---------------- page geometry & scrolling ---------------- */
  var top = $(".top"), filtersEl = $("#filters"), heroEl = $("#hero"), contactEl = $("#contact");
  function headerH() { return top ? top.offsetHeight : 0; }
  // the filter bar is only sticky where it is compact (see hub.css)
  function filtersH() { return filtersEl && getComputedStyle(filtersEl).position === "sticky" ? filtersEl.offsetHeight : 0; }
  function scrollToY(y) { window.scrollTo({ top: Math.max(0, y), behavior: smooth() }); }
  // in-page jumps land below the sticky header (and, for results, below the sticky filter bar too)
  function scrollToEl(el, gap) { if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY - headerH() - (gap == null ? 8 : gap)); }
  function scrollToResults() { scrollToEl($("#results"), filtersH() + 4); }

  // scroll-spy: the last section whose top has passed the header + 35% of the viewport is current
  var spyIds = ["box", "services", "process", "faq", "contact"];
  var spyEls = spyIds.map(function (id) { return document.getElementById(id); });
  var spyLinks = $$(".top-nav a[data-section], .menu-link[data-section]");
  var activeSection = null;
  function spy() {
    var line = headerH() + window.innerHeight * .35, now = "";
    spyEls.forEach(function (el, i) { if (el && el.getBoundingClientRect().top <= line) now = spyIds[i]; });
    if (now === activeSection) return;
    activeSection = now;
    spyLinks.forEach(function (a) {
      if (a.dataset.section === now) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  // phone action bar: after the hero, before the contact section, and never over an overlay
  var mbar = $("#mbar");
  function barUpdate() {
    if (!mbar || !heroEl || !contactEl) return;
    var on = mqPhone.matches && !anyOpen() &&
      heroEl.getBoundingClientRect().bottom < headerH() &&
      contactEl.getBoundingClientRect().top >= window.innerHeight * .85;
    mbar.classList.toggle("on", on);
    root.classList.toggle("bar-on", on);
  }

  var rafPending = false;
  function measure() {
    rafPending = false;
    if (top) top.classList.toggle("scrolled", window.scrollY > 8);
    spy();
    barUpdate();
  }
  function onScroll() { if (!rafPending) { rafPending = true; requestAnimationFrame(measure); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  // language switch keeps the current filters and open drawer (not a section the visitor has since scrolled away from)
  $$("a[hreflang]").forEach(function (a) {
    a.addEventListener("click", function () {
      a.href = a.getAttribute("href").split(/[?#]/)[0] + location.search + (hashId() ? location.hash : "");
    });
  });

  /* ---------------- data from the server-rendered cards ---------------- */
  var list = $("#drawers"), results = $("#results");
  var cards = $$(".drawer", list);
  var byId = {};
  cards.forEach(function (c) { byId[c.dataset.id] = c; });
  var allIds = cards.map(function (c) { return c.dataset.id; });

  /* ---------------- overlay instances ---------------- */
  var menuBtn = $("#menu-open");
  var menu = Overlay($("#menu"), 280);
  var sheetDlg = $("#filter-sheet");
  var sheet = Overlay(sheetDlg, 350, { onCancel: function () { closeSheet(); } });
  var dlg = $("#viewer");
  var viewer = Overlay(dlg, 250, { onCancel: function () { closeViewer(); }, onClose: function () { onViewerClose(); } });

  if (menuBtn) menuBtn.addEventListener("click", function () { if (menu.isOpen()) menu.close(); else menu.open(menuBtn); });
  if ($("#menu-close")) $("#menu-close").addEventListener("click", function () { menu.close(); });
  // a real resize past the breakpoint (not the scroll lock) retires the overlay that no longer applies
  onMQ(mqNarrow, function (e) { if (!e.matches) menu.close(false); });

  function focusBrand() { var b = $(".top .brand"); if (b) b.focus({ preventScroll: true }); }
  // the logo and "Back to top": close whatever is open, then go to the top with keyboard focus
  function goHome() {
    if (viewer.shown()) { closeViewer(function () { scrollToY(0); focusBrand(); }); return; }
    scrollToY(0);
    var open = [menu, sheet].filter(function (o) { return o.isOpen(); })[0];
    if (open) open.close(false, focusBrand); else focusBrand();
  }
  // a jump target that isn't focusable takes focus only so the next Tab starts there
  function focusTarget(el) {
    if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }

  // In-page links are native: html's scroll-padding keeps the target clear of the sticky header, and the browser moves
  // the keyboard's starting point with the jump. Three cases need more: #top also closes overlays; a menu link closes
  // the menu, which would hand focus back to the Menu button, so focus goes to the target; and on phones the
  // industries figure opens the filter sheet.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || !plainClick(e) || !e.target.closest) return;
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    if (id === "top") { e.preventDefault(); goHome(); return; }
    if (a.dataset.proof === "industries" && mqPhone.matches) { e.preventDefault(); openSheet(a); return; }
    var el = id ? document.getElementById(id) : null;
    if (el && menu.isOpen() && menu.dlg.contains(a)) menu.close(false, function () { focusTarget(el); });
  });

  /* ---------------- try it on (brand name) ---------------- */
  var brand = store.get("brand", "");
  var tryForm = $("#tryon"), tryInput = $("#tryon-name"), tryHint = $("#tryon-hint"), vBrand = $("#v-brand");
  var tryState = $("#tryon-state"), tryOn = $("#tryon-on"), plateBrand = $("#plate-brand");
  function cleanBrand(s) { return String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 32); }
  function paintBrand() {
    tryHint.hidden = !!brand;
    tryState.hidden = !brand;
    tryOn.textContent = brand ? fmt(cfg.hero.brand_on, { brand: brand }) : "";
    if (plateBrand) plateBrand.textContent = brand ? " · " + brand : "";
  }
  function setBrand(v, from) {
    var prev = brand;
    brand = cleanBrand(v);
    store.set("brand", brand);
    if (from !== "hero") tryInput.value = brand;
    if (from !== "viewer") vBrand.value = brand;
    var biz = $("#f-business");
    if (biz && (!biz.value || biz.value === prev)) { biz.value = brand; updateBrief(); }
    paintBrand();
    sendBrand();
  }
  tryInput.value = brand;
  vBrand.value = brand;
  tryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    setBrand(tryInput.value, "hero");
  });
  $("#tryon-open").addEventListener("click", function () { surprise(this); });
  $("#tryon-clear").addEventListener("click", function () {
    setBrand("", "clear");
    tryInput.focus();
  });
  var vBrandT;
  vBrand.addEventListener("input", function () {
    clearTimeout(vBrandT);
    vBrandT = setTimeout(function () { setBrand(vBrand.value, "viewer"); }, 180);
  });

  /* ---------------- saved drawers ---------------- */
  var saved = store.get("saved", []).filter(function (id) { return byId[id]; });
  function isSaved(id) { return saved.indexOf(id) !== -1; }
  // quiet: saves made from the viewer bar or the brief don't announce themselves
  function toggleSave(id, quiet) {
    var adding = !isSaved(id);
    if (adding) saved.push(id);
    else saved = saved.filter(function (x) { return x !== id; });
    store.set("saved", saved);
    renderSaved();
    if (adding) {
      bump();
      if (!quiet) toast(fmt(cfg.box.saved_toast, { name: byId[id].dataset.name }));
    }
  }
  var bumpT;
  function bump() {
    var els = $$(".bump");
    els.forEach(function (el) { el.classList.add("is-bumped"); });
    clearTimeout(bumpT);
    bumpT = setTimeout(function () { els.forEach(function (el) { el.classList.remove("is-bumped"); }); }, 380);
  }
  function renderSaved() {
    cards.forEach(function (c) { $(".drawer-save", c).setAttribute("aria-pressed", String(isSaved(c.dataset.id))); });
    $("#saved-count").textContent = saved.length;
    $("#sheet-saved-n").textContent = saved.length;
    if (current) $("#v-save").setAttribute("aria-pressed", String(isSaved(current)));
    $("#v-save span").textContent = current && isSaved(current) ? cfg.viewer.saved : cfg.viewer.save;
    $("#mbar-saved").hidden = !saved.length;
    $("#mbar-shuffle").hidden = !!saved.length;
    $("#mbar-saved-text").textContent = fmt(cfg.box.bar_saved, { n: saved.length });
    renderLiked();
    if (state.saved) apply();
  }

  /* ---------------- filters ---------------- */
  var EMPTY = function () { return { industry: "all", mood: "", feature: "", q: "", saved: false }; };
  var state = EMPTY();
  var limit = 0, matched = [];
  var indChips = $$(".chip[data-industry]"), moodChips = $$(".chip[data-mood]"), featChips = $$(".chip[data-feature]");
  var moodSel = $("#mood"), featSel = $("#feature"), search = $("#search"), savedBtn = $("#saved-toggle"), sheetSaved = $("#sheet-saved");
  var countEl = $("#count"), emptyEl = $("#empty"), moreEl = $("#more"), clearAllBtn = $("#clear-all"), activeEl = $("#active-filters");
  var filtersBtn = $("#filters-open"), filtersN = $("#filters-n"), sheetDone = $("#sheet-done");
  var placeholderLong = search.placeholder, placeholderShort = search.dataset.short || placeholderLong;

  function batch() { return mqPhone.matches ? 24 : 36; }
  function matches(c) {
    var d = c.dataset;
    if (state.industry !== "all" && d.industry !== state.industry) return false;
    if (state.mood && (" " + d.moods + " ").indexOf(" " + state.mood + " ") === -1) return false;
    if (state.feature && (" " + d.features + " ").indexOf(" " + state.feature + " ") === -1) return false;
    if (state.saved && !isSaved(d.id)) return false;
    if (state.q) {
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (d.search.indexOf(words[i]) === -1) return false;
    }
    return true;
  }
  function activeFilters() {
    var out = [];
    if (state.industry !== "all") out.push({ key: "industry", label: cfg.industries[state.industry] || state.industry });
    if (state.mood) out.push({ key: "mood", label: cfg.moods[state.mood] || state.mood });
    if (state.feature) out.push({ key: "feature", label: cfg.features[state.feature] || state.feature });
    if (state.q) out.push({ key: "q", label: "“" + state.q + "”" });
    if (state.saved) out.push({ key: "saved", label: cfg.box.saved });
    return out;
  }
  function pressed(els, test) { els.forEach(function (b) { b.setAttribute("aria-pressed", String(test(b))); }); }
  function paintControls() {
    pressed(indChips, function (b) { return b.dataset.industry === state.industry; });
    pressed(moodChips, function (b) { return b.dataset.mood === state.mood; });
    pressed(featChips, function (b) { return b.dataset.feature === state.feature; });
    moodSel.value = state.mood; moodSel.classList.toggle("active", !!state.mood);
    featSel.value = state.feature; featSel.classList.toggle("active", !!state.feature);
    // never rewrite the field under the visitor's cursor (it would swallow a trailing space)
    if (search.value !== state.q && document.activeElement !== search) search.value = state.q;
    savedBtn.setAttribute("aria-pressed", String(state.saved));
    sheetSaved.setAttribute("aria-pressed", String(state.saved));
    var af = activeFilters();
    filtersBtn.classList.toggle("is-active", af.length > 0);
    filtersN.hidden = !af.length;
    filtersN.textContent = af.length;
    clearAllBtn.hidden = !af.length;
    activeEl.innerHTML = "";
    af.forEach(function (f) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "af-chip";
      b.setAttribute("aria-label", fmt(cfg.box.remove_filter, { label: f.label }));
      b.appendChild(document.createTextNode(f.label));
      var x = document.createElement("span");
      x.setAttribute("aria-hidden", "true");
      x.textContent = "×";
      b.appendChild(x);
      b.addEventListener("click", function () {
        if (f.key === "industry") state.industry = "all";
        else if (f.key === "saved") state.saved = false;
        else state[f.key] = "";
        filterChanged();
        focusCountRow();
      });
      activeEl.appendChild(b);
    });
  }
  function apply(animate) {
    paintControls();
    matched = cards.filter(matches);
    var n = matched.length, total = cards.length, lim = limit || batch(), shown = Math.min(lim, n);
    var rank = {};
    matched.forEach(function (c, i) { rank[c.dataset.id] = i; });
    cards.forEach(function (c) { var r = rank[c.dataset.id]; c.hidden = r === undefined || r >= lim; });
    countEl.textContent = n === total ? fmt(cfg.box.count_all, { n: n }) : fmt(cfg.box.count_some, { n: n, total: total });
    emptyEl.hidden = n !== 0;
    moreEl.hidden = shown >= n;
    if (shown < n) {
      $("#more-fill").style.width = (shown / n * 100) + "%";
      $("#more-text").textContent = fmt(cfg.box.shown, { a: shown, b: n });
      $("#more-btn").textContent = fmt(cfg.box.more, { n: Math.min(batch(), n - shown) });
      $("#more-all").textContent = fmt(cfg.box.show_all, { n: n });
    }
    sheetDone.textContent = n === 0 ? cfg.box.show_none : n === 1 ? cfg.box.show_one : fmt(cfg.box.show_n, { n: n });
    if (animate) fadeIn();
    syncURL();
  }
  // any filter change starts again from the first batch and fades the list in
  function filterChanged() { limit = 0; apply(true); }
  var fadeR = 0;
  function fadeIn() {
    if (reduce.matches) return;
    list.classList.add("is-entering");
    cancelAnimationFrame(fadeR);
    fadeR = requestAnimationFrame(function () { fadeR = requestAnimationFrame(function () { list.classList.remove("is-entering"); }); });
  }
  function syncURL() {
    var p = new URLSearchParams();
    if (state.industry !== "all") p.set("industry", state.industry);
    if (state.mood) p.set("mood", state.mood);
    if (state.feature) p.set("feature", state.feature);
    if (state.q) p.set("q", state.q);
    var qs = p.toString();
    var url = location.pathname + (qs ? "?" + qs : "") + location.hash;
    try { history.replaceState(history.state, "", url); } catch (e) { /* file:// in some browsers */ }
  }
  function readURL(search) {
    var p = new URLSearchParams(search);
    state.industry = byIndustryExists(p.get("industry")) ? p.get("industry") : "all";
    state.mood = optionExists(moodSel, p.get("mood")) ? p.get("mood") : "";
    state.feature = optionExists(featSel, p.get("feature")) ? p.get("feature") : "";
    state.q = (p.get("q") || "").slice(0, 60);
  }
  function byIndustryExists(v) { return !!v && indChips.some(function (b) { return b.dataset.industry === v; }); }
  function optionExists(sel, v) { return !!v && $$("option", sel).some(function (o) { return o.value === v; }); }
  function clearAll() { state = EMPTY(); filterChanged(); }
  // the control that had focus can disappear (a removed filter chip, "Clear all"): focus stays in the count row
  countEl.tabIndex = -1;
  function focusCountRow() { ($(".af-chip", activeEl) || countEl).focus({ preventScroll: true }); }

  indChips.forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.dataset.industry;
      // tapping the selected industry again goes back to All
      state.industry = v !== "all" && state.industry === v ? "all" : v;
      filterChanged();
    });
  });
  moodChips.forEach(function (b) {
    b.addEventListener("click", function () { state.mood = state.mood === b.dataset.mood ? "" : b.dataset.mood; filterChanged(); });
  });
  featChips.forEach(function (b) {
    b.addEventListener("click", function () { state.feature = state.feature === b.dataset.feature ? "" : b.dataset.feature; filterChanged(); });
  });
  moodSel.addEventListener("change", function () { state.mood = moodSel.value; filterChanged(); });
  featSel.addEventListener("change", function () { state.feature = featSel.value; filterChanged(); });
  // typing refines the list in place: no fade on every pause, and nothing at all for a trailing space
  var searchT;
  search.addEventListener("input", function () {
    clearTimeout(searchT);
    searchT = setTimeout(function () {
      var q = search.value.trim().slice(0, 60);
      if (q === state.q) return;
      state.q = q;
      limit = 0;
      apply(false);
    }, 140);
  });
  function toggleSavedOnly() { state.saved = !state.saved; filterChanged(); }
  savedBtn.addEventListener("click", toggleSavedOnly);
  sheetSaved.addEventListener("click", toggleSavedOnly);
  $("#clear-filters").addEventListener("click", function () { clearAll(); focusCountRow(); });
  clearAllBtn.addEventListener("click", function () { clearAll(); focusCountRow(); });
  $("#sheet-clear").addEventListener("click", clearAll);
  // the buttons sit below the list (and go away once everything is shown): focus moves to the first new drawer
  function showMore(newLimit) {
    var first = matched[Math.min(limit || batch(), matched.length)];
    limit = newLimit;
    apply(false);
    if (first) $(".drawer-link", first).focus({ preventScroll: true });
  }
  $("#more-btn").addEventListener("click", function () { showMore((limit || batch()) + batch()); });
  $("#more-all").addEventListener("click", function () { showMore(Infinity); });

  // phone filter sheet: when it closes on changed results (or "Show N"), the results come into view
  var sheetStart = "";
  function openSheet(from) { sheetStart = JSON.stringify(state); sheet.open(from); }
  function closeSheet(show) {
    if (!sheet.isOpen()) return;
    if (!show && JSON.stringify(state) === sheetStart) { sheet.close(); return; }
    sheet.close(false, function () { filtersBtn.focus({ preventScroll: true }); });
    scrollToResults();
  }
  filtersBtn.addEventListener("click", function () { openSheet(filtersBtn); });
  $("#sheet-close").addEventListener("click", function () { closeSheet(); });
  sheetDone.addEventListener("click", function () { closeSheet(true); });
  sheetDlg.addEventListener("click", function (e) {
    if (e.target !== sheetDlg) return;
    var r = sheetDlg.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) closeSheet();
  });
  function paintPlaceholder() { search.placeholder = mqPhone.matches ? placeholderShort : placeholderLong; }
  onMQ(mqPhone, function (e) {
    if (!e.matches) sheet.close(false);
    paintPlaceholder();
    if (!limit) apply(false);
    barUpdate();
  });

  // "See examples" and the bilingual figure set filters without reloading, then show the results
  function example(query) {
    readURL(query);
    state.saved = false;
    limit = 0;
    apply(true);
    menu.close();
    sheet.close();
    scrollToResults();
    var label = state.industry !== "all" ? cfg.industries[state.industry] : state.mood ? cfg.moods[state.mood] : state.feature ? cfg.features[state.feature] : "";
    toast(fmt(matched.length === 1 ? cfg.box.showing_one : cfg.box.showing, { n: matched.length, label: label }));
  }
  $$("a[data-filter-link]").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href.charAt(0) !== "?") return;
    a.addEventListener("click", function (e) {
      if (!plainClick(e)) return;
      e.preventDefault();
      example(href.split("#")[0]);
    });
  });

  // views
  var views = $$(".view-toggle button");
  function setView(v) {
    list.dataset.view = v;
    results.dataset.view = v;
    views.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
    store.set("view", v);
  }
  views.forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.view); }); });
  setView(store.get("view", "cabinet") === "index" ? "index" : "cabinet");

  // card clicks: open the viewer (modifier clicks still open the real page)
  list.addEventListener("click", function (e) {
    var save = e.target.closest(".drawer-save");
    if (save) { e.preventDefault(); toggleSave(save.dataset.save); return; }
    var a = e.target.closest("a[data-open]");
    if (!a || e.defaultPrevented || !plainClick(e)) return;
    if (!dlg.showModal) return;
    e.preventDefault();
    openViewer(a.dataset.open, { from: a });
  });

  function matchedIds() {
    var ids = matched.map(function (c) { return c.dataset.id; });
    return ids.length ? ids : allIds.slice();
  }
  function surprise(from) {
    var pool = matchedIds();
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) openViewer(pick, { from: from || null });
  }
  $("#shuffle").addEventListener("click", function () { surprise(this); });
  $("#empty-shuffle").addEventListener("click", function () { surprise(this); });

  // phone action bar
  $("#mbar-shuffle").addEventListener("click", function () { surprise(this); });
  $("#mbar-saved").addEventListener("click", function () {
    state = EMPTY();
    state.saved = true;
    filterChanged();
    scrollToResults();
    toast(fmt(saved.length === 1 ? cfg.box.showing_saved_one : cfg.box.showing_saved, { n: saved.length }));
  });

  /* ---------------- hero box ---------------- */
  var heroBox = $(".hero-box"), tip = $(".tile-tip");
  var tiles = $$(".tile");
  var hoverTile = null;
  function showTip(t) {
    var br = heroBox.getBoundingClientRect(), tr = t.getBoundingClientRect();
    tip.innerHTML = "";
    var b = document.createElement("b");
    b.textContent = "No. " + t.dataset.id;
    tip.appendChild(b);
    tip.appendChild(document.createTextNode(t.dataset.name));
    tip.style.left = (tr.left + tr.width / 2 - br.left) + "px";
    // above the enlarged (2.6×) drawer: its centre minus 1.3 × its unscaled height
    tip.style.top = (tr.top + tr.height / 2 - t.offsetHeight * 1.3 - br.top) + "px";
    tip.hidden = false;
  }
  if (heroBox) {
    heroBox.addEventListener("pointerover", function (e) {
      var t = e.target.closest(".tile");
      if (!t || e.pointerType === "touch") return;
      if (hoverTile && hoverTile !== t) hoverTile.classList.remove("hot");
      hoverTile = t;
      t.classList.add("hot");
      showTip(t);
    });
    heroBox.addEventListener("pointerleave", function () {
      if (hoverTile) hoverTile.classList.remove("hot");
      hoverTile = null;
      tip.hidden = true;
    });
    heroBox.addEventListener("click", function (e) {
      var t = e.target.closest(".tile");
      if (t && dlg.showModal) openViewer(t.dataset.id, { from: null });
    });
    // attract mode: now and then a drawer slides out by itself
    var boxVisible = false, pulled = null;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { boxVisible = entries[0].isIntersecting; }, { threshold: .3 }).observe(heroBox);
    }
    setInterval(function () {
      if (pulled) { pulled.classList.remove("pulled"); pulled = null; tip.hidden = !hoverTile; return; }
      if (!boxVisible || hoverTile || document.hidden || reduce.matches || anyOpen()) return;
      pulled = tiles[Math.floor(Math.random() * tiles.length)];
      pulled.classList.add("pulled");
      if (canHover.matches) showTip(pulled);
    }, 1900);
  }

  /* ---------------- viewer ---------------- */
  var iframe = $("#v-iframe"), screen = $("#v-screen"), frame = $("#v-frame"), stage = $("#v-stage"), vName = $("#v-name");
  var panel = $("#v-panel"), infoBtn = $("#v-info"), playBtn = $("#v-play"), progress = $("#v-progress");
  var current = null, order = [], vOpener = null, pushed = false, viewerThen = null, afterPop = null, afterPopT = null;
  var DEV = { tablet: { w: 834, h: 1112 }, phone: { w: 390, h: 844 } };
  var device = store.get("device", "desktop");
  if (!DEV[device] && device !== "desktop") device = "desktop";
  var PLAY_MS = 14000, playing = false, playT = null;

  function viewerOrder(id) {
    var ids = matchedIds();
    return ids.indexOf(id) === -1 ? allIds.slice() : ids;
  }
  function focusTitleSoon() { setTimeout(function () { if (viewer.isOpen()) vName.focus({ preventScroll: true }); }, 30); }
  function openViewer(id, opts) {
    opts = opts || {};
    if (!byId[id] || !dlg.showModal) return;
    order = viewerOrder(id);
    if (!viewer.isOpen()) {
      vOpener = opts.from || document.activeElement;
      viewerThen = null;
      menu.close(false);
      sheet.close(false);
      viewer.open(vOpener);
      focusTitleSoon();
    }
    load(id);
    var url = location.pathname + location.search + "#demo-" + id;
    try {
      if (opts.push === false) history.replaceState({ demo: id }, "", url);
      else if (!pushed) { history.pushState({ demo: id }, "", url); pushed = true; }
      else history.replaceState({ demo: id }, "", url);
    } catch (e) { /* ignore */ }
  }

  function load(id) {
    current = id;
    var d = byId[id].dataset, img = $(".drawer-img", byId[id]);
    var src = cfg.prefix + "demos/" + d.folder + "/";
    $("#v-no").textContent = "No. " + id;
    vName.textContent = d.name;
    $("#v-meta").textContent = d.type + " · " + d.city;
    $("#vp-business").textContent = d.type + " · " + d.city;
    $("#vp-style").textContent = d.style;
    $("#vp-interaction").textContent = d.interaction;
    $("#vp-lang").textContent = d.lang;
    $("#v-newtab").href = src + (brand ? "?brand=" + encodeURIComponent(brand) : "");
    $("#v-poster").style.backgroundImage = 'url("' + (img.currentSrc || img.src) + '")';
    $("#v-loading-text").textContent = fmt(cfg.viewer.loading, { no: id });
    $("#v-pos").textContent = fmt(cfg.viewer.position, { i: order.indexOf(id) + 1, n: order.length });
    $("#v-save").setAttribute("aria-pressed", String(isSaved(id)));
    $("#v-save span").textContent = isSaved(id) ? cfg.viewer.saved : cfg.viewer.save;
    iframe.title = fmt(cfg.viewer.frame_title, { name: d.name });
    screen.classList.remove("loaded");
    navigateFrame(src);
    sizeFrame();
    if (playing) schedulePlay();
  }

  // The viewer keeps the page history to one entry, so one history step closes it. Changing iframe.src would add a
  // joint session-history entry per design: replacing the frame's location doesn't.
  var frameSrc = "about:blank";
  function navigateFrame(url) {
    frameSrc = url;
    try {
      if (iframe.contentWindow) { iframe.contentWindow.location.replace(new URL(url, location.href).href); return; }
    } catch (e) { /* not reachable: fall back to src */ }
    iframe.src = url;
  }
  // Each viewer session gets a fresh frame. The old one goes before the closing history step, taking its history
  // entries with it, so that step can't load an earlier design back into the hidden frame.
  function resetFrame() {
    var fresh = iframe.cloneNode(false);
    fresh.setAttribute("src", "about:blank");
    fresh.title = "";
    fresh.addEventListener("load", onFrameLoad);
    iframe.parentNode.replaceChild(fresh, iframe);
    iframe = fresh;
    frameSrc = "about:blank";
  }
  // A demo's own in-page links would add history entries inside the frame, and the closing history step would then
  // move the demo instead of leaving the viewer. Inside the viewer they replace the frame's entry instead.
  function keepFrameHistory() {
    var w = iframe.contentWindow, doc;
    try { doc = w.document; } catch (e) { return; }
    doc.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || e.defaultPrevented || !plainClick(e) || (a.getAttribute("target") || "_self") !== "_self") return;
      var href = a.getAttribute("href"), u;
      if (href.indexOf("#") === -1) return;
      try { u = new URL(href, doc.baseURI); } catch (err) { return; }
      if (u.href.split("#")[0] !== w.location.href.split("#")[0]) return;
      e.preventDefault();
      w.location.replace(u.href);
    });
  }
  function onFrameLoad() {
    if (!current || frameSrc === "about:blank") return;
    screen.classList.add("loaded");
    keepFrameHistory();
    sendBrand();
  }
  iframe.addEventListener("load", onFrameLoad);
  function sendBrand() {
    if (!current || !iframe.contentWindow) return;
    try { iframe.contentWindow.postMessage({ type: "hd:brand", name: brand }, "*"); } catch (e) { /* ignore */ }
  }
  window.addEventListener("message", function (e) {
    if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "hd:ready") sendBrand();
    if (m.type === "hd:key" && m.key === "Escape" && viewer.shown()) closeViewer();
  });

  function step(delta) {
    if (!current || !order.length) return;
    var i = order.indexOf(current);
    var next = order[(i + delta + order.length) % order.length];
    load(next);
    try { history.replaceState({ demo: next }, "", location.pathname + location.search + "#demo-" + next); } catch (e) { /* ignore */ }
  }

  // then: what happens once the viewer has gone (scrolling waits for the history step, which restores scroll).
  // Asked again while it fades out (the logo, "I want this"), the newer follow-up replaces the earlier one.
  function closeViewer(then) {
    if (!viewer.shown()) return;
    if (viewer.isOpen()) {
      stopPlay();
      viewerThen = null;
      viewer.close(false);
    }
    if (then) viewerThen = then;
  }
  // The control that opened the viewer can go while it is open (saving rebuilds the liked list and swaps the phone
  // bar's "Surprise me" for the saved count; clearing the name hides the hero's "Open one"): focus goes to a stand-in
  // in the same place, and the page stays put.
  function standIn(o) {
    var c = null, near;
    if (o.classList.contains("liked-open")) c = $('.liked-open[data-id="' + o.dataset.id + '"]', likedList) || $(".liked-open", likedList) || $("a", likedEmpty);
    else if (mbar && mbar.contains(o)) c = $$("button", mbar).filter(usable)[0];
    else if ((near = o.closest("section"))) c = $$("a[href], button, input, select, textarea", near).filter(usable)[0];
    return usable(c) ? c : null;
  }
  // a drawer beyond the batches shown so far: show the batches up to it
  function revealCard(id) {
    var i = matched.indexOf(byId[id]);
    if (i < (limit || batch())) return;
    limit = Math.ceil((i + 1) / batch()) * batch();
    apply(false);
  }
  function restoreFocus(closedId) {
    var o = vOpener;
    vOpener = null;
    var opener = o && o.nodeType === 1 && o !== document.body && !o.closest(".hero-box") ? o : null;
    var target = opener && (usable(opener) ? opener : standIn(opener));
    // opened with no control to go back to (a shared link, the hero box): land on the design's own drawer
    if (!opener && closedId && byId[closedId] && matched.indexOf(byId[closedId]) !== -1) {
      revealCard(closedId);
      target = $(".drawer-link", byId[closedId]);
    }
    if (!target) return;
    target.focus({ preventScroll: true });
    if (target.closest(".drawer")) {
      var r = target.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) target.scrollIntoView({ block: "center" });
    }
  }
  function runAfterPop() {
    var f = afterPop;
    afterPop = null;
    clearTimeout(afterPopT);
    if (!f || viewer.shown()) return;
    // if back() stayed inside a demo that made history of its own, still drop the stale #demo- hash
    if (location.hash.indexOf("#demo-") === 0) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ } }
    f();
  }
  function onViewerClose() {
    stopPlay();
    resetFrame();
    panel.hidden = true;
    infoBtn.setAttribute("aria-expanded", "false");
    var vToast = $(".hub-toast", dlg);
    if (vToast) { if (toastEl === vToast) hideToast(); vToast.textContent = ""; }
    var closedId = current;
    current = null;
    var then = viewerThen;
    viewerThen = null;
    var after = then ? function () { vOpener = null; then(); } : function () { restoreFocus(closedId); };
    if (location.hash.indexOf("#demo-") === 0) {
      if (pushed) {
        pushed = false;
        afterPop = after;
        clearTimeout(afterPopT);
        afterPopT = setTimeout(runAfterPop, 400);
        history.back();
        return;
      }
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    }
    pushed = false;
    after();
  }
  $("#v-close").addEventListener("click", function () { closeViewer(); });
  $("#v-prev").addEventListener("click", function () { step(-1); });
  $("#v-next").addEventListener("click", function () { step(1); });
  $("#v-save").addEventListener("click", function () { if (current) toggleSave(current, true); });
  dlg.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
  });
  infoBtn.addEventListener("click", function () {
    var open = panel.hidden;
    panel.hidden = !open;
    infoBtn.setAttribute("aria-expanded", String(open));
  });
  $("#v-want").addEventListener("click", function (e) {
    e.preventDefault();
    if (current && !isSaved(current)) toggleSave(current, true);
    closeViewer(function () {
      scrollToEl(contactEl);
      var first = $("#f-name").value ? $("#f-msg") : $("#f-name");
      first.focus({ preventScroll: true });
    });
  });

  // share: a link that opens straight onto this design
  $("#v-copy").addEventListener("click", function () {
    if (!current) return;
    var url = location.href.split(/[?#]/)[0] + "#demo-" + current;
    copyText(url).then(function (ok) { toast(ok ? cfg.viewer.link_copied : fmt(cfg.viewer.link_fail, { url: url })); });
  });

  // swipe across the top or bottom bar to browse; gestures inside the demo stay with the demo
  var swipeX = null, swipeY = 0;
  $$(".v-bar, .v-foot", dlg).forEach(function (bar) {
    bar.addEventListener("touchstart", function (e) {
      var p = e.touches && e.touches[0];
      if (p) { swipeX = p.clientX; swipeY = p.clientY; }
    }, { passive: true });
    bar.addEventListener("touchend", function (e) {
      var p = e.changedTouches && e.changedTouches[0];
      if (!p || swipeX === null) return;
      var dx = p.clientX - swipeX, dy = p.clientY - swipeY;
      swipeX = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  });

  // devices
  var devBtns = $$(".v-devices button");
  function effectiveDevice() { return window.innerWidth <= 760 ? "desktop" : device; }
  function setDevice(v) {
    device = v;
    store.set("device", v);
    devBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.device === v)); });
    sizeFrame();
  }
  devBtns.forEach(function (b) { b.addEventListener("click", function () { setDevice(b.dataset.device); }); });
  function sizeFrame() {
    var dev = effectiveDevice();
    frame.dataset.device = dev;
    if (!DEV[dev]) { screen.style.removeProperty("--s"); return; }
    var box = frame.getBoundingClientRect();
    var bezel = dev === "phone" ? 30 : 34;
    var s = Math.min((box.width - bezel * 2) / DEV[dev].w, (box.height - bezel * 2) / DEV[dev].h, 1);
    screen.style.setProperty("--w", DEV[dev].w);
    screen.style.setProperty("--h", DEV[dev].h);
    screen.style.setProperty("--s", Math.max(.2, s).toFixed(4));
  }
  setDevice(device);
  if ("ResizeObserver" in window) new ResizeObserver(function () { if (viewer.shown()) sizeFrame(); }).observe(stage);
  else window.addEventListener("resize", function () { if (viewer.shown()) sizeFrame(); });

  // play the box: a gentle, pausable tour
  function schedulePlay() {
    clearTimeout(playT);
    progress.style.transition = "none";
    progress.style.width = "0";
    void progress.offsetWidth;
    progress.style.transition = "width " + PLAY_MS + "ms linear";
    progress.style.width = "100%";
    playT = setTimeout(function () { step(1); }, PLAY_MS);
  }
  function startPlay() {
    playing = true;
    playBtn.setAttribute("aria-pressed", "true");
    $("#v-play-label").textContent = cfg.viewer.pause;
    schedulePlay();
  }
  function stopPlay() {
    playing = false;
    clearTimeout(playT);
    playBtn.setAttribute("aria-pressed", "false");
    $("#v-play-label").textContent = cfg.viewer.play;
    progress.style.transition = "none";
    progress.style.width = "0";
  }
  playBtn.addEventListener("click", function () { if (playing) stopPlay(); else startPlay(); });
  // if the visitor starts using the demo, stop touring
  window.addEventListener("blur", function () {
    setTimeout(function () { if (playing && document.activeElement === iframe) stopPlay(); }, 0);
  });

  // deep links and back button
  function hashId() { var m = /^#demo-(\d{3})$/.exec(location.hash); return m && byId[m[1]] ? m[1] : null; }
  window.addEventListener("popstate", function () {
    var id = hashId();
    if (id) {
      pushed = false;
      order = viewerOrder(id);
      if (!viewer.isOpen()) { vOpener = document.activeElement; viewer.open(vOpener); focusTitleSoon(); }
      load(id);
      return;
    }
    if (afterPop) { setTimeout(runAfterPop, 0); return; }
    if (viewer.shown()) { pushed = false; closeViewer(); }
  });

  /* ---------------- brief builder ---------------- */
  var form = $("#brief-form"), briefText = $("#brief-text"), emailEl = $("#brief-email"), status = $("#brief-status");
  var likedList = $("#liked"), likedEmpty = $("#liked-empty");

  function renderLiked() {
    var focusIndex = -1;
    var rms = $$(".liked-rm", likedList);
    rms.forEach(function (b, i) { if (b === document.activeElement) focusIndex = i; });
    likedList.innerHTML = "";
    saved.forEach(function (id) {
      var d = byId[id].dataset;
      var li = document.createElement("li");
      var open = document.createElement("button");
      open.type = "button";
      open.className = "liked-open";
      open.dataset.id = id;
      open.title = fmt(cfg.box.open_label, { name: d.name });
      var img = document.createElement("img");
      img.src = $(".drawer-img", byId[id]).src;
      img.alt = "";
      img.width = 56; img.height = 35;
      img.loading = "lazy";
      var txt = document.createElement("span");
      var b = document.createElement("b");
      b.textContent = "No. " + id;
      txt.appendChild(b);
      txt.appendChild(document.createTextNode(d.name));
      open.appendChild(img); open.appendChild(txt);
      open.addEventListener("click", function () { openViewer(id, { from: open }); });
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "liked-rm";
      rm.textContent = "×";
      rm.setAttribute("aria-label", fmt(cfg.contact.remove, { name: d.name }));
      rm.addEventListener("click", function () { toggleSave(id, true); });
      li.appendChild(open); li.appendChild(rm);
      likedList.appendChild(li);
    });
    likedEmpty.hidden = saved.length > 0;
    // removing a drawer keeps keyboard focus in the list (or on the way back to the box)
    if (focusIndex !== -1) {
      var next = $$(".liked-rm", likedList);
      var target = next[Math.min(focusIndex, next.length - 1)] || $("a", likedEmpty);
      if (target) target.focus({ preventScroll: true });
    }
    updateBrief();
  }

  function val(name) { var el = form.elements[name]; return el ? String(el.value || "").trim() : ""; }
  function checked(name) { return $$('input[name="' + name + '"]:checked', form).map(function (i) { return i.value; }); }

  function composeBrief() {
    var L = cfg.brief;
    var v = { name: val("name"), email: val("email"), business: val("business"), type: val("type"), where: val("where"), needs: checked("needs"),
      when: checked("when")[0] || "", reach: checked("reach")[0] || "", detail: val("reach_detail"), message: val("message") };
    var any = v.name || v.email || v.business || v.type || v.where || v.needs.length || v.when || v.reach || v.detail || v.message || saved.length;
    if (!any) return null;
    var out = [L.heading + (v.business ? " — " + v.business : ""), ""];
    function add(label, value) { if (value) out.push(label + ": " + value); }
    add(L.name, v.name);
    add(L.email, v.email);
    add(L.business, v.business);
    add(L.type, v.type);
    add(L.where, v.where);
    add(L.needs, v.needs.join(", "));
    if (saved.length) {
      out.push(L.liked + ":");
      var base = /^https?:$/.test(location.protocol) ? new URL(cfg.prefix || "./", location.href).href.split(/[?#]/)[0] : "";
      saved.forEach(function (id) {
        var d = byId[id].dataset;
        out.push("  · No. " + id + " " + d.name + (base ? " — " + base + "demos/" + d.folder + "/" : ""));
      });
    }
    add(L.when, v.when);
    add(L.reach, [v.reach, v.detail].filter(Boolean).join(" · "));
    if (v.message) { out.push(""); out.push(L.message + ":"); out.push(v.message); }
    out.push("");
    out.push("— " + fmt(L.sent_from, { name: cfg.studio.name }));
    return { text: out.join("\n"), business: v.business };
  }

  function updateBrief() {
    if (!form) return;
    var b = composeBrief();
    briefText.textContent = b ? b.text : cfg.contact.brief_empty;
    briefText.classList.toggle("is-empty", !b);
    $("#f-brief").value = b ? b.text : "";
    $("#f-designs").value = saved.map(function (id) { return id + " " + byId[id].dataset.name; }).join(", ");
    if (submitEl) {
      var unchanged = lastSubmission && enquiryPayload() === lastSubmission;
      submitEl.disabled = !cfg.forms_enabled || !window.EmvalueEnquiry || sending || !!unchanged;
      submitEl.textContent = cfg.contact[sending ? "submitting" : unchanged ? "submitted" : "submit"];
      // A changed draft must not retain the previous enquiry's success message.
      if (!sending && lastSubmission && !unchanged && submissionStatus.dataset.state === "success") {
        submissionStatus.hidden = true;
      }
    }
    if (emailEl && emailEl.tagName === "A" && cfg.studio.email) {
      var subject = fmt(cfg.contact.subject, { business: (b && b.business) || cfg.studio.name });
      var body = b ? b.text : "";
      emailEl.href = "mailto:" + encodeURIComponent(cfg.studio.email).replace(/%40/g, "@") +
        "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      // Never silently discard enquiry text. Long URLs vary by email client; offer the full copy fallback.
      var hint = $("#brief-email-hint");
      if (hint) hint.textContent = emailEl.href.length > 6000 ? cfg.contact.email_long : cfg.forms_enabled ? cfg.contact.email_hint : cfg.contact.pending_note;
    }
  }
  var submitEl = $("#brief-submit"), submissionStatus = $("#submission-status");
  var sending = false, lastSubmission = "";
  function enquiryPayload() { return window.EmvalueEnquiry.encode(new FormData(form)); }
  function submissionMessage(message, state) {
    if (!submissionStatus) { status.textContent = message; return; }
    submissionStatus.textContent = message;
    submissionStatus.dataset.state = state;
    submissionStatus.hidden = false;
    if (state !== "sending") submissionStatus.focus({ preventScroll: true });
  }
  if (form) {
    if (cfg.forms_enabled && window.EmvalueEnquiry && $("#submission-note")) $("#submission-note").hidden = true;
    form.addEventListener("input", updateBrief);
    form.addEventListener("change", updateBrief);
    form.elements.name.addEventListener("input", function () { this.setCustomValidity(""); });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (sending) return;
      if (!cfg.forms_enabled || !window.EmvalueEnquiry) { submissionMessage(cfg.contact.pending, "error"); return; }
      form.elements.name.setCustomValidity(val("name") ? "" : cfg.contact.required_name);
      if (!form.reportValidity()) return;
      if (val("bot-field")) { submissionMessage(cfg.contact.failure, "error"); return; }
      updateBrief();
      var payload = enquiryPayload();
      if (payload === lastSubmission) return;
      sending = true;
      form.setAttribute("aria-busy", "true");
      updateBrief();
      submissionMessage(cfg.contact.submitting, "sending");
      // Hold the submitted fields stable until receipt is confirmed or an error is shown.
      var fields = $$("input, select, textarea, .liked button", form);
      fields.forEach(function (field) { field.disabled = true; });
      try {
        await window.EmvalueEnquiry.send(form.action, payload);
        lastSubmission = payload;
        submissionMessage(cfg.contact.success, "success");
      } catch (error) {
        submissionMessage(cfg.contact.failure, "error");
      } finally {
        fields.forEach(function (field) { field.disabled = false; });
        sending = false;
        form.removeAttribute("aria-busy");
        updateBrief();
      }
    });
    if (emailEl && emailEl.tagName === "A") {
      emailEl.addEventListener("click", function () {
        setTimeout(function () { status.textContent = cfg.contact.emailed; }, 300);
      });
    }
    $("#brief-copy").addEventListener("click", function () {
      var b = composeBrief();
      var text = b ? b.text : "";
      if (!text) { status.textContent = cfg.contact.brief_empty; return; }
      copyText(text, briefText).then(function (ok) { status.textContent = ok ? cfg.contact.copied : cfg.contact.copy_failed; });
    });
    var biz = $("#f-business");
    if (biz && !biz.value && brand) biz.value = brand;
  }

  // the clipboard API, else select the text and execCommand("copy"): an element's text, or a temporary field
  function copyText(text, fallbackEl) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return selectFallback(fallbackEl, text); });
    }
    return Promise.resolve(selectFallback(fallbackEl, text));
  }
  function selectFallback(el, text) {
    var field = null, back = document.activeElement;
    try {
      if (el) {
        var r = document.createRange();
        r.selectNodeContents(el);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } else {
        // an open modal dialog makes the page inert, so the field goes inside it
        field = document.createElement("textarea");
        field.className = "sr-only";
        field.value = text;
        field.setAttribute("readonly", "");
        (frontDialog() || document.body).appendChild(field);
        field.focus({ preventScroll: true });
        field.select();
      }
      return !!(document.execCommand && document.execCommand("copy"));
    } catch (e) {
      return false;
    } finally {
      if (field) {
        field.remove();
        if (back && back.focus) back.focus({ preventScroll: true });
      }
    }
  }
  $$(".copy-id").forEach(function (b) {
    b.addEventListener("click", function () {
      copyText(b.dataset.copy, b).then(function (ok) { toast(ok ? cfg.contact.copied : cfg.contact.copy_failed); });
    });
  });

  /* ---------------- start ---------------- */
  readURL(location.search);
  paintPlaceholder();
  paintBrand();
  apply(false);
  renderSaved();
  measure();
  var initial = hashId();
  if (initial) openViewer(initial, { push: false });
  // the head script goes back to the no-JS layout at load if this never runs (hub.js failed to load or threw)
  root.classList.add("hub-ready");
})();
