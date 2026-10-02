/* Netlify Forms transport. No credentials or enquiry data are stored in this module. */
(function (root) {
  "use strict";
  function encode(entries) {
    var values = new Map();
    for (var pair of entries) {
      var previous = values.get(pair[0]);
      values.set(pair[0], previous === undefined ? String(pair[1]) : previous + ", " + pair[1]);
    }
    return new URLSearchParams(values).toString();
  }
  async function send(url, body, options) {
    options = options || {};
    var controller = new AbortController();
    var request = options.fetch || root.fetch.bind(root);
    var timeout = setTimeout(function () { controller.abort(); }, options.timeoutMs || 20000);
    try {
      var response = await request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body,
        signal: controller.signal,
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error("Enquiry was not accepted: " + response.status);
    } finally {
      clearTimeout(timeout);
    }
  }
  var api = { encode: encode, send: send };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EmvalueEnquiry = api;
})(typeof window !== "undefined" ? window : globalThis);
