const test = require('node:test');
const assert = require('node:assert/strict');
const { encode, send } = require('../site/assets/enquiry.js');

test('complete bilingual briefs and multiple selected needs survive encoding', () => {
  const message = '小餐馆 & café + 新网站\n'.repeat(200);
  const body = new URLSearchParams(encode([
    ['form-name', 'project-enquiry-zh'], ['email', 'owner@example.com'],
    ['needs', '新网站'], ['needs', '中英双语'], ['brief', message], ['bot-field', '']
  ]));
  assert.equal(body.get('form-name'), 'project-enquiry-zh');
  assert.equal(body.get('email'), 'owner@example.com');
  assert.equal(body.get('needs'), '新网站, 中英双语');
  assert.equal(body.get('brief'), message);
  assert.equal(body.get('bot-field'), '');
});

test('optional discovery source survives encoding, including an empty choice', () => {
  for (const source of ['Google search', 'ChatGPT 等 AI 助手', '']) {
    const fields = new FormData();
    fields.set('form-name', 'project-enquiry-en');
    fields.set('source', source);
    const body = new URLSearchParams(encode(fields));
    assert.equal(body.has('source'), true);
    assert.equal(body.get('source'), source);
  }
});

test('uses the provider POST format and resolves only after acceptance', async () => {
  let calls = 0;
  await send('/','form-name=project-enquiry-en&email=owner%40example.com', {
    fetch: async (url, request) => {
      calls++;
      assert.equal(url, '/');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(new URLSearchParams(request.body).get('email'), 'owner@example.com');
      assert.equal(request.signal.aborted, false);
      return { ok: true, status: 200 };
    }
  });
  assert.equal(calls, 1);
});

test('HTTP failures and network failures never resolve as success', async () => {
  for (const status of [400, 404, 429, 500, 503]) {
    await assert.rejects(send('/', '', {fetch: async () => ({ok:false, status})}), new RegExp(String(status)));
  }
  await assert.rejects(send('/', '', {fetch: async () => { throw new Error('offline'); }}), /offline/);
});

test('a stalled request is aborted and reported as a failure', async () => {
  await assert.rejects(send('/', '', { timeoutMs: 15, fetch: (_url, request) =>
    new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('aborted'))))
  }), /aborted/);
});
