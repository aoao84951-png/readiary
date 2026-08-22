import { NextRequest, NextResponse } from 'next/server';

const allowedHosts = new Set([
  'blogfiles.pstatic.net',
  'postfiles.pstatic.net',
  'search.pstatic.net',
  'comicthumb-phinf.pstatic.net',
]);

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('url');
  if (!source) return new NextResponse('Missing image URL', { status: 400 });

  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) {
      return new NextResponse('Image host not allowed', { status: 403 });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://blog.naver.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('image/')) {
      return new NextResponse('Image unavailable', { status: 404 });
    }

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    });
  } catch {
    return new NextResponse('Invalid image URL', { status: 400 });
  }
}
