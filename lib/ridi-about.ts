import type { BookRecord } from './books';
import { characterRoles, type BookCharacter, type CharacterRole } from './book-about';

export type ImportedAbout = Pick<BookRecord, 'about_url' | 'about_summary' | 'about_keywords' | 'about_characters'>;
const decode = (s: string) => s.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#\d+|#x[\da-f]+);/gi, entity => {
  const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" };
  if (named[entity]) return named[entity];
  const n = entity.startsWith('&#x') ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
});
const tags = (s: string) => [...new Set(s.split(/[,，#\n]+/).flatMap(part => part.trim().split(/(?<=\))\s+(?=\S+[공수남녀여](?:\s|$))/)).map(s => s.trim()).filter(Boolean))];
const format = (words: string[]) => [...new Set(words)].map(word => `#${word}`).join(' ');

// Parse only the publisher's explicitly labelled guide, never synopsis/reviews.
export function parseRidiAbout(html: string, category: string): Omit<ImportedAbout, 'about_url'> {
  const island = html.match(/<div id="ISLANDS__GuideTab">([\s\S]*?)(?=<button\b|<script\b)/)?.[1];
  if (!island || !/(?:BL|로맨스) 가이드/.test(island)) return {};
  const text = decode(island.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')).replace(/^(?:BL|로맨스) 가이드/, '').trim();
  return parseGuide(text, category);
}

export function parseGuide(text: string, category: string): Omit<ImportedAbout, 'about_url'> {
  const allowed = characterRoles(category);
  if (!allowed.length) return {};
  // Publishers also group unbulleted Name(role): entries under 인물 소개.
  text = text.replace(/(^|\n)([ \t]*)([가-힣A-Za-z·]{2,20})[ \t]*\((공|수|남주|여주)\)[ \t]*[:：][ \t]*/g, '$1▷ $3($4)\n');
  const blocks = text.split(/(?:^|\n)\s*[▷▶*＊]\s*/).map(s => s.trim()).filter(Boolean);
  const result: Omit<ImportedAbout, 'about_url'> = {};
  const words: string[] = [];
  const characters: BookCharacter[] = [];
  for (const block of blocks) {
    const labelled = block.match(/^(배경\s*\/\s*분야|작품\s*키워드|이럴\s*때\s*보세요)\s*[:：]\s*([\s\S]*)$/);
    if (labelled) {
      if (/이럴/.test(labelled[1])) result.about_summary = labelled[2].trim();
      else words.push(...tags(labelled[2]));
      continue;
    }
    let role: CharacterRole | undefined;
    let name = '';
    let description = '';
    // Name(role), optional age, followed by a separate description line.
    const named = block.match(/^([^\n():：,]{1,30})\s*\((공|수|남주|여주)\)\s*(?:,\s*\d+세)?\s*\n([\s\S]+)$/);
    if (named) { name = named[1].trim(); role = named[2] as CharacterRole; description = named[3].trim(); }
    else {
      const labelledPerson = block.match(/^(공|수|남자\s*주인공|여자\s*주인공|남주|여주)\s*[:：]\s*([\s\S]+)$/);
      if (!labelledPerson) continue;
      role = /남/.test(labelledPerson[1]) ? '남주' : /여/.test(labelledPerson[1]) ? '여주' : labelledPerson[1] as CharacterRole;
      const value = labelledPerson[2].trim();
      const split = value.match(/^([^\n,:：.()\-–—]{1,30})(?:\s*\([^\n)]*\))?\s*(?:[:：\-–—]\s*|\n+)([\s\S]+)$/);
      if (!split) continue;
      name = split[1].trim(); description = split[2].trim();
    }
    // Prose, lists, or multiple names are ambiguous; leave them for manual input.
    if (!role || !allowed.includes(role) || !/^[가-힣A-Za-z·]{2,20}$/.test(name) || !description) continue;
    characters.push({ role, name, description, keywords: '' });
  }
  const roleWords = new Map<CharacterRole, string[]>();
  const general: string[] = [];
  for (const word of words) {
    const base = word.replace(/\([^)]*\)$/g, '');
    let role: CharacterRole | undefined;
    if (/선수$/.test(base)) { general.push(word); continue; }
    if (['복수', '여공남수', '일공다수', '다공일수'].includes(base)) { general.push(word); continue; }
    if (category === 'BL') role = base.endsWith('공') ? '공' : base.endsWith('수') ? '수' : undefined;
    else role = /남$/.test(base) ? '남주' : /[녀여]$/.test(base) ? '여주' : undefined;
    if (role) roleWords.set(role, [...(roleWords.get(role) || []), word]);
    else if (!/별점|평점|리뷰|단행본|할인|\d.*원/.test(word)) general.push(word);
  }
  for (const person of characters) {
    if (characters.filter(other => other.role === person.role).length === 1) person.keywords = format(roleWords.get(person.role) || []);
  }
  if (general.length) result.about_keywords = format(general);
  if (characters.length) result.about_characters = characters;
  return result;
}
