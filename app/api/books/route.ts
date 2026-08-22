import { NextRequest, NextResponse } from 'next/server';
import { BookRecord, supabaseRequest } from '@/lib/books';

export async function GET() {
  const response = await supabaseRequest('books?select=*&order=created_at.desc');
  if (!response) return NextResponse.json({ items: [], configured: false });
  if (!response.ok) return NextResponse.json({ error: '저장된 기록을 불러오지 못했습니다.' }, { status: 502 });
  return NextResponse.json({ items: await response.json(), configured: true });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as BookRecord;
  if (!body.title?.trim()) return NextResponse.json({ error: '책 제목을 입력해주세요.' }, { status: 400 });
  const payload = { ...body, title: body.title.trim(), author: body.author?.trim() || '작가 미상' };
  const response = await supabaseRequest('books', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  if (!response) return NextResponse.json({ error: 'Supabase 연결 정보가 아직 설정되지 않았습니다.' }, { status: 503 });
  if (!response.ok) return NextResponse.json({ error: '기록을 저장하지 못했습니다.', detail: await response.text() }, { status: 502 });
  const rows = await response.json();
  return NextResponse.json({ item: rows[0] }, { status: 201 });
}
