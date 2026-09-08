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
    document: { queryCommandValue: command => command === "foreColor" ? "rgb(255, 0, 0)" : "rgb(255, 255, 0)", queryCommandState: command => command === 'bold' },
    setToolbar: next => toolbar = next,
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(selectionUpdate + '\nupdateToolbar();', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  assert.equal(rangeRef.current, range);
  assert.equal(toolbar.bold, true);
  assert.equal(toolbar.textColor, "#ff0000");
  assert.equal(toolbar.backgroundColor, "#ffff00");
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
  const source = editor.slice(editor.indexOf('  // Native handle movement'), editor.indexOf('  // Paint the saved range'));
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
  const drawerStyle = {setProperty(key, value) {this[key] = value;}};
  const handlers = {};
  const viewport = {offsetTop: 100, height: 350, addEventListener: (name, fn) => handlers[name] = fn, removeEventListener: name => delete handlers[name]};
  let cleanup, restored;
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    adding: true, useEffect: fn => cleanup = fn(), document: {body: {style}, documentElement: {clientHeight: 800}}, drawerRef: {current: {parentElement: shade, style: drawerStyle}},
    window: {innerHeight: 800, scrollX: 0, scrollY: 420, visualViewport: viewport, addEventListener: () => {}, removeEventListener: () => {}, scrollTo: (x, y) => restored = [x, y]},
  });
  assert.equal(style.position, 'fixed'); assert.equal(style.top, '-420px');
  assert.deepEqual(shade.style, {});
  assert.equal(drawerStyle['--editor-viewport-top'], '100px'); assert.equal(drawerStyle['--editor-viewport-height'], '700px');
  assert.equal(drawerStyle['--editor-keyboard-space'], '350px');
  viewport.height = 700; viewport.offsetTop = 0; handlers.resize();
  assert.deepEqual(shade.style, {});
  assert.equal(drawerStyle['--editor-viewport-height'], '800px'); assert.equal(drawerStyle['--editor-viewport-top'], '0px');
  cleanup(); assert.equal(style.position, ''); assert.equal(style.overflow, '');
  assert.deepEqual(restored, [0, 420]); assert.deepEqual(handlers, {});
});

test('mobile dock sits above keyboard and sheet reserves editor scrolling space', () => {
  const style = {};
  const scroller = {style: {setProperty(key, value) {this[key] = value;}}, scrollTop: 0};
  const panel = {style, getBoundingClientRect: () => ({height: 52})};
  vm.runInNewContext(ts.transpileModule(effect, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    panelRef: {current: panel}, rangeRef: {current: {getBoundingClientRect: () => ({top: 280, bottom: 310})}},
    ref: {current: {closest: () => scroller}}, mobile: true, paletteOpen: false, getComputedStyle: () => ({getPropertyValue: () => "34"}),
    window: {visualViewport: {offsetTop: 100, offsetLeft: 0, height: 400, width: 390}},
  });
  assert.equal(style.top, '440px'); assert.equal(style.width, '374px');
  assert.equal(scroller.style['--note-dock-space'], '68px');
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

test('mobile viewport repositioning never overrides manual scrolling', () => {
  const style = {};
  const scroller = {style: {setProperty() {}}, scrollTop: 170};
  const context = {
    panelRef: {current: {style, getBoundingClientRect: () => ({height: 300})}},
    rangeRef: {current: {getBoundingClientRect: () => ({top: 900, bottom: 930})}},
    ref: {current: {closest: () => scroller}}, mobile: true, paletteOpen: false, getComputedStyle: () => ({getPropertyValue: () => "34"}),
    window: {visualViewport: {offsetTop: 0, offsetLeft: 0, height: 700, width: 390}},
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(effect, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, context);
  assert.equal(scroller.scrollTop, 170);
  context.window.visualViewport.height = 400;
  vm.runInContext('positionToolbar()', context);
  assert.equal(scroller.scrollTop, 170);
});

test('palette transition reveals selected text once and user interaction cancels pending reveal', () => {
  const start = editor.indexOf('  // Reveal once');
  const source = editor.slice(start, editor.indexOf('  const updateToolbar', start));
  const scroller = {scrollTop: 200};
  let timer, cancel;
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    mobile: true, toolbar: {}, paletteOpen: true, useEffect: fn => fn(),
    panelRef: {current: {getBoundingClientRect: () => ({top: 400})}},
    rangeRef: {current: {getBoundingClientRect: () => ({top: 450, bottom: 470, height: 20})}},
    ref: {current: {closest: () => scroller}},
    window: {visualViewport: {offsetTop: 0}, setTimeout: fn => {timer = fn; return 1;}, clearTimeout: () => {timer = null;}},
    document: {addEventListener: (event, fn) => {cancel = fn;}},
  });
  assert.equal(scroller.scrollTop, 200);
  timer(); assert.equal(scroller.scrollTop, 282);
  scroller.scrollTop = 100;
  cancel(); assert.equal(timer, null); assert.equal(scroller.scrollTop, 100);
});

test('successive palette commands preserve text range when Safari collapses selection', () => {
  let nodes = [{textContent: 'abcdef'}];
  class Range {
    constructor() { this.startContainer = nodes[0]; this.startOffset = 0; this.endContainer = nodes[0]; this.endOffset = 0; }
    selectNodeContents() { this.startContainer = nodes[0]; this.startOffset = 0; }
    setStart(n, o) { this.startContainer = n; this.startOffset = o; }
    setEnd(n, o) { this.endContainer = n; this.endOffset = o; }
    toString() { const all = nodes.map(n => n.textContent).join(''); const at = (n, o) => nodes.slice(0, nodes.indexOf(n)).reduce((a, x) => a + x.textContent.length, 0) + o; return all.slice(at(this.startContainer, this.startOffset), at(this.endContainer, this.endOffset)); }
    cloneRange() { return Object.assign(new Range(), this); }
  }
  const initial = new Range(); initial.setStart(nodes[0], 1); initial.setEnd(nodes[0], 5);
  const rangeRef = {current: initial};
  let nativeRange = initial, calls = 0;
  const root = {blur() {nativeRange = null;}};
  const source = editor.slice(editor.indexOf('  const apply ='), editor.indexOf('  const togglePalette ='));
  const context = {
    mobile: true, paletteOpen: true, interactingRef: {current: true}, ref: {current: root}, rangeRef,
    window: {getSelection: () => ({removeAllRanges() {nativeRange = null;}, addRange(r) {nativeRange = r;}})},
    NodeFilter: {SHOW_TEXT: 4}, emitValue() {}, updateToolbar() {}, setToolbar() {},
    document: {createRange: () => new Range(), createTreeWalker: () => {let i = -1; return {nextNode() {return !!nodes[++i];}, get currentNode() {return nodes[i];}};},
      execCommand(command) {if (command === 'styleWithCSS') return; assert.equal(nativeRange.toString(), 'bcde'); calls++; nodes = [{textContent: 'a'}, {textContent: 'bcde'}, {textContent: 'f'}]; nativeRange = null;},
    },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(source + '\napply("foreColor", "red"); apply("hiliteColor", "yellow");', {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, context);
  assert.equal(calls, 2); assert.equal(rangeRef.current.toString(), 'bcde');
});

test('standalone palette section reaches screen edge with safe space reserved for its content', () => {
  const style = {};
  vm.runInNewContext(ts.transpileModule(effect, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    panelRef: {current: {style, getBoundingClientRect: () => ({height: 320})}},
    rangeRef: {current: {getBoundingClientRect: () => ({top: 200, bottom: 220})}},
    ref: {current: {closest: () => null}}, mobile: true, paletteOpen: true,
    getComputedStyle: () => ({getPropertyValue: () => '34'}),
    window: {visualViewport: {offsetTop: 0, offsetLeft: 0, height: 800, width: 390}},
  });
  assert.equal(parseFloat(style.top) + 320, 800);
  assert.equal(style.width, "390px");
  assert.equal(style.maxHeight, "702px");
});

test('Safari transparent command result does not replace the real highlight color', () => {
  const root = {nodeType: 1, contains: () => true};
  const span = {parentElement: root};
  const text = {textContent: 'selected', parentElement: span};
  const range = {startContainer: text, startOffset: 0, endContainer: text, endOffset: 8,
    intersectsNode: () => true, getBoundingClientRect: () => ({top: 100, left: 10, width: 30})};
  let toolbar;
  vm.runInNewContext(ts.transpileModule(selectionUpdate + '\nupdateToolbar();', {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, {
    ref: {current: root}, rangeRef: {current: null}, panelRef: {current: null}, interactingRef: {current: false},
    setToolbar: value => toolbar = value, setPaletteOpen() {}, NodeFilter: {SHOW_TEXT: 4},
    getComputedStyle: () => ({backgroundColor: 'rgb(230, 220, 240)'}),
    window: {innerWidth: 390, getSelection: () => ({rangeCount: 1, isCollapsed: false, anchorNode: text, focusNode: text, getRangeAt: () => ({cloneRange: () => range})})},
    document: {queryCommandValue: () => 'transparent', queryCommandState: () => false,
      createTreeWalker: () => {let done = false; return {currentNode: text, nextNode() {if (done) return false; done = true; return true;}};}},
  });
  assert.equal(toolbar.backgroundColor, '#e6dcf0');
});
