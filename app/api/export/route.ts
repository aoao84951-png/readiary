import { NextRequest, NextResponse } from "next/server";

type ExportKind = "feed" | "detail" | "calendar";
type ExportRequest = { html?: string; stylesheets?: string[]; kind?: ExportKind };

const widths: Record<ExportKind, number> = { feed: 700, detail: 760, calendar: 720 };
const maxPayloadLength = 2_000_000;

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(request: NextRequest) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_BROWSER_RENDERING_TOKEN?.trim();
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: "호환 다운로드 설정이 아직 완료되지 않았어요" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxPayloadLength) {
    return NextResponse.json({ error: "내보낼 기록이 너무 커요" }, { status: 413 });
  }

  let input: ExportRequest;
  try { input = await request.json() as ExportRequest; }
  catch { return NextResponse.json({ error: "내보낼 기록을 읽지 못했어요" }, { status: 400 }); }
  const kind = input.kind;
  if (!kind || !Object.hasOwn(widths, kind) || !input.html || input.html.length > maxPayloadLength) {
    return NextResponse.json({ error: "내보낼 화면 정보가 올바르지 않아요" }, { status: 400 });
  }

  const allowedOrigin = request.nextUrl.origin;
  const stylesheets = (input.stylesheets || [])
    .filter((href) => {
      try { return new URL(href).origin === allowedOrigin; }
      catch { return false; }
    })
    .map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">`)
    .join("");
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeAttribute(allowedOrigin)}/">${stylesheets}<style>html,body{margin:0!important;padding:0!important;width:max-content!important;min-width:0!important;background:transparent!important;overflow:visible!important}body{display:block!important}.imageExporting{margin:0!important;animation:none!important}</style></head><body>${input.html}</body></html>`;

  const cloudflareResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      html: documentHtml,
      selector: "#export-root",
      viewport: { width: widths[kind], height: 1200, deviceScaleFactor: 4 },
      screenshotOptions: { type: "png", omitBackground: true, captureBeyondViewport: true },
    }),
  });
  if (!cloudflareResponse.ok) {
    const detail = await cloudflareResponse.text();
    console.error("Browser Run export failed", cloudflareResponse.status, detail.slice(0, 800));
    const message = cloudflareResponse.status === 429
      ? "오늘의 호환 다운로드 무료 사용량을 모두 사용했어요"
      : "서버 Chrome에서 이미지를 만들지 못했어요";
    return NextResponse.json({ error: message }, { status: cloudflareResponse.status === 429 ? 429 : 502 });
  }

  const image = await cloudflareResponse.arrayBuffer();
  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Browser-Ms-Used": cloudflareResponse.headers.get("X-Browser-Ms-Used") || "",
    },
  });
}
