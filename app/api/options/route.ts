import { NextRequest, NextResponse } from 'next/server';
import { firebaseConfigured, getDocument, setDocument } from '@/lib/firebase';

type OptionSettings = { platforms?: string[]; purchase_methods?: string[] };

export async function GET() {
  if (!firebaseConfigured()) return NextResponse.json({ platforms: [], purchase_methods: [], configured: false });
  try {
    const saved = await getDocument('settings', 'record_options') as OptionSettings | undefined;
    return NextResponse.json({ platforms: saved?.platforms || [], purchase_methods: saved?.purchase_methods || [], configured: true });
  } catch {
    return NextResponse.json({ error: '선택지를 불러오지 못했습니다.' }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const { kind, value } = await request.json() as { kind?: 'platforms' | 'purchase_methods'; value?: string };
  const clean = value?.trim();
  if (!kind || !clean) return NextResponse.json({ error: '추가할 선택지를 입력해주세요.' }, { status: 400 });
  if (!firebaseConfigured()) return NextResponse.json({ error: 'Firebase 연결 정보가 아직 설정되지 않았습니다.' }, { status: 503 });
  try {
    const saved = await getDocument('settings', 'record_options') as OptionSettings | undefined;
    const next: Required<OptionSettings> = {
      platforms: saved?.platforms || [],
      purchase_methods: saved?.purchase_methods || [],
    };
    next[kind] = [...new Set([...next[kind], clean])];
    const item = await setDocument('settings', 'record_options', next);
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: '선택지를 저장하지 못했습니다.' }, { status: 502 });
  }
}
