const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, URL, require: name => name.endsWith('.css') ? {} : dependencies[name] || require(name) });
  return exports;
}
const helpers = load('lib/book-about.ts');
const { BookAbout, BookAboutEditor } = load('app/book-about.tsx', { '@/lib/book-about': helpers });
const book = { category: 'BL', about_characters: [{ role: '공', name: 'BL 인물', keywords: '#다정공', description: '' }, { role: '남주', name: '로맨스 인물', keywords: '#다정남', description: '' }] };
const render = (component, record) => renderToStaticMarkup(React.createElement(component, { book: record, onChange() {} }));
test('genre selects correct character groups in both editor and detail without changing stored data', () => {
  const before = JSON.stringify(book);
  for (const component of [BookAbout, BookAboutEditor]) {
    assert.match(render(component, book), /BL 인물/);
    assert.doesNotMatch(render(component, book), /로맨스 인물/);
    for (const category of ['로맨스', '로맨스판타지']) {
      const html = render(component, { ...book, category });
      assert.match(html, /로맨스 인물/);
      assert.doesNotMatch(html, /BL 인물/);
    }
    for (const category of ['문학', '일반문학', '']) {
      const html = render(component, { ...book, category });
      assert.doesNotMatch(html, /BL 인물|로맨스 인물|공 추가|수 추가|남주 추가|여주 추가/);
    }
  }
  assert.equal(JSON.stringify(book), before);
});
test('old records stay empty, memory flag works alone, unsafe links never render', () => {
  assert.equal(render(BookAbout, { category: 'BL' }), '');
  assert.equal(render(BookAbout, { category: '문학', content_forgotten: true }), '');
  assert.equal(render(BookAbout, { category: '문학', about_url: 'javascript:alert(1)' }), '');
  assert.match(render(BookAbout, { category: '문학', about_keywords: '#현대물 #현대물, 재회', about_summary: '소개' }), /#재회/);
});
test('book updates preserve about data along with previous reading notes', async () => {
  let saved;
  const api = load('app/api/books/route.ts', {
    'next/server': { NextResponse: { json: body => body } },
    '@/lib/firebase': { firebaseConfigured: () => true, setDocument: async (_, id, data) => { saved = { id, ...data }; return saved; } },
  });
  const payload = { ...book, id: 'test', title: '기록', sales_discontinued: true, liked_notes: ['예전 감상'], content_forgotten: true, about_keywords: '#현대물', about_summary: '짧은 소개' };
  await api.PATCH({ json: async () => payload });
  assert.equal(saved.content_forgotten, true);
  assert.equal(saved.sales_discontinued, true);
  assert.deepEqual(saved.about_characters, payload.about_characters);
  assert.deepEqual(saved.liked_notes, ['예전 감상']);
  await api.PATCH({ json: async () => ({ ...payload, sales_discontinued: false }) });
  assert.equal(saved.sales_discontinued, false);
  assert.deepEqual(saved.liked_notes, ['예전 감상']);
});

test('ABOUT offers editing only when content and an edit action are available', () => {
  const record = { category: '문학', about_summary: '소개' };
  const editable = renderToStaticMarkup(React.createElement(BookAbout, { book: record, onEdit() {} }));
  assert.match(editable, /aria-label="작품 소개 수정"/);
  assert.doesNotMatch(render(BookAbout, record), /aria-label="작품 소개 수정"/);
  assert.equal(renderToStaticMarkup(React.createElement(BookAbout, { book: { category: '문학' }, onEdit() {} })), '');
});

test('introduction dialog consumes Escape and dismisses only a complete outside press', () => {
  const refs = [];
  const { BookAboutField } = load('app/book-about.tsx', {
    '@/lib/book-about': helpers,
    react: { ...React, useEffect() {}, useRef(value) { const ref = { current: value }; refs.push(ref); return ref; } },
  });
  const tree = BookAboutField({ book: { category: '문학' }, onChange() {} });
  const dialog = tree.props.children.find(child => child.type === 'dialog');
  let closes = 0;
  const element = { close() { closes++; }, getBoundingClientRect: () => ({ left: 20, right: 320, top: 20, bottom: 500 }) };
  refs[0].current = element;
  const event = (x, target = element) => ({ target, clientX: x, clientY: 100, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } });
  const escape = { ...event(100), key: 'Escape' };
  dialog.props.onKeyDown(escape);
  assert.equal(closes, 1);
  assert.equal(escape.stopped, true);
  assert.equal(escape.prevented, true);
  dialog.props.onPointerDown(event(100));
  dialog.props.onPointerUp(event(0));
  assert.equal(closes, 1, 'dragging from the dialog to its backdrop must not close it');
  dialog.props.onPointerDown(event(100, {}));
  dialog.props.onPointerUp(event(100, {}));
  assert.equal(closes, 1, 'clicking an input must not close it');
  dialog.props.onPointerDown(event(0));
  dialog.props.onPointerCancel();
  dialog.props.onPointerUp(event(0));
  assert.equal(closes, 1, 'cancelled gestures must not close it');
  dialog.props.onPointerDown(event(0));
  dialog.props.onPointerUp(event(0));
  assert.equal(closes, 2);
});
