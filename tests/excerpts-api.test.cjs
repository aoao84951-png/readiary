const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(overrides = {}) {
  const records = new Map();
  const firebase = {
    firebaseConfigured: () => true,
    getDocument: async (_, id) => id === 'book-1' ? { id } : undefined,
    listDocuments: async collection => [...records.values()].filter(x => x.collection === collection).map(x => x.item),
    setDocument: async (collection, id, data) => { const item = { id, ...data }; records.set(`${collection}/${id}`, { collection, item }); return item; },
    deleteDocument: async (collection, id) => records.delete(`${collection}/${id}`),
    ...overrides,
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('app/api/books/excerpts/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, require: name => name === 'next/server' ? { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } } : firebase });
  return { api: exports, records };
}
const request = body => ({ json: async () => body });
const image = 'data:image/jpeg;base64,/9j/2Q==';
test('multiple excerpts persist independently and deletion preserves siblings', async () => {
  const { api, records } = setup();
  for (const id of ['first', 'second']) assert.equal((await api.POST(request({ bookId: 'book-1', id, image }))).status, 201);
  assert.equal(records.size, 2);
  const result = await api.GET({ nextUrl: new URL('https://example.test?bookId=book-1') });
  assert.equal(result.body.items.length, 2);
  await api.DELETE(request({ bookId: 'book-1', id: 'first' }));
  assert.equal(records.size, 1);
  assert.ok(records.has('books/book-1/excerpts/second'));
});
test('rejects missing books, invalid paths, oversized images and non-image data', async () => {
  const { api, records } = setup();
  assert.equal((await api.POST(request({ bookId: 'missing', id: 'a', image }))).status, 404);
  for (const body of [{ bookId: '../books', id: 'a', image }, { bookId: 'book-1', id: 'a/b', image }, { bookId: 'book-1', id: 'a', image: 'x'.repeat(700001) }, { bookId: 'book-1', id: 'a', image: 'data:text/html;base64,abcd' }]) assert.equal((await api.POST(request(body))).status, 400);
  assert.equal(records.size, 0);
});
test('storage failures are reported without claiming success', async () => {
  const { api } = setup({ setDocument: async () => { throw new Error('offline'); } });
  assert.equal((await api.POST(request({ bookId: 'book-1', id: 'a', image }))).status, 502);
  assert.equal((await setup({ firebaseConfigured: () => false }).api.POST(request({}))).status, 503);
});
