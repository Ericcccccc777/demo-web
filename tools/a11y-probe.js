const q = (s) => [...document.querySelectorAll(s)];
const named = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))) || el.querySelector('img[alt]:not([alt=""]),svg[aria-label],svg title');
const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return (r.width || r.height) && cs.visibility !== 'hidden' && cs.display !== 'none'; };
const inputs = q('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), select, textarea').filter((el) => {
  if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return false;
  if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return false;
  return !el.closest('label');
});
const buttons = q('button, a[href], [role=button]').filter((el) => visible(el) && !named(el));
const out = {
  lang: document.documentElement.lang || '', main: !!document.querySelector('main,[role=main]'),
  h1: q('h1').length, unlabeledInputs: inputs.length, unnamedControls: buttons.length,
  imgNoAlt: q('img:not([alt])').length,
  samples: [...inputs.slice(0, 2).map((e) => 'input:' + (e.id || e.name || e.type)), ...buttons.slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0])],
};
document.title = 'A11Y' + JSON.stringify(out);
