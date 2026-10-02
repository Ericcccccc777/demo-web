/* Studio showcase hub. Progressive enhancement: without this file every drawer is a normal link to its demo. */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cfgEl = $("#hub-config");
  if (!cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent);
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fmt = function (s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return k in o ? o[k] : m; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("hd." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("hd." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var smooth = function () { return reduce.matches ? "auto" : "smooth"; };

  /* ---------------- toast ---------------- */
  var toastEl = $("#hub-toast"), toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 3400);
  }

  /* ---------------- header ---------------- */
  var top = $(".top");
  function onScroll() { top.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // language switch keeps the current filters and open drawer
  $$('a[hreflang]').forEach(function (a) {
    a.addEventListener("click", function () {
      a.href = a.getAttribute("href").split(/[?#]/)[0] + location.search + location.hash;
    });
  });

  /* ---------------- data from the server-rendered cards ---------------- */
  var list = $("#drawers");
  var cards = $$(".drawer", list);
  var byId = {};
  cards.forEach(function (c) { byId[c.dataset.id] = c; });
  var allIds = cards.map(function (c) { return c.dataset.id; });

  /* ---------------- try it on (brand name) ---------------- */
  var brand = store.get("brand", "");
  var tryForm = $("#tryon"), tryInput = $("#tryon-name"), tryHint = $("#tryon-hint"), vBrand = $("#v-brand");
  var hintDefault = tryHint.textContent;
  function cleanBrand(s) { return String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 32); }
  function setBrand(v, from) {
    var prev = brand;
    brand = cleanBrand(v);
    store.set("brand", brand);
    if (from !== "hero") tryInput.value = brand;
    if (from !== "viewer") vBrand.value = brand;
    var biz = $("#f-business");
    if (biz && (!biz.value || biz.value === prev)) { biz.value = brand; updateBrief(); }
    sendBrand();
  }
  tryInput.value = brand;
  vBrand.value = brand;
  tryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    setBrand(tryInput.value, "hero");
    tryHint.textContent = brand ? fmt(cfg.hero.tryon_done, { brand: brand }) : cfg.hero.tryon_cleared;
    tryHint.classList.toggle("done", !!brand);
    setTimeout(function () { tryHint.textContent = hintDefault; tryHint.classList.remove("done"); }, 7000);
  });
  var vBrandT;
  vBrand.addEventListener("input", function () {
    clearTimeout(vBrandT);
    vBrandT = setTimeout(function () { setBrand(vBrand.value, "viewer"); }, 180);
  });

  /* ---------------- saved drawers ---------------- */
  var saved = store.get("saved", []).filter(function (id) { return byId[id]; });
  function isSaved(id) { return saved.indexOf(id) !== -1; }
  function toggleSave(id) {
    if (isSaved(id)) saved = saved.filter(function (x) { return x !== id; });
    else saved.push(id);
    store.set("saved", saved);
    renderSaved();
  }
  function renderSaved() {
    cards.forEach(function (c) { $(".drawer-save", c).setAttribute("aria-pressed", String(isSaved(c.dataset.id))); });
    $("#saved-count").textContent = saved.length;
    if (current) $("#v-save").setAttribute("aria-pressed", String(isSaved(current)));
    $("#v-save span").textContent = current && isSaved(current) ? cfg.viewer.saved : cfg.viewer.save;
    renderLiked();
    if (state.saved) apply();
  }

  /* ---------------- filters ---------------- */
  var state = { industry: "all", mood: "", feature: "", q: "", saved: false };
  var chips = $$(".chip");
  var moodSel = $("#mood"), featSel = $("#feature"), search = $("#search"), savedBtn = $("#saved-toggle");
  var countEl = $("#count"), emptyEl = $("#empty");

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
  function paintControls() {
    chips.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.industry === state.industry)); });
    moodSel.value = state.mood; moodSel.classList.toggle("active", !!state.mood);
    featSel.value = state.feature; featSel.classList.toggle("active", !!state.feature);
    if (search.value !== state.q) search.value = state.q;
    savedBtn.setAttribute("aria-pressed", String(state.saved));
  }
  function apply(animate) {
    var run = function () {
      var n = 0;
      cards.forEach(function (c) { var ok = matches(c); c.hidden = !ok; if (ok) n++; });
      countEl.textContent = n === cards.length ? fmt(cfg.box.count_all, { n: n }) : fmt(cfg.box.count_some, { n: n, total: cards.length });
      emptyEl.hidden = n !== 0;
    };
    paintControls();
    if (animate && document.startViewTransition && !reduce.matches) document.startViewTransition(run);
    else run();
    syncURL();
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
  function byIndustryExists(v) { return !!v && chips.some(function (b) { return b.dataset.industry === v; }); }
  function optionExists(sel, v) { return !!v && $$("option", sel).some(function (o) { return o.value === v; }); }

  chips.forEach(function (b) {
    b.addEventListener("click", function () { state.industry = b.dataset.industry; apply(true); });
  });
  moodSel.addEventListener("change", function () { state.mood = moodSel.value; apply(true); });
  featSel.addEventListener("change", function () { state.feature = featSel.value; apply(true); });
  var searchT;
  search.addEventListener("input", function () {
    clearTimeout(searchT);
    searchT = setTimeout(function () { state.q = search.value.trim().slice(0, 60); apply(false); }, 140);
  });
  savedBtn.addEventListener("click", function () { state.saved = !state.saved; apply(true); });
  $("#clear-filters").addEventListener("click", function () {
    state = { industry: "all", mood: "", feature: "", q: "", saved: false };
    apply(true);
  });

  // "See examples" links in Services set filters without reloading
  $$("a[data-filter-link]").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href.charAt(0) !== "?") return;
    a.addEventListener("click", function (e) {
      e.preventDefault();
      readURL(href.split("#")[0]);
      state.saved = false;
      apply(false);
      $("#box").scrollIntoView({ behavior: smooth(), block: "start" });
    });
  });

  // views
  var views = $$(".view-toggle button");
  function setView(v) {
    list.dataset.view = v;
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
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!dlg.showModal) return;
    e.preventDefault();
    openViewer(a.dataset.open, { from: a });
  });

  $("#shuffle").addEventListener("click", function () {
    var pool = visibleIds();
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) openViewer(pick, { from: $("#shuffle") });
  });

  function visibleIds() {
    var vis = cards.filter(function (c) { return !c.hidden; }).map(function (c) { return c.dataset.id; });
    return vis.length ? vis : allIds.slice();
  }

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
    tip.style.top = (tr.top - br.top) + "px";
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
    var boxVisible = false, attractT = null, pulled = null;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { boxVisible = entries[0].isIntersecting; }, { threshold: .3 }).observe(heroBox);
    }
    attractT = setInterval(function () {
      if (pulled) { pulled.classList.remove("pulled"); pulled = null; tip.hidden = !hoverTile; return; }
      if (!boxVisible || hoverTile || document.hidden || reduce.matches || (dlg && dlg.open)) return;
      pulled = tiles[Math.floor(Math.random() * tiles.length)];
      pulled.classList.add("pulled");
      if (window.matchMedia("(hover: hover)").matches) showTip(pulled);
    }, 1900);
  }

  /* ---------------- viewer ---------------- */
  var dlg = $("#viewer"), iframe = $("#v-iframe"), screen = $("#v-screen"), frame = $("#v-frame"), stage = $("#v-stage");
  var panel = $("#v-panel"), infoBtn = $("#v-info"), playBtn = $("#v-play"), progress = $("#v-progress");
  var current = null, order = [], opener = null, pushed = false;
  var DEV = { tablet: { w: 834, h: 1112 }, phone: { w: 390, h: 844 } };
  var device = store.get("device", "desktop");
  if (!DEV[device] && device !== "desktop") device = "desktop";
  var PLAY_MS = 14000, playing = false, playT = null;

  function openViewer(id, opts) {
    opts = opts || {};
    if (!byId[id] || !dlg.showModal) return;
    order = visibleIds();
    if (order.indexOf(id) === -1) order = allIds.slice();
    opener = opts.from || document.activeElement;
    if (!dlg.open) {
      dlg.showModal();
      document.documentElement.classList.add("viewer-open");
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
    var d = byId[id].dataset;
    var src = cfg.prefix + "demos/" + d.folder + "/";
    $("#v-no").textContent = "No. " + id;
    $("#v-name").textContent = d.name;
    $("#v-meta").textContent = d.type + " · " + d.city;
    $("#vp-style").textContent = d.style;
    $("#vp-interaction").textContent = d.interaction;
    $("#vp-lang").textContent = d.lang;
    $("#v-newtab").href = src + (brand ? "?brand=" + encodeURIComponent(brand) : "");
    $("#v-poster").src = $(".drawer-img", byId[id]).src;
    $("#v-loading-text").textContent = fmt(cfg.viewer.loading, { no: id });
    $("#v-pos").textContent = fmt(cfg.viewer.position, { i: order.indexOf(id) + 1, n: order.length });
    $("#v-save").setAttribute("aria-pressed", String(isSaved(id)));
    $("#v-save span").textContent = isSaved(id) ? cfg.viewer.saved : cfg.viewer.save;
    iframe.title = fmt(cfg.viewer.frame_title, { name: d.name });
    screen.classList.remove("loaded");
    iframe.src = src;
    sizeFrame();
    if (playing) schedulePlay();
  }

  iframe.addEventListener("load", function () {
    if (!current || iframe.getAttribute("src") === "about:blank") return;
    screen.classList.add("loaded");
    sendBrand();
  });
  function sendBrand() {
    if (!current || !iframe.contentWindow) return;
    try { iframe.contentWindow.postMessage({ type: "hd:brand", name: brand }, "*"); } catch (e) { /* ignore */ }
  }
  window.addEventListener("message", function (e) {
    if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "hd:ready") sendBrand();
    if (m.type === "hd:key" && m.key === "Escape" && dlg.open) closeViewer();
  });

  function step(delta) {
    if (!current) return;
    var i = order.indexOf(current);
    var next = order[(i + delta + order.length) % order.length];
    load(next);
    try { history.replaceState({ demo: next }, "", location.pathname + location.search + "#demo-" + next); } catch (e) { /* ignore */ }
  }

  function closeViewer(fromHistory) {
    if (!dlg.open) return;
    stopPlay();
    dlg.close();
  }
  dlg.addEventListener("close", function () {
    document.documentElement.classList.remove("viewer-open");
    iframe.src = "about:blank";
    panel.hidden = true;
    infoBtn.setAttribute("aria-expanded", "false");
    var closedId = current;
    current = null;
    if (location.hash.indexOf("#demo-") === 0) {
      if (pushed) { pushed = false; history.back(); }
      else { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ } }
    }
    pushed = false;
    var target = opener && document.contains(opener) && opener.offsetParent !== null && !opener.closest(".hero-box") ? opener : null;
    if (!target && closedId && byId[closedId] && !byId[closedId].hidden) target = $(".drawer-link", byId[closedId]);
    if (target) target.focus({ preventScroll: true });
    if (target && target.closest(".drawer")) {
      var r = target.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) target.scrollIntoView({ block: "center" });
    }
  });
  dlg.addEventListener("cancel", function (e) { e.preventDefault(); closeViewer(); });
  $("#v-close").addEventListener("click", function () { closeViewer(); });
  $("#v-prev").addEventListener("click", function () { step(-1); });
  $("#v-next").addEventListener("click", function () { step(1); });
  $("#v-save").addEventListener("click", function () { if (current) toggleSave(current); });
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
    if (current && !isSaved(current)) toggleSave(current);
    closeViewer();
    setTimeout(function () {
      $("#contact").scrollIntoView({ behavior: smooth(), block: "start" });
      var first = $("#f-name").value ? $("#f-msg") : $("#f-name");
      first.focus({ preventScroll: true });
    }, 80);
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
  if ("ResizeObserver" in window) new ResizeObserver(function () { if (dlg.open) sizeFrame(); }).observe(stage);
  else window.addEventListener("resize", function () { if (dlg.open) sizeFrame(); });

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
  playBtn.addEventListener("click", function () { playing ? stopPlay() : startPlay(); });
  // if the visitor starts using the demo, stop touring
  window.addEventListener("blur", function () {
    setTimeout(function () { if (playing && document.activeElement === iframe) stopPlay(); }, 0);
  });

  // deep links and back button
  function hashId() { var m = /^#demo-(\d{3})$/.exec(location.hash); return m && byId[m[1]] ? m[1] : null; }
  window.addEventListener("popstate", function () {
    var id = hashId();
    if (id) { if (!dlg.open) { dlg.showModal(); document.documentElement.classList.add("viewer-open"); } pushed = false; load(id); }
    else if (dlg.open) { pushed = false; closeViewer(); }
  });

  /* ---------------- brief builder ---------------- */
  var form = $("#brief-form"), briefText = $("#brief-text"), emailEl = $("#brief-email"), status = $("#brief-status");
  var likedList = $("#liked"), likedEmpty = $("#liked-empty");

  function renderLiked() {
    likedList.innerHTML = "";
    saved.forEach(function (id) {
      var d = byId[id].dataset;
      var li = document.createElement("li");
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
      var rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "×";
      rm.setAttribute("aria-label", fmt(cfg.contact.remove, { name: d.name }));
      rm.addEventListener("click", function () { toggleSave(id); });
      li.appendChild(img); li.appendChild(txt); li.appendChild(rm);
      likedList.appendChild(li);
    });
    likedEmpty.hidden = saved.length > 0;
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
      $("#brief-email-hint").textContent = emailEl.href.length > 6000 ? cfg.contact.email_long : cfg.contact.email_hint;
    }
  }
  var submitEl = $("#brief-submit"), submissionStatus = $("#submission-status");
  var sending = false, lastSubmission = "";
  function enquiryPayload() { return window.EmvalueEnquiry.encode(new FormData(form)); }
  function submissionMessage(message, state) {
    submissionStatus.textContent = message;
    submissionStatus.dataset.state = state;
    submissionStatus.hidden = false;
    if (state !== "sending") submissionStatus.focus({ preventScroll: true });
  }
  if (form) {
    if (cfg.forms_enabled && window.EmvalueEnquiry) $("#submission-note").hidden = true;
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

  function copyText(text, fallbackEl) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return selectFallback(fallbackEl); });
    }
    return Promise.resolve(selectFallback(fallbackEl));
  }
  function selectFallback(el) {
    try {
      var r = document.createRange();
      r.selectNodeContents(el);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      return document.execCommand && document.execCommand("copy");
    } catch (e) { return false; }
  }
  $$(".copy-id").forEach(function (b) {
    b.addEventListener("click", function () {
      copyText(b.dataset.copy, b).then(function (ok) { toast(ok ? cfg.contact.copied : cfg.contact.copy_failed); });
    });
  });

  /* ---------------- start ---------------- */
  readURL(location.search);
  apply(false);
  renderSaved();
  var initial = hashId();
  if (initial) openViewer(initial, { push: false });
})();
