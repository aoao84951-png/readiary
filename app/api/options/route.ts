import { NextRequest, NextResponse } from 'next/server';
import { firebaseConfigured, getDocument, setDocument } from '@/lib/firebase';

type OptionSettings = { platforms?: string[]; purchase_methods?: string[]; purchase_methods_customized?: boolean; profile_image?: string };

export async function GET() {
  if (!firebaseConfigured()) return NextResponse.json({ platforms: [], purchase_methods: [], profile_image: "", configured: false });
  try {
    const saved = await getDocument('settings', 'record_options') as OptionSettings | undefined;
    return NextResponse.json({ platforms: saved?.platforms || [], purchase_methods: saved?.purchase_methods || [], purchase_methods_customized: saved?.purchase_methods_customized || false, profile_image: saved?.profile_image || "", configured: true });
  } catch {
    return NextResponse.json({ error: '선택지를 불러오지 못했습니다.' }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const { kind, value, values, action } = await request.json() as { kind?: 'platforms' | 'purchase_methods' | 'profile_image'; value?: string; values?: string[]; action?: 'replace' };
  if (kind === 'profile_image') {
    if (!firebaseConfigured()) return NextResponse.json({ error: 'Firebase 연결 정보가 아직 설정되지 않았습니다.' }, { status: 503 });
    try {
      const saved = await getDocument('settings', 'record_options') as OptionSettings | undefined;
      const item = await setDocument('settings', 'record_options', { ...(saved || {}), profile_image: value || '' });
      return NextResponse.json({ item });
    } catch {
      return NextResponse.json({ error: '프로필 사진을 저장하지 못했습니다.' }, { status: 502 });
    }
  }
  if (kind === 'purchase_methods' && action === 'replace') {
    if (!firebaseConfigured()) return NextResponse.json({ error: 'Firebase 연결 정보가 아직 설정되지 않았습니다.' }, { status: 503 });
    const cleaned = [...new Set((values || []).map((item) => item.trim()).filter(Boolean))];
    try {
      const saved = await getDocument('settings', 'record_options') as OptionSettings | undefined;
      const item = await setDocument('settings', 'record_options', { ...(saved || {}), purchase_methods: cleaned, purchase_methods_customized: true });
      return NextResponse.json({ item });
    } catch {
      return NextResponse.json({ error: '구매방법 순서를 저장하지 못했습니다.' }, { status: 502 });
    }
  }
  const clean = value?.trim();
  if (!kind || !clean) return NextResponse.json({ error: '추가할 선택지를 입력해주세요.' }, { status: 400 });
  if (!firebaseConfigured()) return NextResponse.json({ error: 'Firebase 연결 정보가 아직 설정되지 않았습니다.' }, { status: 503 });
  try {
    const saved = await getDocument('settings', 'record_options') as OptionSettings | undefined;
    const next: OptionSettings & { platforms: string[]; purchase_methods: string[] } = {
      platforms: saved?.platforms || [],
      purchase_methods: saved?.purchase_methods || [],
      purchase_methods_customized: saved?.purchase_methods_customized || false,
      profile_image: saved?.profile_image || '',
    };
    next[kind] = [...new Set([...next[kind], clean])];
    const item = await setDocument('settings', 'record_options', next);
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: '선택지를 저장하지 못했습니다.' }, { status: 502 });
  }
}
