export type CharacterRole = '공' | '수' | '남주' | '여주';
export type BookCharacter = { role: CharacterRole; name: string; keywords: string; description: string };
export function characterRoles(category: string): CharacterRole[] {
  if (category === 'BL') return ['공', '수'];
  if (category === '로맨스' || category === '로맨스판타지') return ['남주', '여주'];
  return [];
}
export function keywordList(value = ''): string[] {
  return [...new Set(value.split(/[#，,\n]+/).map(word => word.trim()).filter(Boolean))];
}
export function introductionLink(value = ''): string | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
