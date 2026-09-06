import { NextRequest, NextResponse } from 'next/server';
import { parseRidiAbout } from '@/lib/ridi-about';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || '';
  const category = request.nextUrl.searchParams.get('category') || '';
  if (!/^\d{1,20}$/.test(id)) return NextResponse.json({ about: {} }, { status: 400 });
  const about_url = `https://ridibooks.com/books/${id}`;
  try {
    const response = await fetch(about_url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, signal: AbortSignal.timeout(7000), redirect: 'error' });
    if (!response.ok) return NextResponse.json({ about: { about_url } });
    const html = await response.text();
    return NextResponse.json({ about: { about_url, ...(html.length <= 3_000_000 ? parseRidiAbout(html, category) : {}) } });
  } catch { return NextResponse.json({ about: { about_url } }); }
}
