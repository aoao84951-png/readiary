import { NextRequest, NextResponse } from "next/server";

const allowedImageHosts = [
  "ridicdn.net",
  "aladin.co.kr",
  "pstatic.net",
  "kakao.com",
  "kakaocdn.net",
];

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("url");
  if (!value) return NextResponse.json({ error: "이미지 주소가 필요합니다." }, { status: 400 });
  try {
    const url = new URL(value);
    const allowed = url.protocol === "https:" && allowedImageHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (!allowed) return NextResponse.json({ error: "지원하지 않는 이미지 주소입니다." }, { status: 400 });
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 ReadDiary Image Export" } });
    if (!response.ok) return NextResponse.json({ error: "이미지를 불러오지 못했습니다." }, { status: 502 });
    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return NextResponse.json({ error: "이미지 파일이 아닙니다." }, { status: 415 });
    const data = await response.arrayBuffer();
    if (data.byteLength > 12 * 1024 * 1024) return NextResponse.json({ error: "이미지가 너무 큽니다." }, { status: 413 });
    return new NextResponse(data, { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "이미지 주소가 올바르지 않습니다." }, { status: 400 });
  }
}
