import { NextRequest, NextResponse } from "next/server";
import { firebaseConfigured, getDocument, setDocument } from "@/lib/firebase";

type ExportKind = "feed" | "detail" | "calendar";
type ExportRequest = { html?: string; css?: string; kind?: ExportKind; filename?: string };

const widths: Record<ExportKind, number> = { feed: 700, detail: 760, calendar: 720 };
const maxPayloadLength = 12_000_000;
const dailyBrowserLimitMs = 600_000;

type ExportUsage = { usedMs?: number; count?: number };

function usageDate() {
  return new Date().toISOString().slice(0, 10);
}

async function readUsage() {
  if (!firebaseConfigured()) return { usedMs: 0, count: 0 };
  const saved = await getDocument("export_usage", usageDate()) as ExportUsage | undefined;
  return { usedMs: Number(saved?.usedMs || 0), count: Number(saved?.count || 0) };
}

export async function GET() {
  try {
    const usage = await readUsage();
    return NextResponse.json({
      ...usage,
      averageMs: usage.count ? Math.round(usage.usedMs / usage.count) : 0,
      remainingMs: Math.max(0, dailyBrowserLimitMs - usage.usedMs),
      limitMs: dailyBrowserLimitMs,
      resetTime: "09:00",
    });
  } catch {
    return NextResponse.json({ usedMs: 0, count: 0, averageMs: 0, remainingMs: dailyBrowserLimitMs, limitMs: dailyBrowserLimitMs, resetTime: "09:00" });
  }
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(request: NextRequest) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_BROWSER_RENDERING_TOKEN?.trim();
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: "호환 다운로드 설정이 아직 완료되지 않았어요" }, { status: 503 });
  }

  try {
    const usage = await readUsage();
    if (usage.usedMs >= dailyBrowserLimitMs) {
      return NextResponse.json({ code: "DAILY_LIMIT", error: "오늘의 이멋공 사용량을 모두 소진했어요. 내일 오전 9시 이후 다시 시도해주세요." }, { status: 429 });
    }
  } catch { /* Cloudflare의 실제 한도 응답을 최종 기준으로 계속 진행한다. */ }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxPayloadLength) {
    return NextResponse.json({ error: "내보낼 기록이 너무 커요" }, { status: 413 });
  }

  let input: ExportRequest;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      input = {
        html: String(form.get("html") || ""),
        css: String(form.get("css") || ""),
        kind: String(form.get("kind") || "") as ExportKind,
        filename: String(form.get("filename") || ""),
      };
    } else input = await request.json() as ExportRequest;
  }
  catch { return NextResponse.json({ error: "내보낼 기록을 읽지 못했어요" }, { status: 400 }); }
  const kind = input.kind;
  if (!kind || !Object.hasOwn(widths, kind) || !input.html || input.html.length > maxPayloadLength) {
    return NextResponse.json({ error: "내보낼 화면 정보가 올바르지 않아요" }, { status: 400 });
  }

  const allowedOrigin = request.nextUrl.origin;
  const safeCss = (input.css || "").replace(/<\/style/gi, "<\\/style");
  const fontCss = `
    @font-face{font-family:Pretendard;src:url('${allowedOrigin}/fonts/Pretendard-Regular.ttf') format('truetype');font-weight:400;font-display:block}
    @font-face{font-family:Pretendard;src:url('${allowedOrigin}/fonts/Pretendard-Medium.ttf') format('truetype');font-weight:500;font-display:block}
    @font-face{font-family:Pretendard;src:url('${allowedOrigin}/fonts/Pretendard-SemiBold.ttf') format('truetype');font-weight:600 700;font-display:block}
    @font-face{font-family:Pretendard;src:url('${allowedOrigin}/fonts/Pretendard-ExtraBold.ttf') format('truetype');font-weight:701 900;font-display:block}
    @font-face{font-family:'Courier Prime';src:url('${allowedOrigin}/fonts/CourierPrime-Bold.ttf') format('truetype');font-weight:700;font-display:block}
    @font-face{font-family:'Courier New';src:url('${allowedOrigin}/fonts/CourierPrime-Bold.ttf') format('truetype');font-weight:700;font-display:block}
    @font-face{font-family:'Aa Yeoreum Sori';src:url('${allowedOrigin}/fonts/AaYeoreumSoriMedium.ttf') format('truetype');font-weight:400;font-display:block}
    @font-face{font-family:'Aa Yeoreum Sori';src:url('${allowedOrigin}/fonts/AaYeoreumSori500.woff2') format('woff2');font-weight:500;font-display:block}
    @font-face{font-family:'Aa Yeoreum Sori';src:url('${allowedOrigin}/fonts/AaYeoreumSori550.woff2') format('woff2');font-weight:550;font-display:block}
    @font-face{font-family:'Aa Yeoreum Sori';src:url('${allowedOrigin}/fonts/AaYeoreumSoriSemiBold.woff2') format('woff2');font-weight:600;font-display:block}
    @font-face{font-family:'Aa Yeoreum Sori';src:url('${allowedOrigin}/fonts/AaYeoreumSoriBold.woff2') format('woff2');font-weight:700;font-display:block}
  `;
  const exportFixCss = `
    html,body{margin:0!important;padding:0!important;width:max-content!important;min-width:0!important;background:transparent!important;overflow:visible!important}
    body{display:block!important}.imageExporting{margin:0!important;animation:none!important}
    .imageExporting .metaActions{align-items:center!important;gap:7px!important}
    .imageExporting .genreText,.imageExporting .statusText{display:inline-flex!important;align-items:center!important;height:14px!important;font-size:10px!important;line-height:14px!important;letter-spacing:0!important;vertical-align:middle!important}
    .imageExporting .statusText{transform:translateY(-.15px)}
  `;
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeAttribute(allowedOrigin)}/"><style>${fontCss}${safeCss}${exportFixCss}</style></head><body>${input.html}</body></html>`;

  const accessCookie = request.cookies.get("CF_Authorization")?.value;
  const cookies = accessCookie ? [{
    name: "CF_Authorization",
    value: accessCookie,
    domain: request.nextUrl.hostname,
    path: "/",
  }] : undefined;

  const cloudflareResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      html: documentHtml,
      selector: "#export-root",
      viewport: { width: widths[kind], height: 1200, deviceScaleFactor: 4 },
      screenshotOptions: { type: "png", omitBackground: true, captureBeyondViewport: true },
      gotoOptions: { waitUntil: "networkidle0", timeout: 45_000 },
      waitForTimeout: 1_500,
      ...(cookies ? { cookies } : {}),
    }),
  });
  if (!cloudflareResponse.ok) {
    const detail = await cloudflareResponse.text();
    console.error("Browser Run export failed", cloudflareResponse.status, detail.slice(0, 800));
    const dailyLimitReached = cloudflareResponse.status === 429 && /time limit exceeded|daily browser limit/i.test(detail);
    const message = dailyLimitReached
      ? "오늘의 이멋공 사용량을 모두 소진했어요. 내일 오전 9시 이후 다시 시도해주세요."
      : cloudflareResponse.status === 429
        ? "요청 간격이 너무 짧아요. 10초 후 다시 시도해주세요."
      : "서버 Chrome에서 이미지를 만들지 못했어요";
    return NextResponse.json({ code: dailyLimitReached ? "DAILY_LIMIT" : cloudflareResponse.status === 429 ? "RATE_LIMIT" : "EXPORT_FAILED", error: message }, { status: cloudflareResponse.status === 429 ? 429 : 502 });
  }

  const image = await cloudflareResponse.arrayBuffer();
  const browserMsUsed = Math.max(0, Number(cloudflareResponse.headers.get("X-Browser-Ms-Used") || 0));
  if (browserMsUsed && firebaseConfigured()) {
    try {
      const usage = await readUsage();
      await setDocument("export_usage", usageDate(), { usedMs: usage.usedMs + browserMsUsed, count: usage.count + 1 });
    } catch (error) { console.error("Failed to save Browser Run usage", error); }
  }
  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="readiary-export.png"; filename*=UTF-8''${encodeURIComponent(`${(input.filename || "readiary-export").replace(/[\\/:*?"<>|]/g, "-")}.png`)}`,
      "Cache-Control": "no-store",
      "X-Browser-Ms-Used": String(browserMsUsed),
    },
  });
}
