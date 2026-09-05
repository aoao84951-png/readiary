import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument, firebaseConfigured, getDocument, listDocuments, setDocument } from '@/lib/firebase';

const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,128}$/.test(id);
const collection = (id: string) => `books/${id}/excerpts`;

export async function GET(request: NextRequest) {
  const bookId = request.nextUrl.searchParams.get('bookId');
  if (!validId(bookId)) return NextResponse.json({ error: '책을 찾지 못했어요.' }, { status: 400 });
  if (!firebaseConfigured()) return NextResponse.json({ error: '저장소에 연결하지 못했어요.' }, { status: 503 });
  try {
    const items = await listDocuments(collection(bookId));
    return NextResponse.json({ items: (items || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) });
  } catch { return NextResponse.json({ error: '발췌를 불러오지 못했어요.' }, { status: 502 }); }
}

export async function POST(request: NextRequest) {
  if (!firebaseConfigured()) return NextResponse.json({ error: '저장소에 연결하지 못했어요.' }, { status: 503 });
  try {
    const { bookId, id, image } = await request.json() as { bookId?: unknown; id?: unknown; image?: unknown };
    if (!validId(bookId) || !validId(id) || typeof image !== 'string' || image.length > 700_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      return NextResponse.json({ error: '올바른 이미지 파일을 선택해주세요.' }, { status: 400 });
    }
    if (!await getDocument('books', bookId)) return NextResponse.json({ error: '책을 찾지 못했어요.' }, { status: 404 });
    const item = await setDocument(collection(bookId), id, { image, created_at: new Date().toISOString() });
    return NextResponse.json({ item }, { status: 201 });
  } catch { return NextResponse.json({ error: '발췌를 저장하지 못했어요. 다시 시도해주세요.' }, { status: 502 }); }
}

export async function DELETE(request: NextRequest) {
  if (!firebaseConfigured()) return NextResponse.json({ error: '저장소에 연결하지 못했어요.' }, { status: 503 });
  try {
    const { bookId, id } = await request.json() as { bookId?: unknown; id?: unknown };
    if (!validId(bookId) || !validId(id)) return NextResponse.json({ error: '발췌를 찾지 못했어요.' }, { status: 400 });
    await deleteDocument(collection(bookId), id);
    return NextResponse.json({ id });
  } catch { return NextResponse.json({ error: '발췌를 삭제하지 못했어요.' }, { status: 502 }); }
}
