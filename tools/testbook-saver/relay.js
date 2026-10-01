// Collects the two responses for a test and, once both have arrived, saves them as one
// file: Downloads/testbook-<id>.json. Shows a small badge so you can see it worked.
(() => {
  const got = {};
  const saved = new Set();

  const badge = (msg, ok) => {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;z-index:2147483647;left:12px;bottom:12px;padding:8px 12px;border-radius:8px;
      font:600 13px system-ui;color:#fff;background:${ok ? '#1f7a3f' : '#a33'};box-shadow:0 2px 8px rgba(0,0,0,.3)`;
    (document.body || document.documentElement).appendChild(el);
    setTimeout(() => el.remove(), 6000);
  };

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data?.__tbSaver) return;
    const { id, kind, text } = e.data;
    let body;
    try { body = JSON.parse(text); } catch { return; }
    if (!body?.data) return;
    (got[id] ??= {})[kind] = body.data;
    const g = got[id];
    if (!g.test || !g.answers || saved.has(id)) return;
    saved.add(id);

    const qs = (g.test.sections || []).flatMap(s => s.questions || []);
    const file = JSON.stringify({
      testId: id, title: g.test.title, capturedAt: new Date().toISOString(),
      source: 'testbook api v2 tests/{id} + /answers, saved passively from own browser (testbook-saver extension)',
      test: g.test, answers: g.answers,
    });
    const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `testbook-${id}.json`;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    badge(`Saved ${qs.length} questions: ${g.test.title}`, qs.length > 0);
  });
})();
