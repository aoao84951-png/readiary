const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const page = fs.readFileSync('app/page.tsx', 'utf8');
const source = page.slice(page.indexOf('const noteColors ='), page.indexOf('\nfunction Notes('));
class Element {
  constructor(tagName, style = {}, children = []) {
    this.tagName = tagName; this.style = { color: '', backgroundColor: '', fontWeight: '', fontStyle: '', textDecoration: '', ...style }; this.dataset = {}; this.childNodes = children;
    for (const child of children) child.parentElement = this;
  }
  getAttribute() { return null; }
}
const exported = {};
vm.runInNewContext(ts.transpileModule(source + '\nObject.assign(exports,{FormattedNote,noteValueToHtml,noteEditorToValue});', { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: exported, require, HTMLElement: Element, Node: { TEXT_NODE: 3 } });
const render = value => renderToStaticMarkup(React.createElement(exported.FormattedNote, { value }));
test('legacy bold underline and colors remain compatible', () => {
  assert.equal(render('**굵게** __밑줄__ {{pink:분홍}}'), '<strong>굵게</strong> <u>밑줄</u> <span class="noteAccent pink">분홍</span>');
  assert.match(exported.noteValueToHtml('{{gold:노랑}}'), /color:#cb912f/);
});
test('combined italic strike text color and highlight render and reopen', () => {
  const value = '**__{{blue:~~^^[[pink:감상]]^^~~}}__**';
  assert.equal(render(value), '<strong><u><span class="noteAccent blue"><s><em><span style="background-color:#fae4ee">감상</span></em></s></span></u></strong>');
  assert.equal(exported.noteValueToHtml(value), '<strong><u><span style="color:#337ea9"><s><em><span style="background-color:#fae4ee">감상</span></em></s></span></u></strong>');
});
test('browser styles serialize all six formats and explicit color resets', () => {
  const text = { nodeType: 3, textContent: '감상' };
  const root = new Element('DIV', {}, [new Element('SPAN', { fontWeight: '700', textDecoration: 'underline line-through', fontStyle: 'italic', color: 'rgb(51, 126, 169)', backgroundColor: 'rgb(250, 228, 238)' }, [text])]);
  assert.equal(exported.noteEditorToValue(root), '**__{{blue:~~^^[[pink:감상]]^^~~}}__**');
  const reset = new Element('SPAN', {color: '#4d4d49', backgroundColor: 'transparent'}, [{ nodeType: 3, textContent: '기본' }]);
  const coloredRoot = new Element('DIV', {}, [new Element('SPAN', {color:'#337ea9',backgroundColor:'#fae4ee'}, [reset])]);
  assert.equal(exported.noteEditorToValue(coloredRoot), '기본');
});
test('plain text and unsafe markup stay plain when opening editor', () => {
  assert.equal(exported.noteValueToHtml('<img src=x onerror=alert(1)>\n글'), '&lt;img src=x onerror=alert(1)&gt;<br>글');
  assert.equal(render('일반 감상'), '일반 감상');
});
