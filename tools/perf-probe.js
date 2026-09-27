const lcp = await new Promise((res) => { let v = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {} setTimeout(() => res(v), 600); });
let cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
await new Promise((r) => setTimeout(r, 300));
const nav = performance.getEntriesByType('navigation')[0] || {};
const res = performance.getEntriesByType('resource');
const bytes = res.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) + (nav.transferSize || nav.encodedBodySize || 0);
document.title = 'PERF' + JSON.stringify({ lcp_ms: Math.round(lcp), cls: +cls.toFixed(3), dcl_ms: Math.round(nav.domContentLoadedEventEnd || 0), load_ms: Math.round(nav.loadEventEnd || 0), requests: res.length + 1, kb_transferred: Math.round(bytes / 1024), html_kb: Math.round((nav.encodedBodySize || 0) / 1024) });
