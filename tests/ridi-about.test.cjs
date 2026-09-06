const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(path, deps = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: key => deps[key] || require(key) });
 return exports;
}
const parser = load('lib/ridi-about.ts', { './book-about': load('lib/book-about.ts') });
test('explicit guide separates names, role keywords, summary, and general tags', () => {
 const result = parser.parseGuide('▷배경/분야: 현대물, 학원/캠퍼스물\n▷작품 키워드: 질투, 연하공, (새싹)광공, 고조선공(고지식하다는뜻) 직진공, 미인수, 연하공\n▷ 천제환(공), 22세\n선수 설명.\n▷ 여선웅(수), 25세\n인물 설명.\n▷이럴 때 보세요: 직진하는 이야기가 보고 싶을 때.\n▷공감 글귀: 인용문', 'BL');
 assert.equal(result.about_keywords, '#현대물 #학원/캠퍼스물 #질투');
 assert.equal(result.about_summary, '직진하는 이야기가 보고 싶을 때.');
 assert.equal(result.about_characters[0].name, '천제환');
 assert.equal(result.about_characters[0].keywords, '#연하공 #(새싹)광공 #고조선공(고지식하다는뜻) #직진공');
 assert.equal(result.about_characters[1].keywords, '#미인수');
 assert.equal(result.about_characters[1].description, '인물 설명.');
});
test('romance supports explicit labelled names and leaves ambiguous people empty', () => {
 const result = parser.parseGuide('* 작품 키워드: #현대물 #직진남 #다정녀\n* 남자 주인공: 김우결 - 설명\n* 여자 주인공: 기영제\n설명', '로맨스');
 assert.equal(result.about_characters[0].role, '남주');
 assert.equal(result.about_characters[1].keywords, '#다정녀');
 assert.equal(parser.parseGuide('* 남자 주인공: 삶을 움켜쥔 남자, 교수 김아무개', '로맨스').about_characters, undefined);
});
test('multiple same-role characters do not receive guessed shared keywords', () => {
 const result = parser.parseGuide('▷작품 키워드: 집착공\n▷ 홍길동(공)\n설명\n▷ 김길동(공)\n다른 설명', 'BL');
 assert.ok(result.about_characters.every(person => person.keywords === ''));
});
test('no guide, blocked page, and mismatched category yield no guessed data', () => {
 for (const html of ['<h1>Just a moment...</h1>', '<p>작품 키워드: 현대물</p>']) assert.equal(JSON.stringify(parser.parseRidiAbout(html, 'BL')), '{}');
 assert.equal(JSON.stringify(parser.parseGuide('▷작품 키워드: 현대물', '문학')), '{}');
});

test('grouped inline character descriptions are split without mixing the next person', () => {
 const result = parser.parseGuide('* 배경/분야: 현대물, 스포츠물\n* 작품 키워드: #미남공 #천연수 #전직야구선수\n* 인물 소개\n백도준(공): 메이저리거.\n선수 설명 두 번째 줄.\n\n권은기(수): 전직 선수.\n학생 설명.\n* 이럴 때 보세요: 쌍방구원 이야기', 'BL');
 assert.equal(result.about_characters.length, 2);
 assert.equal(result.about_characters[0].name, '백도준');
 assert.equal(result.about_characters[0].description, '메이저리거.\n선수 설명 두 번째 줄.');
 assert.equal(result.about_characters[0].keywords, '#미남공');
 assert.equal(result.about_characters[1].name, '권은기');
 assert.equal(result.about_characters[1].description, '전직 선수.\n학생 설명.');
 assert.equal(result.about_characters[1].keywords, '#천연수');
 assert.match(result.about_keywords, /#전직야구선수/);
});
