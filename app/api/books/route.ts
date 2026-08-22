import { NextRequest, NextResponse } from 'next/server';
import { BookRecord } from '@/lib/books';
import { createDocument, firebaseConfigured, listDocuments, setDocument } from '@/lib/firebase';

export async function GET() {
  if (!firebaseConfigured()) return NextResponse.json({ items: [], configured: false });
  try {
    const items = await listDocuments('books');
    return NextResponse.json({ items: (items || []).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))), configured: true });
  } catch { return NextResponse.json({ error: '저장된 기록을 불러오지 못했습니다.' }, { status: 502 }); }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as BookRecord;
  if (!body.title?.trim()) return NextResponse.json({ error: '책 제목을 입력해주세요.' }, { status: 400 });
  const payload = { ...body, title: body.title.trim(), author: body.author?.trim() || '작가 미상', created_at: new Date().toISOString() };
  if (!firebaseConfigured()) return NextResponse.json({ error: 'Firebase 연결 정보가 아직 설정되지 않았습니다.' }, { status: 503 });
  try {
    const item = await createDocument('books', payload as unknown as Record<string,unknown>);
    const productNo = body.source_url?.match(/[?&]productNo=([0-9]+)/)?.[1];
    if (productNo && body.platform === '네이버시리즈' && /^https:\/\/comicthumb-phinf\.pstatic\.net\//.test(body.cover_url || '')) {
      await setDocument('naver_covers', productNo, { cover_url: body.cover_url, title: body.title, updated_at: new Date().toISOString() });
    }
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: '기록을 저장하지 못했습니다.', detail: error instanceof Error ? error.message : '' }, { status: 502 }); }
}
