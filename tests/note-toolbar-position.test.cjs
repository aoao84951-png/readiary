const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const page = fs.readFileSync('app/page.tsx', 'utf8');
const editor = page.slice(page.indexOf('function RichNoteTextarea('));
const effect = editor.slice(editor.indexOf('  const positionToolbar ='), editor.indexOf('  useLayoutEffect(positionToolbar')) + '\npositionToolbar();';
function position(top, bottom, height, viewportHeight = 700, visualViewport, mobile = false) {
  const style = {};
  const panel = { style, getBoundingClientRect: () => ({ width: 220, height: style.maxHeight === 'none' ? height : Math.min(height, parseFloat(style.maxHeight)) }) };
  vm.runInNewContext(ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, {
    useLayoutEffect: fn => fn(), panelRef: { current: panel }, rangeRef: { current: { getBoundingClientRect: () => ({ top, bottom, left: 100, width: 50 }) } }, window: { innerWidth: 400, innerHeight: viewportHeight, visualViewport, matchMedia: () => ({matches: mobile}) }, toolbar: {}, paletteOpen: true, mobile: false, colorTab: "text",
  });
  return { visibility: style.visibility, width: parseFloat(style.width), top: parseFloat(style.top), height: Math.min(height, parseFloat(style.maxHeight)) };
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

const selectionUpdate = editor.slice(editor.indexOf('  const updateToolbar ='), editor.indexOf('  useEffect(() => {\n    let start:'));
test('selection handle changes capture the current range and clear a collapsed selection', () => {
  const text = {};
  const range = { getBoundingClientRect: () => ({ top: 300, left: 50, width: 80 }) };
  let selection = { rangeCount: 1, isCollapsed: false, anchorNode: text, focusNode: text, getRangeAt: () => ({ cloneRange: () => range }) };
  let toolbar;
  const rangeRef = { current: null };
  const context = {
    ref: { current: { contains: node => node === text } }, rangeRef, interactingRef: {current: false}, setPaletteOpen: () => {},
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

test('panned visual viewport bounds the expanded desktop palette', () => {
  const panel = position(350, 380, 250, 800, {offsetTop: 180, offsetLeft: 0, height: 300, width: 390}, true);
  assert.equal(panel.width, 288);
  assert.ok(panel.top >= 188);
  assert.ok(panel.top + panel.height <= 342);
  assert.equal(panel.visibility, 'visible');
});
test('offscreen selection hides geometry without placing a popup under the keyboard', () => {
  assert.equal(position(600, 620, 200, 800, {offsetTop: 0, height: 350, width: 390}).visibility, 'hidden');
});

function eventHarness() {
  const handlers = {};
  const panel = {};
  const text = {};
  const outside = {};
  const rangeRef = {current: {}};
  const interactingRef = {current: false};
  let closed = 0, updated = 0;
  const source = editor.slice(editor.indexOf('  useEffect(() => {\n    let start:'), editor.indexOf('  const emitValue'));
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    useEffect: fn => fn(), document: {addEventListener: (name, fn) => handlers[name] = fn},
    panelRef: {current: {contains: node => node === panel}}, ref: {current: {contains: node => node === text}},
    rangeRef, interactingRef, setToolbar: () => closed++, setPaletteOpen: () => {},
    requestAnimationFrame: fn => fn(), updateToolbar: () => updated++,
  });
  const event = (target, x, y) => ({target, clientX: x, clientY: y});
  return {handlers, panel, text, outside, rangeRef, interactingRef, event, closed: () => closed, updated: () => updated};
}
test('scrolling outside the palette preserves it, a deliberate outside tap closes it', () => {
  const h = eventHarness();
  h.handlers.pointerdown(h.event(h.outside, 10, 10));
  h.handlers.pointerup(h.event(h.outside, 10, 100));
  assert.equal(h.closed(), 0);
  assert.ok(h.rangeRef.current);
  h.handlers.pointerdown(h.event(h.outside, 10, 10));
  h.handlers.pointercancel();
  h.handlers.pointerup(h.event(h.outside, 10, 10));
  assert.equal(h.closed(), 0);
  h.handlers.pointerdown(h.event(h.outside, 10, 10));
  h.handlers.pointerup(h.event(h.outside, 10, 10));
  assert.equal(h.closed(), 1);
  assert.equal(h.rangeRef.current, null);
});
test('palette touch keeps selection; editor tap rechecks native selection', () => {
  const h = eventHarness();
  h.handlers.pointerdown(h.event(h.panel, 10, 10));
  h.handlers.pointerup(h.event(h.panel, 10, 10));
  assert.equal(h.closed(), 0);
  assert.equal(h.interactingRef.current, true);
  h.handlers.pointerdown(h.event(h.text, 10, 10));
  h.handlers.pointerup(h.event(h.text, 10, 10));
  assert.equal(h.interactingRef.current, false);
  assert.equal(h.updated(), 1);
});
test('viewport movement only repositions, never re-reads a lost native selection', () => {
  const handlers = {}, viewportHandlers = {};
  let selected = 0, positioned = 0;
  const source = editor.slice(editor.indexOf('  // Native handle movement'), editor.indexOf('  const apply ='));
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    useEffect: fn => fn(), cancelAnimationFrame: () => {}, requestAnimationFrame: fn => fn(),
    Node: class {}, panelRef: {current: null}, updateToolbar: () => selected++, positionToolbar: () => positioned++,
    document: {addEventListener: (name, fn) => handlers[name] = fn},
    window: {addEventListener: (name, fn) => handlers[name] = fn, visualViewport: {addEventListener: (name, fn) => viewportHandlers[name] = fn}},
  });
  handlers.scroll({}); viewportHandlers.resize({}); viewportHandlers.scroll({});
  assert.equal(selected, 0); assert.equal(positioned, 3);
  handlers.selectionchange(); assert.equal(selected, 1);
});

test('record drawer locks the feed, follows keyboard viewport, and restores on close', () => {
  const start = page.indexOf('  useEffect(() => {\n    if (!adding) return;\n    const body');
  const source = page.slice(start, page.indexOf('  }, [adding]);', start) + '  }, [adding]);'.length);
  const style = {position: '', top: '', left: '', width: '', overflow: ''};
  const shade = {style: {}};
  const handlers = {};
  const viewport = {offsetTop: 100, height: 350, addEventListener: (name, fn) => handlers[name] = fn, removeEventListener: name => delete handlers[name]};
  let cleanup, restored;
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    adding: true, useEffect: fn => cleanup = fn(), document: {body: {style}}, drawerRef: {current: {parentElement: shade}},
    window: {scrollX: 0, scrollY: 420, visualViewport: viewport, addEventListener: () => {}, removeEventListener: () => {}, scrollTo: (x, y) => restored = [x, y]},
  });
  assert.equal(style.position, 'fixed'); assert.equal(style.top, '-420px');
  assert.equal(shade.style.top, '100px'); assert.equal(shade.style.height, '350px');
  viewport.height = 700; viewport.offsetTop = 0; handlers.resize();
  assert.equal(shade.style.height, '700px'); assert.equal(shade.style.top, '0px');
  cleanup(); assert.equal(style.position, ''); assert.equal(style.overflow, '');
  assert.deepEqual(restored, [0, 420]); assert.deepEqual(handlers, {});
});

test('mobile dock sits above keyboard and sheet reserves editor scrolling space', () => {
  const style = {};
  const scroller = {style: {}, scrollTop: 0};
  const panel = {style, getBoundingClientRect: () => ({height: 52})};
  vm.runInNewContext(ts.transpileModule(effect, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    panelRef: {current: panel}, rangeRef: {current: {getBoundingClientRect: () => ({top: 280, bottom: 310})}},
    ref: {current: {closest: () => scroller}}, mobile: true,
    window: {visualViewport: {offsetTop: 100, offsetLeft: 0, height: 400, width: 390}},
  });
  assert.equal(style.top, '440px'); assert.equal(style.width, '374px');
  assert.equal(scroller.style.paddingBottom, '76px');
  assert.equal(scroller.scrollTop, 0);
});

test('mobile palette saves selection through blur and restores it when returning to keyboard', () => {
  const source = editor.slice(editor.indexOf('  const togglePalette ='), editor.indexOf('  const labels ='));
  let open = false, focused = 0, blurred = 0, restored = 0;
  const range = {};
  const context = {mobile: true, paletteOpen: false, interactingRef: {current: false},
    ref: {current: {focus: () => focused++, blur: () => blurred++}}, rangeRef: {current: range},
    window: {getSelection: () => ({removeAllRanges: () => {}, addRange: r => {assert.equal(r, range); restored++;}})},
    setPaletteOpen: value => open = value,
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(source + '\ntogglePalette();', {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, context);
  assert.equal(open, true); assert.equal(blurred, 1); assert.equal(context.interactingRef.current, true);
  context.paletteOpen = true;
  vm.runInContext('togglePalette()', context);
  assert.equal(open, false); assert.equal(focused, 1); assert.equal(restored, 1);
});
