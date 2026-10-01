// Runs in the page. Copies the bodies of two responses the page already receives
// (tests/{id} and tests/{id}/answers) and hands them to relay.js. Request URLs carry the
// session token, so they are never passed on - only the test id and the response body.
(() => {
  const RE = /^https:\/\/api-new\.testbook\.com\/api\/v2\/tests\/([0-9a-f]{24})(\/answers)?\?/;
  const hand = (url, text) => {
    const m = RE.exec(url);
    if (!m || typeof text !== 'string' || !text) return;
    window.postMessage({ __tbSaver: true, id: m[1], kind: m[2] ? 'answers' : 'test', text }, location.origin);
  };

  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__tbUrl = String(url);
    return open.call(this, method, url, ...rest);
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (RE.test(this.__tbUrl || '')) {
      this.addEventListener('load', () => {
        if (this.status !== 200) return;
        const t = this.responseType === '' || this.responseType === 'text' ? this.responseText
          : this.responseType === 'json' ? JSON.stringify(this.response) : null;
        hand(this.__tbUrl, t);
      });
    }
    return send.apply(this, args);
  };

  const f = window.fetch;
  window.fetch = async function (input, init) {
    const res = await f.call(this, input, init);
    const url = typeof input === 'string' ? input : input?.url || '';
    if (RE.test(url) && res.ok) res.clone().text().then(t => hand(url, t)).catch(() => {});
    return res;
  };
})();
