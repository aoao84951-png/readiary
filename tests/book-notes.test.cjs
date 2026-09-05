const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const page = fs.readFileSync('app/page.tsx', 'utf8');
const source = page.slice(page.indexOf('function BookNotes('), page.indexOf('\nfunction BasketNoteEditor('));
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source + '\nexports.BookNotes = BookNotes;', { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: exportsObject, require, useState: React.useState, useEffect: React.useEffect, Notes: ({ notes }) => React.createElement('div', null, notes.join(' ')) });
const render = (forgotten, notes, showEmpty) => renderToStaticMarkup(React.createElement(exportsObject.BookNotes, { book: { status: '완독', content_forgotten: forgotten, liked_notes: notes, disliked_notes: [] }, showEmpty }));
test('detail empty state distinguishes forgotten content and missing notes', () => {
  assert.match(render(true, [], true), /내용이 기억나지 않는 작품이에요./);
  assert.match(render(false, [], true), /기록된 감상이 없습니다./);
  assert.match(render(true, ['   '], true), /내용이 기억나지 않는 작품이에요./);
});
test('existing notes remain without memory labels and feed has no empty message', () => {
  assert.equal(render(true, ['예전 감상'], true), '<div>예전 감상</div><div></div>');
  assert.equal(render(true, [], false), '');
  assert.equal(render(false, [], false), '');
});
