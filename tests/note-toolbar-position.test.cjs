const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const page = fs.readFileSync('app/page.tsx', 'utf8');
const editor = page.slice(page.indexOf('function RichNoteTextarea('));
const effect = editor.slice(editor.indexOf('  useLayoutEffect(() => {'), editor.indexOf('  useEffect(() => {\n    const close'));
function position(top, bottom, height, viewportHeight = 700) {
  const style = {};
  const panel = { style, getBoundingClientRect: () => ({ width: 220, height: style.maxHeight === 'none' ? height : Math.min(height, parseFloat(style.maxHeight)) }) };
  vm.runInNewContext(ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, {
    useLayoutEffect: fn => fn(), panelRef: { current: panel }, rangeRef: { current: { getBoundingClientRect: () => ({ top, bottom, left: 100, width: 50 }) } }, window: { innerWidth: 400, innerHeight: viewportHeight }, toolbar: {}, paletteOpen: true, mobile: false,
  });
  return { top: parseFloat(style.top), height: Math.min(height, parseFloat(style.maxHeight)) };
}
test('expanded palette stays above selection when room exists', () => {
  const panel = position(400, 420, 250);
  assert.equal(panel.top + panel.height, 392);
});
test('selection near top places expanded palette below text', () => {
  assert.equal(position(80, 100, 250).top, 108);
});
test('limited vertical room scrolls palette instead of covering selected text', () => {
  const panel = position(180, 200, 250, 400);
  assert.equal(panel.top, 208);
  assert.ok(panel.top + panel.height <= 392);
});
test('collapsed toolbar also respects selected text bounds', () => {
  const panel = position(100, 120, 40);
  assert.equal(panel.top + panel.height, 92);
});

const selectionUpdate = editor.slice(editor.indexOf('  const updateToolbar ='), editor.indexOf('  // iOS selection handles'));
test('selection handle changes capture the current range and clear a collapsed selection', () => {
  const text = {};
  const range = { getBoundingClientRect: () => ({ top: 300, left: 50, width: 80 }) };
  let selection = { rangeCount: 1, isCollapsed: false, anchorNode: text, focusNode: text, getRangeAt: () => ({ cloneRange: () => range }) };
  let toolbar;
  const rangeRef = { current: null };
  const context = {
    ref: { current: { contains: node => node === text } }, rangeRef,
    panelRef: { current: { contains: () => false } },
    window: { getSelection: () => selection, innerWidth: 390 },
    document: { queryCommandState: command => command === 'bold' },
    setToolbar: next => toolbar = next,
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(selectionUpdate + '\nupdateToolbar();', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  assert.equal(rangeRef.current, range);
  assert.equal(toolbar.bold, true);
  selection = { ...selection, isCollapsed: true };
  vm.runInContext('updateToolbar()', context);
  assert.equal(rangeRef.current, null);
  assert.equal(toolbar, null);
});
